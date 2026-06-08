import type { Command } from "commander"
import { theme } from "../theme"
import { hostname } from "node:os"

export function registerDistributed(program: Command) {
  const distributed = program
    .command("distributed")
    .description("Distributed runtime — multi-host worker pool, leader election, encrypted transport")

  distributed
    .command("start")
    .description("Start distributed runtime node")
    .option("--port <port>", "Listen port", "4578")
    .option("--role <role>", "Node role: leader or worker", "worker")
    .option("--leader <host:port>", "Leader address (required for workers)")
    .option("--secret <key>", "Cluster shared secret")
    .option("--tags <tags...>", "Node tags")
    .action(handleStart)

  distributed.command("status").description("Show cluster status").action(handleStatus)

  distributed.command("workers").description("List all workers in the cluster").action(handleWorkers)

  distributed.command("worker <id>").description("Show worker details").action(handleWorker)

  distributed.command("task <type> <payload>").description("Dispatch a task to the best worker").action(handleTask)

  distributed.command("info").description("Show this node's distributed info").action(handleInfo)
}

let currentPool: import("../../distributed").WorkerPool | null = null

async function handleStart(opts: { port?: string; role?: string; leader?: string; secret?: string; tags?: string[] }) {
  const { WorkerPool } = await import("../../distributed")

  const secret = opts.secret ?? process.env.AEGIS_CLUSTER_SECRET ?? "aegis-default-secret"
  const nodeId = `node-${hostname()}-${opts.port}`

  let leaderHost: string | undefined
  let leaderPort: number | undefined

  if (opts.leader) {
    const parts = opts.leader.split(":")
    leaderHost = parts[0]
    leaderPort = parseInt(parts[1] ?? "4578", 10)
  }

  const pool = new WorkerPool({
    nodeId,
    role: (opts.role as "leader" | "worker") ?? "worker",
    leaderHost,
    leaderPort,
    listenPort: parseInt(opts.port ?? "4578", 10),
    secret,
  })

  await pool.start()
  currentPool = pool

  const local = pool.getLocalInfo()
  if (opts.tags) local.tags.push(...opts.tags)

  console.log(theme.success(`\n  ✓ Distributed node started`))
  console.log(`    ${theme.bold("Node ID:")}  ${theme.dim(local.id)}`)
  console.log(`    ${theme.bold("Role:")}     ${theme.accent(pool.isLeader() ? "leader" : "worker")}`)
  console.log(`    ${theme.bold("Port:")}     ${theme.dim(String(local.port))}`)
  console.log()

  // Handle graceful shutdown
  async function shutdownDistributed() {
    console.log(theme.warn("\n  Shutting down distributed node..."))
    try {
      await pool.stop()
    } catch {
      /* ignore pool stop failure */
    }
    process.exit(0)
  }
  process.on("SIGINT", shutdownDistributed)
  process.on("SIGTERM", shutdownDistributed)

  // Keep alive
  await new Promise(() => {})
}

async function handleStatus() {
  if (!currentPool) {
    console.log(theme.error("\n  Distributed node not running. Start one with `aegis distributed start`\n"))
    return
  }

  const stats = currentPool.getStats()
  const local = currentPool.getLocalInfo()

  console.log(theme.heading("\n  Cluster Status\n"))
  console.log(`  ${theme.bold("Node ID:")}    ${theme.dim(local.id)}`)
  console.log(`  ${theme.bold("Role:")}       ${theme.accent(currentPool.isLeader() ? "leader" : "worker")}`)
  console.log(`  ${theme.bold("Leader:")}     ${stats.leader ? theme.dim(stats.leader) : theme.warn("none")}`)
  console.log(`  ${theme.bold("Term:")}       ${theme.dim(String(stats.term))}`)
  console.log(`  ${theme.bold("Workers:")}    ${theme.dim(String(stats.totalWorkers))}`)
  console.log(`  ${theme.bold("Ready:")}      ${theme.dim(String(stats.readyWorkers))}`)
  console.log(
    `  ${theme.bold("Capacity:")}   ${theme.dim(`${stats.totalCapacity.cpu} CPU, ${stats.totalCapacity.memory} MB, ${stats.totalCapacity.agents} agents`)}`,
  )
  console.log()
}

async function handleWorkers() {
  if (!currentPool) {
    console.log(theme.error("\n  Distributed node not running. Start one with `aegis distributed start`\n"))
    return
  }

  const workers = currentPool.listWorkers()

  if (workers.length === 0) {
    console.log(theme.dim("\n  No workers in cluster.\n"))
    return
  }

  console.log(theme.heading(`\n  Workers (${workers.length})\n`))

  for (const w of workers) {
    const statusIcon =
      w.status === "ready" ? theme.success("●") : w.status === "offline" ? theme.error("●") : theme.warn("●")
    console.log(`  ${statusIcon} ${theme.bold(w.id)}`)
    console.log(`      hostname: ${theme.dim(w.hostname)}`)
    console.log(`      status:   ${w.status === "ready" ? theme.success(w.status) : theme.warn(w.status)}`)
    console.log(`      cpu:      ${theme.dim(String(w.capacity.cpu))}`)
    console.log(`      memory:   ${theme.dim(`${w.capacity.memory} MB`)}`)
    console.log(`      agents:   ${theme.dim(`${w.capacity.agents}/${w.capacity.maxAgents}`)}`)
    console.log()
  }
}

async function handleWorker(id: string) {
  if (!currentPool) {
    console.log(theme.error("\n  Distributed node not running. Start one with `aegis distributed start`\n"))
    return
  }

  const worker = currentPool.listWorkers().find((w) => w.id === id)
  if (!worker) {
    console.log(theme.error(`\n  Worker "${id}" not found\n`))
    return
  }

  console.log(theme.heading(`\n  Worker: ${worker.id}\n`))
  console.log(`  ${theme.bold("Hostname:")}    ${theme.dim(worker.hostname)}`)
  console.log(`  ${theme.bold("Port:")}        ${theme.dim(String(worker.port))}`)
  console.log(
    `  ${theme.bold("Status:")}      ${worker.status === "ready" ? theme.success(worker.status) : theme.warn(worker.status)}`,
  )
  console.log(`  ${theme.bold("CPU:")}         ${theme.dim(String(worker.capacity.cpu))}`)
  console.log(`  ${theme.bold("Memory:")}      ${theme.dim(`${worker.capacity.memory} MB`)}`)
  console.log(`  ${theme.bold("GPU:")}         ${worker.capacity.gpu ? theme.success("yes") : theme.dim("no")}`)
  console.log(`  ${theme.bold("Agents:")}      ${theme.dim(`${worker.capacity.agents}/${worker.capacity.maxAgents}`)}`)
  console.log(
    `  ${theme.bold("Tags:")}        ${worker.tags.length > 0 ? theme.dim(worker.tags.join(", ")) : theme.dim("none")}`,
  )
  console.log(`  ${theme.bold("Started:")}     ${theme.dim(worker.startedAt)}`)
  console.log(`  ${theme.bold("Heartbeat:")}   ${theme.dim(worker.lastHeartbeat)}`)
  console.log()
}

async function handleTask(type: string, payload: string) {
  if (!currentPool) {
    console.log(theme.error("\n  Distributed node not running. Start one with `aegis distributed start`\n"))
    return
  }

  const { CapacityPlacer } = await import("../../distributed")
  const placer = new CapacityPlacer(currentPool)

  let parsedPayload: unknown
  try {
    parsedPayload = JSON.parse(payload)
  } catch {
    parsedPayload = payload
  }

  const placement = placer.findBest({ agentType: type })
  if (!placement) {
    console.log(theme.error("\n  No available worker for task\n"))
    return
  }

  console.log(
    theme.info(
      `\n  Dispatching task "${type}" to ${theme.dim(placement.workerId)} (score: ${placement.score.toFixed(2)})`,
    ),
  )
  console.log()

  try {
    const result = await currentPool.sendTask(placement.workerId, {
      id: `task-${Date.now().toString(36)}`,
      type,
      payload: parsedPayload,
    })
    console.log(theme.success("  ✓ Task completed"))
    console.log(`  Result: ${theme.dim(JSON.stringify(result, null, 2))}`)
    console.log()
  } catch (err: any) {
    console.log(theme.error(`  ✗ Task failed: ${err.message ?? String(err)}`))
    console.log()
  }
}

async function handleInfo() {
  if (!currentPool) {
    console.log(theme.error("\n  Distributed node not running. Start one with `aegis distributed start`\n"))
    return
  }

  const local = currentPool.getLocalInfo()
  const leader = currentPool.getLeader()

  console.log(theme.heading("\n  Node Info\n"))
  console.log(`  ${theme.bold("ID:")}         ${theme.dim(local.id)}`)
  console.log(`  ${theme.bold("Hostname:")}   ${theme.dim(local.hostname)}`)
  console.log(`  ${theme.bold("Port:")}       ${theme.dim(String(local.port))}`)
  console.log(
    `  ${theme.bold("Status:")}     ${local.status === "ready" ? theme.success(local.status) : theme.warn(local.status)}`,
  )
  console.log(`  ${theme.bold("Role:")}       ${theme.accent(currentPool.isLeader() ? "leader" : "worker")}`)
  console.log(`  ${theme.bold("Leader:")}     ${leader ? theme.dim(leader.id) : theme.warn("none")}`)
  console.log(`  ${theme.bold("CPU:")}        ${theme.dim(String(local.capacity.cpu))}`)
  console.log(`  ${theme.bold("Memory:")}     ${theme.dim(`${local.capacity.memory} MB`)}`)
  console.log(`  ${theme.bold("Agents:")}     ${theme.dim(`${local.capacity.agents}/${local.capacity.maxAgents}`)}`)
  console.log(
    `  ${theme.bold("Tags:")}       ${local.tags.length > 0 ? theme.dim(local.tags.join(", ")) : theme.dim("none")}`,
  )
  console.log()
}

import type { Command } from "commander"
import { theme } from "../theme"
import { agentManager } from "../../agent/manager"
import {
  getAgentType,
  isValidAgentType,
  getPrimaryAgentTypes,
  getSubagentTypes,
  type AgentTypeName,
} from "../../agent/agent-types"
import type { AgentLogLevel } from "../../agent/types"

export function registerAgent(program: Command) {
  const agent = program.command("agent").alias("a").description("Manage AI agents")

  // ── types ──────────────────────────────────────────────────────────
  agent
    .command("types")
    .description("List all available agent types")
    .action(() => {
      const primary = getPrimaryAgentTypes()
      const subagents = getSubagentTypes()

      console.log(theme.heading("Available Agent Types:\n"))

      console.log(theme.bold("  PRIMARY AGENTS:"))
      for (const t of primary) {
        const modelInfo = t.modelHint ? theme.dim(` [${t.modelHint}]`) : ""
        console.log(`    ${theme.accent(t.name.padEnd(12))} ${t.description}${modelInfo}`)
      }

      console.log(`\n  ${theme.bold("SUBAGENTS:")}`)
      for (const t of subagents) {
        const modelInfo = t.modelHint ? theme.dim(` [${t.modelHint}]`) : ""
        console.log(`    ${theme.accent(t.name.padEnd(12))} ${t.description}${modelInfo}`)
      }

      console.log(`\nUse: ${theme.dim("aegis agent spawn <name> --type <type>")}`)
    })

  // ── list ──────────────────────────────────────────────────────────
  agent
    .command("list")
    .alias("ls")
    .description("List all agents")
    .option("-s, --status <status>", "Filter by status (running, idle, stopped, error)")
    .option("--tag <tag>", "Filter by tag")
    .option("--type <type>", "Filter by agent type")
    .action((opts: { status?: string; tag?: string; type?: string }) => {
      const filter: { status?: string; tag?: string; agentType?: string } = {}
      if (opts.status) filter.status = opts.status
      if (opts.tag) filter.tag = opts.tag
      if (opts.type) filter.agentType = opts.type

      const agents = agentManager.list(Object.keys(filter).length ? filter : undefined)

      if (agents.length === 0) {
        console.log(theme.dim("No agents found. Use `aegis agent spawn <name>` to create one."))
        return
      }

      const statusColor: Record<string, (s: string) => string> = {
        spawning: theme.warn,
        running: theme.success,
        idle: theme.info,
        busy: theme.accent,
        stopping: theme.warn,
        stopped: theme.muted,
        error: theme.error,
      }

      console.log(theme.heading(`  Agents (${agents.length})`))
      console.log()
      for (const a of agents) {
        const color = statusColor[a.status] ?? theme.dim
        const statusBadge = color(`● ${a.status}`)
        const uptime = a.spawnTime ? `${Math.floor((Date.now() - a.spawnTime) / 1000)}s` : "-"
        const typeInfo = a.def.agentType ? theme.dim(` [${a.def.agentType}]`) : ""
        console.log(`  ${theme.bold(a.def.name)}${typeInfo}  ${statusBadge}  pid:${a.pid}  uptime:${uptime}`)
        if (a.def.tags?.length) {
          console.log(`    tags: ${a.def.tags.join(", ")}`)
        }
        console.log()
      }
    })

  // ── spawn ──────────────────────────────────────────────────────────
  agent
    .command("spawn <name>")
    .description("Spawn a new agent")
    .option(
      "--type <type>",
      "Agent type (build, plan, read, write, test, validate, review, debug, document, refactor, deploy, monitor, explore)",
    )
    .option("--script <path>", "Path to worker script", "src/agent/agent-worker.ts")
    .option("--tag <tags...>", "Tags to assign")
    .option("--timeout <ms>", "Stop timeout in ms")
    .option("--retries <n>", "Auto-recovery max retries (0 to disable)", "5")
    .option("--backoff <ms>", "Auto-recovery base backoff in ms", "1000")
    .action(
      async (
        name: string,
        opts: {
          type?: string
          script?: string
          tag?: string[]
          timeout?: string
          retries?: string
          backoff?: string
        },
      ) => {
        // Validate type if provided
        if (opts.type && !isValidAgentType(opts.type)) {
          console.log(theme.error(`  Unknown agent type: ${opts.type}`))
          console.log(theme.dim("  Run 'aegis agent types' to see available types"))
          process.exit(1)
        }

        console.log(theme.info(`  Spawning agent "${name}"…`))

        const retries = parseInt(opts.retries ?? "5", 10)

        try {
          const id = await agentManager.spawn({
            name,
            agentType: opts.type as AgentTypeName | undefined,
            script: opts.script ?? "src/agent/agent-worker.ts",
            tags: opts.tag,
            stopTimeout: opts.timeout ? parseInt(opts.timeout, 10) : undefined,
            recovery:
              retries > 0
                ? {
                    maxRetries: retries,
                    backoffMs: parseInt(opts.backoff ?? "1000", 10),
                  }
                : undefined,
          })

          const instance = agentManager.get(id)!
          console.log(theme.success(`  ✓ Agent "${name}" spawned successfully`))
          console.log(`    id:     ${theme.dim(id)}`)
          console.log(`    pid:    ${theme.dim(String(instance.pid))}`)
          if (instance.def.agentType) {
            const type = getAgentType(instance.def.agentType)
            console.log(
              `    type:   ${theme.accent(instance.def.agentType)}${type ? theme.dim(` (${type.mode})`) : ""}`,
            )
          }
          console.log(`    script: ${theme.dim(instance.def.script)}`)
          if (retries > 0) {
            console.log(`    recovery: ${theme.dim(`${retries} retries, ${opts.backoff ?? "1000"}ms base backoff`)}`)
          } else {
            console.log(`    recovery: ${theme.dim("disabled")}`)
          }
        } catch (err) {
          console.log(theme.error(`  ✗ Failed to spawn agent: ${err instanceof Error ? err.message : String(err)}`))
          process.exit(1)
        }
      },
    )

  // ── kill ──────────────────────────────────────────────────────────
  agent
    .command("kill <name>")
    .description("Kill a running agent")
    .option("-f, --force", "Skip graceful shutdown, send SIGKILL immediately")
    .option("--timeout <ms>", "Graceful shutdown timeout before force kill")
    .action(async (name: string, opts: { force?: boolean; timeout?: string }) => {
      const instance = findAgent(name)

      if (opts.force) {
        instance.process.kill(9)
        instance.status = "stopped"
        console.log(theme.warn(`  Force killed agent "${name}"`))
        return
      }

      console.log(theme.info(`  Stopping agent "${name}"…`))
      try {
        await agentManager.kill(instance.id, opts.timeout ? parseInt(opts.timeout, 10) : undefined)
        console.log(theme.success(`  ✓ Agent "${name}" stopped`))
      } catch (err) {
        console.log(theme.error(`  ✗ Failed to kill agent: ${err instanceof Error ? err.message : String(err)}`))
      }
    })

  // ── logs ──────────────────────────────────────────────────────────
  agent
    .command("logs <name>")
    .description("Show agent logs")
    .option("-n, --tail <count>", "Number of recent lines to show", "50")
    .option("--level <level>", "Filter by level (info, warn, error, debug)")
    .option("-f, --follow", "Follow new log entries (polling)")
    .action(async (name: string, opts: { tail?: string; level?: string; follow?: boolean }) => {
      const instance = findAgent(name)
      const tail = parseInt(opts.tail ?? "50", 10)

      function printLogs() {
        const logs = agentManager.getLogs(instance.id, {
          tail,
          level: opts.level as AgentLogLevel | undefined,
        })

        const levelColor: Record<string, (s: string) => string> = {
          info: theme.dim,
          warn: theme.warn,
          error: theme.error,
          debug: theme.muted,
          data: theme.info,
        }

        for (const entry of logs) {
          const time = new Date(entry.timestamp).toLocaleTimeString()
          const color = levelColor[entry.level] ?? theme.dim
          const levelTag = entry.level.padEnd(5)
          console.log(color(`  [${time}] ${levelTag} ${entry.text}`))
        }
      }

      printLogs()

      if (opts.follow) {
        console.log(theme.dim("  (following — press Ctrl+C to stop)"))
        const interval = setInterval(printLogs, 1_000)

        process.on("SIGINT", () => {
          clearInterval(interval)
          process.exit(0)
        })

        // Keep alive
        await new Promise(() => {})
      }
    })

  // ── inspect ────────────────────────────────────────────────────────
  agent
    .command("inspect <name>")
    .description("Show detailed agent info")
    .action((name: string) => {
      const instance = findAgent(name)

      console.log(theme.heading(`  Agent: ${instance.def.name}`))
      console.log()
      console.log(`  ${theme.bold("id:")}         ${instance.id}`)
      console.log(`  ${theme.bold("status:")}      ${instance.status}`)
      if (instance.def.agentType) {
        const type = getAgentType(instance.def.agentType)
        console.log(
          `  ${theme.bold("type:")}        ${theme.accent(instance.def.agentType)}${type ? theme.dim(` (${type.mode})`) : ""}`,
        )
        if (type) {
          console.log(`  ${theme.bold("description:")} ${type.description}`)
          console.log(
            `  ${theme.bold("tools:")}       ${type.tools
              .filter((t) => t.allow)
              .map((t) => t.name)
              .join(", ")}`,
          )
          if (type.modelHint) {
            console.log(`  ${theme.bold("model:")}       ${type.modelHint}`)
          }
        }
      }
      console.log(`  ${theme.bold("pid:")}         ${instance.pid}`)
      console.log(`  ${theme.bold("script:")}      ${instance.def.script}`)
      console.log(`  ${theme.bold("spawned:")}     ${new Date(instance.spawnTime).toLocaleString()}`)
      console.log(`  ${theme.bold("last act:")}    ${new Date(instance.lastActivity).toLocaleTimeString()}`)
      console.log(`  ${theme.bold("exit code:")}   ${instance.exitCode ?? "-"}`)
      console.log(`  ${theme.bold("log count:")}   ${instance.log.length}`)
      if (instance.def.tags?.length) {
        console.log(`  ${theme.bold("tags:")}        ${instance.def.tags.join(", ")}`)
      }
      if (instance.def.limits) {
        console.log(
          `  ${theme.bold("limits:")}      cpu:${instance.def.limits.cpu ?? "none"} mem:${instance.def.limits.memoryMB ?? "none"}MB`,
        )
      }
    })
}

// ── Helper ─────────────────────────────────────────────────────────────

function findAgent(name: string) {
  const byName = Array.from(agentManager.agents.values()).find((a) => a.def.name === name || a.id === name)
  if (!byName) {
    console.log(theme.error(`  Agent "${name}" not found`))
    process.exit(1)
  }
  return byName
}

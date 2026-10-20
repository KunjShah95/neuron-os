import { describe, it, expect, afterEach } from "bun:test"
import { createServer } from "node:net"

import { WorkerPool } from "./pool"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const SECRET = "pool-test-secret"

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address()
      const port = typeof address === "object" && address ? address.port : 0
      probe.close(() => resolve(port))
    })
  })
}

describe("WorkerPool task routing", () => {
  const pools: WorkerPool[] = []

  afterEach(async () => {
    for (const pool of pools) {
      await pool.stop()
    }
    pools.length = 0
  })

  it("routes a task sent from a non-leader node back to the requester", async () => {
    const port = await freePort()
    const leader = new WorkerPool({ nodeId: "leader", role: "leader", listenPort: port, secret: SECRET })
    pools.push(leader)
    await leader.start()

    const worker = new WorkerPool({
      nodeId: "a-worker",
      role: "worker",
      leaderHost: "127.0.0.1",
      leaderPort: port,
      listenPort: await freePort(),
      secret: SECRET,
    })
    pools.push(worker)
    await worker.start()

    await sleep(250)
    expect(leader.listWorkers().some((w) => w.id === "a-worker")).toBe(true)

    worker.on("task", (task: { taskId: string }) => {
      worker.sendTaskResult(task.taskId, "pong")
    })

    const result = await worker.sendTask("a-worker", { id: "task-42", type: "ping", payload: { a: 1 } })
    expect(result).toBe("pong")
    expect((worker as any).pendingTasks.size).toBe(0)
  })

  it("rejects a forwarded task when the target worker is unknown", async () => {
    const port = await freePort()
    const leader = new WorkerPool({ nodeId: "leader", role: "leader", listenPort: port, secret: SECRET })
    pools.push(leader)
    await leader.start()

    const worker = new WorkerPool({
      nodeId: "a-worker",
      role: "worker",
      leaderHost: "127.0.0.1",
      leaderPort: port,
      listenPort: await freePort(),
      secret: SECRET,
    })
    pools.push(worker)
    await worker.start()
    await sleep(250)

    await expect(worker.sendTask("ghost-worker", { id: "task-43", type: "ping", payload: {} })).rejects.toThrow(
      /not connected/,
    )
    expect((worker as any).pendingTasks.size).toBe(0)
  })
})

describe("WorkerPool heartbeat timeout", () => {
  const pools: WorkerPool[] = []

  afterEach(async () => {
    for (const pool of pools) {
      await pool.stop()
    }
    pools.length = 0
  })

  it("emits worker:leave once and drops the worker and its socket", async () => {
    const port = await freePort()
    const leader = new WorkerPool({
      nodeId: "leader",
      role: "leader",
      listenPort: port,
      secret: SECRET,
      heartbeatTimeoutMs: 200,
    })
    pools.push(leader)

    const leaves: string[] = []
    leader.on("worker:leave", (id: string) => leaves.push(id))

    await leader.start()

    const worker = new WorkerPool({
      nodeId: "a-worker",
      role: "worker",
      leaderHost: "127.0.0.1",
      leaderPort: port,
      listenPort: await freePort(),
      secret: SECRET,
      heartbeatIntervalMs: 60_000,
    })
    pools.push(worker)
    await worker.start()

    await sleep(600)

    expect(leaves).toEqual(["a-worker"])
    expect(leader.listWorkers().some((w) => w.id === "a-worker")).toBe(false)
    expect((leader as any).connections.has("a-worker")).toBe(false)
    expect((worker as any).leaderSocket).toBeNull()
  })
})

import { describe, it, expect, afterAll } from "bun:test"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

/**
 * Regression tests for the runtime hardening pass.
 *
 * Covers:
 *  - IPC payload validation (a JSON line without `type` must not be treated
 *    as an IPC message and must not crash the manager)
 *  - IPC write failures must propagate to the caller
 *  - `waitForAgentReady` must not leak listeners on timeout
 *  - `routeIpcMessage` must register its response listener before sending
 *  - the ratchet must invoke git with argv (no shell interpolation)
 *  - the agent pool must track the real agent id and derive success from the
 *    agent exit code
 *  - mood outcome must treat a "partial" session as a success
 */

import { HookRegistry } from "./hooks"
import type { AgentEvent, AgentIpcMessage, AgentInstance } from "./types"
import {
  isValidIpcMessage,
  parseIpcLine,
  readAgentStream,
  routeIpcMessage,
  sendIpcMessage,
  waitForAgentReady,
} from "./manager/ipc"
import type { ManagerContext } from "./manager/state"
import { RatchetRuntime, buildGitRevertArgs } from "./ratchet"
import { computePoolResult, AgentPool, type PoolAgentManager } from "./agent-pool"
import { computeMoodOutcome } from "./engine"
import { agentManager } from "./manager"

// ── Helpers ──────────────────────────────────────────────────────────

function makeMockAgent(id: string): AgentInstance {
  return {
    id,
    def: { name: `agent-${id}`, script: "src/agent/agent-worker.ts" },
    status: "running",
    process: {
      pid: 4242,
      kill: () => {},
      exited: Promise.resolve(0),
      stdin: null,
      stdout: null,
      stderr: null,
    } as unknown as AgentInstance["process"],
    spawnTime: Date.now(),
    lastActivity: Date.now(),
    log: [],
    pid: 4242,
    exitCode: null,
    metadata: {},
  }
}

interface FakeManager {
  ctx: ManagerContext
  events: AgentEvent[]
  listeners: Set<(event: AgentEvent) => void>
  emitThrowsFor: string | null
  sendIpcImpl: (id: string, msg: AgentIpcMessage) => Promise<void>
}

function makeFakeManager(): FakeManager {
  const listeners = new Set<(event: AgentEvent) => void>()
  const events: AgentEvent[] = []

  const fake: FakeManager = {
    events,
    listeners,
    emitThrowsFor: null,
    sendIpcImpl: async () => {},
    ctx: null as unknown as ManagerContext,
  }

  const ctx = {
    agents: new Map<string, AgentInstance>(),
    hooks: new HookRegistry(),
    listeners,
    emit: (type: string, agentId: string, data?: unknown) => {
      if (fake.emitThrowsFor === type) throw new Error("emit exploded")
      const event: AgentEvent = { type: type as AgentEvent["type"], agentId, data }
      events.push(event)
      for (const cb of listeners) {
        try {
          cb(event)
        } catch {
          /* isolate listener failures */
        }
      }
    },
    makeLog: (level: string, text: string) => ({
      level: level as AgentInstance["log"][number]["level"],
      text,
      timestamp: Date.now(),
    }),
    sendIpc: async (id: string, msg: AgentIpcMessage) => fake.sendIpcImpl(id, msg),
  } as unknown as ManagerContext

  fake.ctx = ctx
  return fake
}

function streamOf(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text))
      controller.close()
    },
  })
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true
    await new Promise((r) => setTimeout(r, 10))
  }
  return predicate()
}

// ── BUG 1: unvalidated IPC payload ───────────────────────────────────

describe("IPC payload validation", () => {
  it("rejects JSON objects without a type field", () => {
    expect(isValidIpcMessage({ foo: "bar" })).toBe(false)
    expect(isValidIpcMessage({ type: "" })).toBe(false)
    expect(isValidIpcMessage({ type: 42 })).toBe(false)
    expect(isValidIpcMessage(null)).toBe(false)
    expect(isValidIpcMessage("heartbeat")).toBe(false)
    expect(isValidIpcMessage([])).toBe(false)
  })

  it("accepts well-formed IPC messages", () => {
    expect(isValidIpcMessage({ type: "heartbeat", timestamp: 1 })).toBe(true)
    expect(isValidIpcMessage({ type: "result" })).toBe(true)
  })

  it("parseIpcLine returns null for JSON without a type field", () => {
    expect(parseIpcLine('{"foo":"bar"}')).toBeNull()
    expect(parseIpcLine('{"type":"heartbeat"}')).not.toBeNull()
    expect(parseIpcLine("not json at all")).toBeNull()
    expect(parseIpcLine("")).toBeNull()
  })

  it("parseIpcLine normalises a missing timestamp", () => {
    const msg = parseIpcLine('{"type":"heartbeat"}')
    expect(msg).not.toBeNull()
    expect(typeof msg!.timestamp).toBe("number")
  })

  it("does not treat a typeless JSON stdout line as an IPC message", async () => {
    const fake = makeFakeManager()
    const instance = makeMockAgent("typeless")
    fake.ctx.agents.set("typeless", instance)

    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandled)

    readAgentStream(fake.ctx, "typeless", streamOf('{"foo":"bar"}\n'), "stdout")

    const logged = await waitFor(() => instance.log.length > 0)
    process.off("unhandledRejection", onUnhandled)

    expect(logged).toBe(true)
    expect(instance.log.some((l) => l.text.includes('{"foo":"bar"}'))).toBe(true)
    expect(fake.events.some((e) => e.type === "agent:result")).toBe(false)
    expect(fake.events.some((e) => e.type === "agent:error")).toBe(false)
    expect(unhandled.length).toBe(0)
  })

  it("still routes valid IPC messages from stdout", async () => {
    const fake = makeFakeManager()
    const instance = makeMockAgent("valid-ipc")
    fake.ctx.agents.set("valid-ipc", instance)

    readAgentStream(
      fake.ctx,
      "valid-ipc",
      streamOf('{"type":"heartbeat","timestamp":1}\n{"foo":"bar"}\n'),
      "stdout",
    )

    const got = await waitFor(() => fake.events.some((e) => e.type === "agent:heartbeat"))
    expect(got).toBe(true)
    expect(fake.events.some((e) => e.type === "agent:error")).toBe(false)
  })

  it("reports a failing IPC handler as agent:error instead of an unhandled rejection", async () => {
    const fake = makeFakeManager()
    const instance = makeMockAgent("handler-fails")
    fake.ctx.agents.set("handler-fails", instance)
    fake.emitThrowsFor = "agent:result"

    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandled)

    readAgentStream(
      fake.ctx,
      "handler-fails",
      streamOf('{"type":"result","id":"r1","payload":{},"timestamp":1}\n'),
      "stdout",
    )

    const errored = await waitFor(() => fake.events.some((e) => e.type === "agent:error"))
    await new Promise((r) => setTimeout(r, 20))
    process.off("unhandledRejection", onUnhandled)

    expect(errored).toBe(true)
    expect(unhandled.length).toBe(0)
  })

  it("does not leak an unhandled rejection when an IPC hook throws", async () => {
    const fake = makeFakeManager()
    const instance = makeMockAgent("hook-fails")
    fake.ctx.agents.set("hook-fails", instance)

    fake.ctx.hooks.register("result", "post", () => {
      throw new Error("hook exploded")
    })

    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on("unhandledRejection", onUnhandled)

    readAgentStream(
      fake.ctx,
      "hook-fails",
      streamOf('{"type":"result","id":"r2","payload":{},"timestamp":1}\n'),
      "stdout",
    )

    await waitFor(() => fake.events.some((e) => e.type === "agent:result"))
    await new Promise((r) => setTimeout(r, 50))
    process.off("unhandledRejection", onUnhandled)

    expect(unhandled.length).toBe(0)
  })
})

// ── BUG 4: send failures must propagate ──────────────────────────────

describe("sendIpcMessage failure propagation", () => {
  it("rethrows when the write to stdin fails", async () => {
    const fake = makeFakeManager()
    const instance = makeMockAgent("write-fails")
    ;(instance.process as unknown as { stdin: unknown }).stdin = {
      write: () => {
        throw new Error("EPIPE")
      },
      flush: () => {},
    }
    fake.ctx.agents.set("write-fails", instance)

    let threw = false
    try {
      await sendIpcMessage(fake.ctx, "write-fails", {
        type: "ping",
        id: "p1",
        payload: {},
        timestamp: Date.now(),
      })
    } catch {
      threw = true
    }

    expect(threw).toBe(true)
    expect(instance.log.some((l) => l.level === "error")).toBe(true)
  })

  it("rejects for an unknown agent", async () => {
    const fake = makeFakeManager()
    let threw = false
    try {
      await sendIpcMessage(fake.ctx, "nope", {
        type: "ping",
        id: "p1",
        payload: {},
        timestamp: Date.now(),
      })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
})

// ── BUG 3: waitForAgentReady listener leak ───────────────────────────

describe("waitForAgentReady", () => {
  it("removes its listener when the ready timeout fires", async () => {
    const fake = makeFakeManager()
    const before = fake.listeners.size

    let rejected = false
    try {
      await waitForAgentReady(fake.ctx, "slow-agent", 30)
    } catch {
      rejected = true
    }

    expect(rejected).toBe(true)
    expect(fake.listeners.size).toBe(before)
  })

  it("removes its listener when the agent reports ready", async () => {
    const fake = makeFakeManager()
    const before = fake.listeners.size

    const promise = waitForAgentReady(fake.ctx, "ready-agent", 2000)
    setTimeout(() => fake.ctx.emit("agent:ready", "ready-agent"), 10)

    await promise
    expect(fake.listeners.size).toBe(before)
  })
})

// ── BUG 2: routeIpcMessage listener ordering ─────────────────────────

describe("routeIpcMessage", () => {
  it("registers the response listener before sending so fast replies are not dropped", async () => {
    const fake = makeFakeManager()
    fake.ctx.agents.set("from", makeMockAgent("from"))
    fake.ctx.agents.set("to", makeMockAgent("to"))

    fake.sendIpcImpl = async (_id: string, msg: AgentIpcMessage) => {
      fake.ctx.emit("agent:result", "to", { id: msg.id, type: msg.type })
    }

    const routed = routeIpcMessage(fake.ctx, "from", "to", {
      type: "ping",
      id: "route-1",
      payload: {},
      timestamp: Date.now(),
    })

    const outcome = await Promise.race([
      routed.then((value) => ({ ok: true, value })),
      new Promise<{ ok: boolean }>((resolve) => setTimeout(() => resolve({ ok: false }), 500)),
    ])

    expect(outcome.ok).toBe(true)
    expect(fake.listeners.size).toBe(0)
  })

  it("rejects and cleans up when the send fails", async () => {
    const fake = makeFakeManager()
    fake.ctx.agents.set("from", makeMockAgent("from"))
    fake.ctx.agents.set("to", makeMockAgent("to"))

    fake.sendIpcImpl = async () => {
      throw new Error("stdin closed")
    }

    let rejected = false
    try {
      await routeIpcMessage(fake.ctx, "from", "to", {
        type: "ping",
        id: "route-2",
        payload: {},
        timestamp: Date.now(),
      })
    } catch {
      rejected = true
    }

    expect(rejected).toBe(true)
    expect(fake.listeners.size).toBe(0)
  })
})

// ── BUG 8: shell injection in the ratchet ────────────────────────────

describe("ratchet git invocation", () => {
  it("passes the file name as a single argv entry", () => {
    const args = buildGitRevertArgs('evil"; rm -rf ~ ; echo ".ts')
    expect(args.length).toBe(3)
    expect(args[0]).toBe("checkout")
    expect(args[1]).toBe("--")
    expect(args[2]).toBe('evil"; rm -rf ~ ; echo ".ts')
  })

  it("never interpolates the file name into a shell string", () => {
    const calls: string[][] = []
    const rt = new RatchetRuntime((args) => {
      calls.push(args)
      return ""
    })

    rt.revertFiles(process.cwd(), ['a"; rm -rf ~/ ; echo ".ts'])

    expect(calls.length).toBe(1)
    expect(calls[0]!.length).toBe(3)
    expect(calls[0]![2]).toBe('a"; rm -rf ~/ ; echo ".ts')
    expect(calls[0]!.slice(0, 2)).toEqual(["checkout", "--"])
  })

  it("uses argv-based git for every git call", async () => {
    const calls: string[][] = []
    const rt = new RatchetRuntime((args) => {
      calls.push(args)
      if (args[0] === "rev-parse") return "true\n"
      return ""
    })

    rt.isGitRepo(process.cwd())
    rt.getChangedFiles(process.cwd())
    rt.revertFiles(process.cwd(), ["one.ts", "two.ts"])

    expect(calls[0]).toEqual(["rev-parse", "--is-inside-work-tree"])
    expect(calls.some((c) => c[0] === "diff" && c[1] === "--name-only")).toBe(true)
    expect(calls.filter((c) => c[0] === "checkout").length).toBe(2)
    for (const call of calls) {
      expect(call.every((part) => typeof part === "string")).toBe(true)
    }
  })

  it("no longer builds a shell command for git checkout", async () => {
    const source = await readFile(join(import.meta.dir, "ratchet.ts"), "utf-8")
    expect(source).toContain("execFileSync")
    expect(source).not.toContain('execSync(`git checkout')
    expect(source).not.toContain('execSync("git checkout')
  })
})

// ── BUG 6 + 7: agent pool bookkeeping ────────────────────────────────

describe("agent pool results", () => {
  it("marks a task successful only when the agent exits with code 0", () => {
    const ok = computePoolResult({
      taskId: "t1",
      agentId: "a1",
      taskName: "task",
      exitCode: 0,
      startedAt: 1000,
      completedAt: 1500,
    })
    expect(ok.success).toBe(true)
    expect(ok.error).toBeUndefined()
    expect(ok.durationMs).toBe(500)

    const failed = computePoolResult({
      taskId: "t2",
      agentId: "a2",
      taskName: "task",
      exitCode: 137,
      startedAt: 1000,
      completedAt: 1500,
    })
    expect(failed.success).toBe(false)
    expect(failed.error).toContain("137")
  })

  it("reports a missing exit code as a failure", () => {
    const result = computePoolResult({
      taskId: "t3",
      agentId: "a3",
      taskName: "task",
      exitCode: null,
      startedAt: 1000,
      completedAt: 1200,
    })
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})

describe("agent pool dispatch", () => {
  it("tracks the real agent id, enables stdin mode and derives success from the exit code", async () => {
    const spawnCalls: Array<{ name: string; env?: Record<string, string> }> = []
    const listeners = new Set<(event: AgentEvent) => void>()

    const manager: PoolAgentManager = {
      spawn: async (def) => {
        spawnCalls.push({ name: def.name, env: def.env })
        return "real-agent-id"
      },
      sendIpc: async (id) => {
        setTimeout(() => {
          for (const cb of listeners) cb({ type: "agent:exit", agentId: id, data: { code: 0 } })
        }, 10)
      },
      kill: async () => {},
      onEvent: (cb) => {
        listeners.add(cb)
      },
      offEvent: (cb) => {
        listeners.delete(cb)
      },
    }

    const pool = new AgentPool({ maxConcurrency: 1, defaultTimeoutMs: 5000 }, manager)
    const taskId = pool.submit("do the thing", { name: "pool-task-1" })
    const result = await pool.waitForTask(taskId, 5000)

    expect(result.agentId).toBe("real-agent-id")
    expect(result.success).toBe(true)
    expect(spawnCalls.length).toBe(1)
    expect(spawnCalls[0]!.env?.AEGIS_STDIN_MODE).toBe("true")

    await pool.destroy()
  })

  it("reports failure when the agent exits with a non-zero code", async () => {
    const listeners = new Set<(event: AgentEvent) => void>()

    const manager: PoolAgentManager = {
      spawn: async () => "failing-agent",
      sendIpc: async (id) => {
        setTimeout(() => {
          for (const cb of listeners) cb({ type: "agent:exit", agentId: id, data: { code: 3 } })
        }, 10)
      },
      kill: async () => {},
      onEvent: (cb) => {
        listeners.add(cb)
      },
      offEvent: (cb) => {
        listeners.delete(cb)
      },
    }

    const pool = new AgentPool({ maxConcurrency: 1, defaultTimeoutMs: 5000 }, manager)
    const taskId = pool.submit("failing task", { name: "pool-task-2" })
    const result = await pool.waitForTask(taskId, 5000)

    expect(result.success).toBe(false)
    expect(result.error).toContain("3")

    await pool.destroy()
  })

  it("kills the real agent on cancel", async () => {
    const killed: string[] = []
    let releaseSpawn: ((id: string) => void) | null = null

    const manager: PoolAgentManager = {
      spawn: async () =>
        new Promise<string>((resolve) => {
          releaseSpawn = resolve
        }),
      sendIpc: async () => {},
      kill: async (id) => {
        killed.push(id)
      },
      onEvent: () => {},
      offEvent: () => {},
    }

    const pool = new AgentPool({ maxConcurrency: 1, defaultTimeoutMs: 5000 }, manager)
    const taskId = pool.submit("long task", { name: "pool-task-3" })

    await waitFor(() => releaseSpawn !== null)
    const cancelled = pool.cancel(taskId)
    expect(cancelled).toBe(true)

    releaseSpawn!("late-agent-id")
    await new Promise((r) => setTimeout(r, 50))

    expect(killed).toContain("late-agent-id")

    await pool.destroy()
  })
})

// ── BUG 10: mood outcome ──────────────────────────────────────────────

describe("mood outcome", () => {
  it("treats a partial session as a success", () => {
    expect(computeMoodOutcome("success")).toBe("success")
    expect(computeMoodOutcome("partial")).toBe("success")
    expect(computeMoodOutcome("failed")).toBe("failure")
    expect(computeMoodOutcome("reverted")).toBe("failure")
  })
})

// ── BUG 9: supervisor deadline ────────────────────────────────────────

describe("supervisor", () => {
  const originalSpawn = agentManager.spawn.bind(agentManager)
  const originalGet = agentManager.get.bind(agentManager)

  afterAll(() => {
    ;(agentManager as unknown as { spawn: unknown }).spawn = originalSpawn
    ;(agentManager as unknown as { get: unknown }).get = originalGet
  })

  it("rejects when the agent never reaches a terminal state", async () => {
    ;(agentManager as unknown as { spawn: unknown }).spawn = async () => "never-ending-agent"
    ;(agentManager as unknown as { get: unknown }).get = () => ({
      id: "never-ending-agent",
      def: { name: "w", script: "s" },
      status: "running",
      process: {},
      spawnTime: Date.now(),
      lastActivity: Date.now(),
      log: [],
      pid: 1,
      exitCode: null,
      metadata: {},
    })

    const { Supervisor } = await import("./supervisor")
    const supervisor = new Supervisor({
      goal: "loop forever",
      maxRunTimeMs: 60,
      pollIntervalMs: 10,
    })

    let rejected = false
    let message = ""
    try {
      await supervisor.run()
    } catch (err) {
      rejected = true
      message = err instanceof Error ? err.message : String(err)
    }

    expect(rejected).toBe(true)
    expect(message).toContain("max run time")
  })
})

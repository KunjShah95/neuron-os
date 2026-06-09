import { describe, it, expect } from "bun:test"
/**
 * Unit tests for AgentEngine, AgentManager (IPC, hooks, kill, routing, events),
 * and HookRegistry.
 *
 * AgentManager normally spawns real OS processes via Bun.spawn(). These tests
 * inject mock AgentInstances into the agents Map to test IPC handling, event
 * emission, kill flow, and routing without spawning real children.
 *
 * After each test the manager is cleaned up so no state leaks between tests.
 */

import { AgentManager } from "./manager"
import { HookRegistry } from "./hooks"
import { AgentEngine } from "./engine"
import { AgentRuntime } from "./runtime"
import type { Subprocess } from "bun"
import type { AgentInstance, AgentDef, AgentIpcMessage, AgentEvent } from "./types"

describe("Engine Tests", () => {
  // ── Mock Subprocess ──────────────────────────────────────────────────

  function makeMockProc(overrides?: Partial<Subprocess>): Subprocess {
    return {
      pid: 999,
      kill: () => {},
      exited: Promise.resolve(0),
      stdin: null as any,
      stdout: null as any,
      stderr: null as any,
      ...overrides,
    } as Subprocess
  }

  function makeMockAgent(id: string, overrides?: Partial<AgentDef>): AgentInstance {
    return {
      id,
      def: {
        name: `agent-${id}`,
        script: "src/agent/agent-worker.ts",
        ...overrides,
      },
      status: "running",
      process: makeMockProc(),
      spawnTime: Date.now(),
      lastActivity: Date.now(),
      log: [],
      pid: 999,
      exitCode: null,
      metadata: {},
    }
  }

  // Creates an AgentManager with no heartbeat (to avoid timer side-effects)
  function freshManager(): AgentManager {
    return new AgentManager({ heartbeatMs: 0 })
  }

  // ================================================================
  //  HOOKREGISTRY TESTS
  // ================================================================

  it("should hook register", async () => {
    const hr = new HookRegistry()
    expect(hr.size).toBe(0)
    hr.register("spawn", "pre", () => {})
    expect(hr.size).toBe(1)
    hr.register("spawn", "post", () => {})
    expect(hr.size).toBe(2)
  })

  it("should hook unregister", async () => {
    const hr = new HookRegistry()
    hr.register("spawn", "pre", () => {}, { label: "my-hook" })
    hr.register("kill", "pre", () => {}, { label: "other-hook" })
    expect(hr.size).toBe(2)
    hr.unregister("my-hook")
    expect(hr.size).toBe(1)
  })

  it("should hook unregister nonexistent", async () => {
    const hr = new HookRegistry()
    hr.register("spawn", "pre", () => {}, { label: "hook-1" })
    hr.unregister("nonexistent-label")
    expect(hr.size).toBe(1)
  })

  it("should hook priority", async () => {
    const order: string[] = []
    const hr = new HookRegistry()

    hr.register(
      "spawn",
      "pre",
      () => {
        order.push("low")
      },
      { priority: -10 },
    )
    hr.register(
      "spawn",
      "pre",
      () => {
        order.push("high")
      },
      { priority: 100 },
    )
    hr.register(
      "spawn",
      "pre",
      () => {
        order.push("mid")
      },
      { priority: 0 },
    )

    const mock = makeMockAgent("prio-test")
    await hr.run("spawn", "pre", "prio-test", mock)

    expect(order.join(",")).toBe("high,mid,low")
  })

  it("should hook run passes context", async () => {
    const hr = new HookRegistry()
    const captured: string[] = []

    hr.register("spawn", "pre", (ctx) => {
      captured.push(ctx.point)
      captured.push(ctx.phase)
      captured.push(ctx.agentId)
      captured.push(ctx.instance.status)
    })

    const mock = makeMockAgent("ctx-test")
    const meta = await hr.run("spawn", "pre", "ctx-test", mock, { reason: "test" })

    expect(captured.join(",")).toBe("spawn,pre,ctx-test,running")
    expect(meta !== undefined).toBe(true)
  })

  it("should hook run with data", async () => {
    const hr = new HookRegistry()
    let receivedData: unknown = null

    hr.register("spawn", "pre", (ctx) => {
      receivedData = ctx.data
    })

    const mock = makeMockAgent("data-test")
    await hr.run("spawn", "pre", "data-test", mock, { someKey: "someValue" })

    expect(receivedData).toBeDefined()
    expect((receivedData as any).someKey).toBe("someValue")
  })

  it("should hook run mutates meta", async () => {
    const hr = new HookRegistry()

    hr.register("spawn", "pre", (ctx) => {
      ctx.meta["mutated"] = true
      ctx.meta["value"] = 42
    })

    const mock = makeMockAgent("meta-test")
    const meta = await hr.run("spawn", "pre", "meta-test", mock)

    expect(meta["mutated"]).toBe(true)
    expect(meta["value"]).toBe(42)
  })

  it("should hook clear", async () => {
    const hr = new HookRegistry()
    hr.register("spawn", "pre", () => {})
    hr.register("kill", "post", () => {})
    expect(hr.size).toBe(2)
    hr.clear()
    expect(hr.size).toBe(0)
  })

  it("should hook no registered hooks", async () => {
    const hr = new HookRegistry()
    const mock = makeMockAgent("no-hooks")
    // Should not throw
    const meta = await hr.run("spawn", "pre", "no-hooks", mock)
    expect(Object.keys(meta).length).toBe(0)
  })

  it("should hook multiple labels", async () => {
    const hr = new HookRegistry()
    hr.register("spawn", "pre", () => {}, { label: "a", priority: 10 })
    hr.register("spawn", "pre", () => {}, { label: "b", priority: 5 })
    hr.register("spawn", "pre", () => {}, { label: "a", priority: 0 }) // Another "a"
    expect(hr.size).toBe(3)
    hr.unregister("a")
    expect(hr.size).toBe(1)
  })

  // ================================================================
  //  AGENTMANAGER — EVENT SYSTEM
  // ================================================================

  it("should event on off", async () => {
    const mgr = freshManager()
    const events: string[] = []

    const cb = (e: AgentEvent) => {
      events.push(e.type)
    }

    mgr.onEvent(cb)
    const mgrAny = mgr as any
    mgrAny.emit("agent:spawned", "test-1", { pid: 123 })
    expect(events.length).toBe(1)

    mgr.offEvent(cb)
    mgrAny.emit("agent:spawned", "test-2", { pid: 456 })
    expect(events.length).toBe(1)
  })

  it("should event multiple listeners", async () => {
    const mgr = freshManager()
    const list1: string[] = []
    const list2: string[] = []

    mgr.onEvent((e) => {
      list1.push(e.type)
    })
    mgr.onEvent((e) => {
      list2.push(e.type)
    })

    const mgrAny = mgr as any
    mgrAny.emit("agent:spawned", "multi-test")

    expect(list1.length).toBe(1)
    expect(list2.length).toBe(1)
  })

  it("should event listener isolation", async () => {
    const mgr = freshManager()
    const list: string[] = []

    mgr.onEvent((e) => {
      list.push(e.type)
    })

    // One listener throws; others should still receive
    mgr.onEvent(() => {
      throw new Error("crash")
    })

    const mgrAny = mgr as any
    mgrAny.emit("agent:spawned", "isolated")

    expect(list.length).toBe(1)
  })

  // ================================================================
  //  AGENTMANAGER — IPC MESSAGE HANDLING (private method)
  // ================================================================

  it("should ipc ready", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("ipc-ready")
    inst.status = "spawning"
    mgr.agents.set("ipc-ready", inst)

    const events: AgentEvent[] = []
    mgr.onEvent((e) => {
      events.push(e)
    })

    // Simulate receiving a "ready" result message
    const msg: AgentIpcMessage = { type: "result", id: "1", payload: { status: "ready" }, timestamp: Date.now() }
    const mgrAny = mgr as any
    mgrAny.handleIpcMessage("ipc-ready", msg)

    expect(inst.status as string).toBe("running")
    expect(events.some((e) => e.type === "agent:ready")).toBe(true)
  })

  it("should ipc log", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("ipc-log")
    inst.log = []
    mgr.agents.set("ipc-log", inst)

    const msg: AgentIpcMessage = {
      type: "log",
      id: "1",
      payload: { level: "info", text: "Hello from worker" },
      timestamp: Date.now(),
    }
    const mgrAny = mgr as any
    mgrAny.handleIpcMessage("ipc-log", msg)

    expect(inst.log.length).toBe(1)
    expect(inst.log[0]!.text).toBe("Hello from worker")
    expect(inst.log[0]!.level).toBe("info")
  })

  it("should ipc error", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("ipc-error")
    inst.log = []
    mgr.agents.set("ipc-error", inst)

    const events: AgentEvent[] = []
    mgr.onEvent((e) => {
      events.push(e)
    })

    const msg: AgentIpcMessage = {
      type: "error",
      id: "1",
      payload: { message: "Something broke" },
      timestamp: Date.now(),
    }
    const mgrAny = mgr as any
    mgrAny.handleIpcMessage("ipc-error", msg)

    expect(inst.log.length).toBe(1)
    expect(inst.log.some((l) => l.text.includes("Something broke"))).toBe(true)
    expect(events.some((e) => e.type === "agent:error")).toBe(true)
  })

  it("should ipc heartbeat", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("ipc-hb")
    inst.status = "spawning"
    mgr.agents.set("ipc-hb", inst)

    const msg: AgentIpcMessage = { type: "heartbeat", id: "1", payload: {}, timestamp: Date.now() }
    const mgrAny = mgr as any
    mgrAny.handleIpcMessage("ipc-hb", msg)

    expect(inst.status as string).toBe("running")
  })

  it("should ipc heartbeat updates activity", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("ipc-hb2")
    inst.lastActivity = 0
    mgr.agents.set("ipc-hb2", inst)

    const msg: AgentIpcMessage = { type: "heartbeat", id: "1", payload: {}, timestamp: Date.now() }
    const mgrAny = mgr as any
    mgrAny.handleIpcMessage("ipc-hb2", msg)

    expect(inst.lastActivity > 0).toBe(true)
  })

  it("should ipc result without ready", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("ipc-result")
    inst.status = "running"
    mgr.agents.set("ipc-result", inst)

    const events: AgentEvent[] = []
    mgr.onEvent((e) => {
      events.push(e)
    })

    const msg: AgentIpcMessage = {
      type: "result",
      id: "1",
      payload: { output: "task complete" },
      timestamp: Date.now(),
    }
    const mgrAny = mgr as any
    mgrAny.handleIpcMessage("ipc-result", msg)

    // No "ready" in payload, so status stays unchanged
    expect(inst.status).toBe("running")
    expect(events.some((e) => e.type === "agent:result")).toBe(true)
  })

  // ================================================================
  //  AGENTMANAGER — sendIpc
  // ================================================================

  it("should send ipc", async () => {
    const mgr = freshManager()
    const written: Uint8Array[] = []
    let flushed = false

    const fakeStdin = {
      write: (data: Uint8Array) => {
        written.push(data)
      },
      flush: () => {
        flushed = true
      },
    } as any

    const inst = makeMockAgent("send-test")
    ;(inst.process as any).stdin = fakeStdin
    mgr.agents.set("send-test", inst)

    await mgr.sendIpc("send-test", { type: "ping", id: "ping-1", payload: {}, timestamp: Date.now() })

    expect(written.length >= 1).toBe(true)
    expect(flushed).toBe(true)
    const decoded = new TextDecoder().decode(written[0]!)
    const parsed = JSON.parse(decoded.trim())
    expect(parsed.type).toBe("ping")
    expect(parsed.id).toBe("ping-1")
  })

  it("should send ipc nonexistent", async () => {
    const mgr = freshManager()
    try {
      await mgr.sendIpc("no-such-agent", { type: "ping", id: "1", payload: {}, timestamp: Date.now() })
      expect(false).toBe(true)
    } catch (e: unknown) {
      expect(e.message.includes("not found")).toBe(true)
    }
  })

  it("should send ipc closed stdin", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("closed-stdin")
    ;(inst.process as any).stdin = null as any
    mgr.agents.set("closed-stdin", inst)

    try {
      await mgr.sendIpc("closed-stdin", { type: "ping", id: "1", payload: {}, timestamp: Date.now() })
      expect(false).toBe(true)
    } catch (e: unknown) {
      expect(e.message.includes("no writable stdin")).toBe(true)
    }
  })

  // ================================================================
  //  AGENTMANAGER — kill flow
  // ================================================================

  it("should kill changes status", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("kill-status")
    mgr.agents.set("kill-status", inst)

    const events: AgentEvent[] = []
    mgr.onEvent((e) => {
      events.push(e)
    })

    await mgr.kill("kill-status", 100)

    expect(events.some((e) => e.type === "agent:stopped")).toBe(true)
  })

  it("should kill nonexistent", async () => {
    const mgr = freshManager()
    try {
      await mgr.kill("no-such-agent", 100)
      expect(false).toBe(true)
    } catch (e: unknown) {
      expect(e.message.includes("not found")).toBe(true)
    }
  })

  it("should kill already stopped", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("already-stopped")
    inst.status = "stopped"
    mgr.agents.set("already-stopped", inst)

    // Should not throw
    await mgr.kill("already-stopped", 100)
    expect(true).toBe(true)
  })

  it("should kill cancels recovery", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("kill-recovery")
    inst.def.recovery = { maxRetries: 5, backoffMs: 1000 }
    mgr.agents.set("kill-recovery", inst)

    // Schedule recovery first
    const mgrAny = mgr as any
    mgrAny.triggerRecovery("kill-recovery", 1)
    expect(mgr.hasPendingRecovery("kill-recovery")).toBe(true)

    await mgr.kill("kill-recovery", 100)
    expect(!mgr.hasPendingRecovery("kill-recovery")).toBe(true)
  })

  // ================================================================
  //  AGENTMANAGER — Query / List / Find
  // ================================================================

  it("should get", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("get-test")
    mgr.agents.set("get-test", inst)

    const found = mgr.get("get-test")
    expect(found).toBeDefined()
    expect(found!.id).toBe("get-test")

    const notFound = mgr.get("nonexistent")
    expect(notFound).toBe(undefined)
  })

  it("should list all", async () => {
    const mgr = freshManager()
    mgr.agents.set("list-1", makeMockAgent("list-1"))
    mgr.agents.set("list-2", makeMockAgent("list-2"))
    mgr.agents.set("list-3", makeMockAgent("list-3"))

    const all = mgr.list()
    expect(all.length).toBe(3)
  })

  it("should list filter by status", async () => {
    const mgr = freshManager()
    const a1 = makeMockAgent("running-1")
    a1.status = "running"
    const a2 = makeMockAgent("running-2")
    a2.status = "running"
    const a3 = makeMockAgent("stopped-1")
    a3.status = "stopped"
    mgr.agents.set("running-1", a1)
    mgr.agents.set("running-2", a2)
    mgr.agents.set("stopped-1", a3)

    const running = mgr.list({ status: "running" })
    expect(running.length).toBe(2)

    const stopped = mgr.list({ status: "stopped" })
    expect(stopped.length).toBe(1)
  })

  it("should list filter by agent type", async () => {
    const mgr = freshManager()
    const build1 = makeMockAgent("build-1")
    build1.def.agentType = "build"
    const build2 = makeMockAgent("build-2")
    build2.def.agentType = "build"
    const plan1 = makeMockAgent("plan-1")
    plan1.def.agentType = "plan"
    mgr.agents.set("build-1", build1)
    mgr.agents.set("build-2", build2)
    mgr.agents.set("plan-1", plan1)

    const buildAgents = mgr.list({ agentType: "build" })
    expect(buildAgents.length).toBe(2)
  })

  it("should list filter by tag", async () => {
    const mgr = freshManager()
    const prod1 = makeMockAgent("prod-1")
    prod1.def.tags = ["production"]
    const prod2 = makeMockAgent("prod-2")
    prod2.def.tags = ["production"]
    const dev1 = makeMockAgent("dev-1")
    dev1.def.tags = ["development", "experimental"]
    mgr.agents.set("prod-1", prod1)
    mgr.agents.set("prod-2", prod2)
    mgr.agents.set("dev-1", dev1)

    const prod = mgr.list({ tag: "production" })
    expect(prod.length).toBe(2)

    const dev = mgr.list({ tag: "development" })
    expect(dev.length).toBe(1)

    const nonexistent = mgr.list({ tag: "nonexistent" })
    expect(nonexistent.length).toBe(0)
  })

  it("should list combined filters", async () => {
    const mgr = freshManager()
    const a1 = makeMockAgent("build-prod")
    a1.def.agentType = "build"
    a1.def.tags = ["production"]
    a1.status = "running"
    const a2 = makeMockAgent("build-dev")
    a2.def.agentType = "build"
    a2.def.tags = ["development"]
    a2.status = "running"
    mgr.agents.set("build-prod", a1)
    mgr.agents.set("build-dev", a2)

    const result = mgr.list({ agentType: "build", tag: "production" })
    expect(result.length).toBe(1)
    expect(result[0]!.id).toBe("build-prod")
  })

  it("should list empty", async () => {
    const mgr = freshManager()
    const all = mgr.list()
    expect(all.length).toBe(0)
  })

  it("should find agent by name", async () => {
    const mgr = freshManager()
    const a1 = makeMockAgent("id-1")
    a1.def.name = "Alice"
    const a2 = makeMockAgent("id-2")
    a2.def.name = "Bob"
    mgr.agents.set("id-1", a1)
    mgr.agents.set("id-2", a2)

    const found = mgr.findAgentByName("Alice")
    expect(found).toBeDefined()
    expect(found!.id).toBe("id-1")

    const notFound = mgr.findAgentByName("Charlie")
    expect(notFound).toBe(undefined)
  })

  it("should find agent by type", async () => {
    const mgr = freshManager()
    const a1 = makeMockAgent("builder-1")
    a1.def.agentType = "build"
    const a2 = makeMockAgent("builder-2")
    a2.def.agentType = "build"
    mgr.agents.set("builder-1", a1)
    mgr.agents.set("builder-2", a2)

    const found = mgr.findAgentByType("build")
    expect(found).toBeDefined()
    expect(found!.def.agentType === "build").toBe(true)

    const notFound = mgr.findAgentByType("nonexistent")
    expect(notFound).toBe(undefined)
  })

  it("should get logs", async () => {
    const mgr = freshManager()
    const inst = makeMockAgent("logs-test")
    inst.log = [
      { level: "info", text: "started", timestamp: 100 },
      { level: "error", text: "error happened", timestamp: 200 },
      { level: "info", text: "more info", timestamp: 300 },
    ]
    mgr.agents.set("logs-test", inst)

    const all = mgr.getLogs("logs-test")
    expect(all.length).toBe(3)

    const errors = mgr.getLogs("logs-test", { level: "error" })
    expect(errors.length).toBe(1)
    expect(errors[0]!.text).toBe("error happened")

    const tail = mgr.getLogs("logs-test", { tail: 2 })
    expect(tail.length).toBe(2)
    expect(tail[0]!.text).toBe("error happened")
  })

  it("should get logs nonexistent", async () => {
    const mgr = freshManager()
    const logs = mgr.getLogs("no-such-agent")
    expect(logs.length).toBe(0)
  })

  // ================================================================
  //  AGENTMANAGER — Route IPC
  // ================================================================

  it("should route ipc source not found", async () => {
    const mgr = freshManager()
    const to = makeMockAgent("target")
    mgr.agents.set("target", to)

    try {
      await mgr.routeIpc("no-source", "target", { type: "ping", id: "1", payload: {}, timestamp: Date.now() })
      expect(false).toBe(true)
    } catch (e: unknown) {
      expect(e.message.includes("Source agent")).toBe(true)
    }
  })

  it("should route ipc target not found", async () => {
    const mgr = freshManager()
    const from = makeMockAgent("source")
    mgr.agents.set("source", from)

    try {
      await mgr.routeIpc("source", "no-target", { type: "ping", id: "1", payload: {}, timestamp: Date.now() })
      expect(false).toBe(true)
    } catch (e: unknown) {
      expect(e.message.includes("Target agent")).toBe(true)
    }
  })

  // ================================================================
  //  AGENTMANAGER — Destroy
  // ================================================================

  it("should destroy", async () => {
    const mgr = freshManager()
    mgr.agents.set("destroy-1", makeMockAgent("destroy-1"))
    mgr.agents.set("destroy-2", makeMockAgent("destroy-2"))
    mgr.hooks.register("spawn", "pre", () => {})

    expect(mgr.agents.size).toBe(2)
    expect(mgr.hooks.size > 0).toBe(true)

    await mgr.destroy()

    expect(mgr.agents.size).toBe(0)
    expect(mgr.hooks.size).toBe(0)
  })

  it("should destroy empty", async () => {
    const mgr = freshManager()
    // Should not throw
    await mgr.destroy()
    expect(true).toBe(true)
  })

  // ================================================================
  //  AGENTMANAGER — Pending Instance / makeLog
  // ================================================================

  it("should make log", async () => {
    const mgr = freshManager()
    const mgrAny = mgr as any

    const log = mgrAny.makeLog("info", "test message")
    expect(log.level).toBe("info")
    expect(log.text).toBe("test message")
    expect(typeof log.timestamp === "number").toBe(true)
  })

  it("should cancel recovery idempotent", async () => {
    const mgr = freshManager()
    // Should not throw when no recovery state exists
    mgr.cancelRecovery("nonexistent")
    expect(true).toBe(true)
  })

  it("should has pending recovery nonexistent", async () => {
    const mgr = freshManager()
    expect(!mgr.hasPendingRecovery("nonexistent")).toBe(true)
  })

  // ================================================================
  //  AGENTENGINE — parameterToJsonSchema
  // ================================================================

  it("should engine constructor", async () => {
    const runtime = new AgentRuntime({ agentId: "engine-test", cwd: "." })
    new AgentEngine(runtime, {} as any, { maxSteps: 5 })
    expect(true).toBe(true)
  })

  it("should engine default max steps", async () => {
    const runtime = new AgentRuntime({ agentId: "engine-default", cwd: "." })
    new AgentEngine(runtime, {} as any)
    expect(true).toBe(true)
  })

  // ================================================================
  //  AGENTENGINE — ratchet + evaluation config propagation
  // ================================================================

  it("should engine ratchet config propagates", async () => {
    const runtime = new AgentRuntime({ agentId: "engine-ratchet", cwd: "." })
    const engine = new AgentEngine(runtime, {} as any, {
      sessionId: "ratchet-test-1",
      sessionName: "ratchet-test",
      goal: "verify ratchet config propagation",
      project: "demo-project",
      experience: true,
      audit: false,
      ratchet: { testCommand: "echo test" },
      evaluation: [{ metric: "typecheck" }],
    })

    // Internal fields populated from config — verify the engine accepted them
    const engineAny = engine as any
    expect(engineAny.ratchetRuntime !== undefined).toBe(true)
    expect(engineAny.ratchetConfig !== undefined).toBe(true)
    expect(engineAny.ratchetConfig.testCommand).toBe("echo test")
    expect(engineAny.ratchetConfig.cwd).toBe(".")
    expect(engineAny.evaluationCriteria !== undefined).toBe(true)
    expect(engineAny.evaluationCriteria.length).toBe(1)
    expect(engineAny.evaluationCriteria[0].metric).toBe("typecheck")
    expect(engineAny.projectName).toBe("demo-project")

    // Calling completeSession is now async and returns a Promise
    const result = engine.completeSession("completed")
    expect(result instanceof Promise).toBe(true)
    await result
    expect(true).toBe(true)
  }, 60_000)

  it("should engine ratchet boolean enabled", async () => {
    const runtime = new AgentRuntime({ agentId: "engine-ratchet-bool", cwd: "." })
    const engine = new AgentEngine(runtime, {} as any, {
      ratchet: true,
    })
    const engineAny = engine as any
    expect(engineAny.ratchetRuntime !== undefined).toBe(true)
    expect(engineAny.ratchetConfig.testCommand).toBe(undefined)
    expect(engineAny.ratchetConfig.cwd).toBe(".")
  })

  // ================================================================
  //  RUNNER
  // ================================================================
})

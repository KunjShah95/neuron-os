#!/usr/bin/env bun
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

let passed = 0
let failed = 0

function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}

function assertEqual<T>(a: T, b: T, label: string) {
  if (a === b) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
}

function assertNotEqual<T>(a: T, b: T, label: string) {
  if (a !== b) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected not ${JSON.stringify(b)}`) }
}

function assertDefined<T>(v: T | undefined | null, label: string) {
  if (v !== undefined && v !== null) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — value was ${String(v)}`) }
}

function assertLogContains(logs: { text: string }[], search: string, label: string) {
  const found = logs.some((l) => l.text.includes(search))
  if (found) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected log to contain "${search}"`) }
}

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

console.log("\n=== HookRegistry Tests ===\n")

function testHookRegister() {
  const hr = new HookRegistry()
  assertEqual(hr.size, 0, "fresh registry has size 0")
  hr.register("spawn", "pre", () => {})
  assertEqual(hr.size, 1, "register increases size to 1")
  hr.register("spawn", "post", () => {})
  assertEqual(hr.size, 2, "register increases size to 2")
}

function testHookUnregister() {
  const hr = new HookRegistry()
  hr.register("spawn", "pre", () => {}, { label: "my-hook" })
  hr.register("kill", "pre", () => {}, { label: "other-hook" })
  assertEqual(hr.size, 2, "before unregister: size=2")
  hr.unregister("my-hook")
  assertEqual(hr.size, 1, "after unregister: size=1")
}

function testHookUnregisterNonexistent() {
  const hr = new HookRegistry()
  hr.register("spawn", "pre", () => {}, { label: "hook-1" })
  hr.unregister("nonexistent-label")
  assertEqual(hr.size, 1, "unregister nonexistent label does not affect size")
}

async function testHookPriority() {
  const order: string[] = []
  const hr = new HookRegistry()

  hr.register("spawn", "pre", () => { order.push("low") }, { priority: -10 })
  hr.register("spawn", "pre", () => { order.push("high") }, { priority: 100 })
  hr.register("spawn", "pre", () => { order.push("mid") }, { priority: 0 })

  const mock = makeMockAgent("prio-test")
  await hr.run("spawn", "pre", "prio-test", mock)

  assertEqual(order.join(","), "high,mid,low", "hooks execute in priority order (descending)")
}

async function testHookRunPassesContext() {
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

  assertEqual(captured.join(","), "spawn,pre,ctx-test,running", "hook context has correct fields")
  assert(meta !== undefined, "run returns meta object")
}

async function testHookRunWithData() {
  const hr = new HookRegistry()
  let receivedData: unknown = null

  hr.register("spawn", "pre", (ctx) => {
    receivedData = ctx.data
  })

  const mock = makeMockAgent("data-test")
  await hr.run("spawn", "pre", "data-test", mock, { someKey: "someValue" })

  assertDefined(receivedData, "hook receives data")
  assertEqual((receivedData as any).someKey, "someValue", "hook data has correct value")
}

async function testHookRunMutatesMeta() {
  const hr = new HookRegistry()

  hr.register("spawn", "pre", (ctx) => {
    ctx.meta["mutated"] = true
    ctx.meta["value"] = 42
  })

  const mock = makeMockAgent("meta-test")
  const meta = await hr.run("spawn", "pre", "meta-test", mock)

  assertEqual(meta["mutated"], true, "hook can mutate meta object")
  assertEqual(meta["value"], 42, "hook can set meta values")
}

function testHookClear() {
  const hr = new HookRegistry()
  hr.register("spawn", "pre", () => {})
  hr.register("kill", "post", () => {})
  assertEqual(hr.size, 2, "before clear: size=2")
  hr.clear()
  assertEqual(hr.size, 0, "after clear: size=0")
}

async function testHookNoRegisteredHooks() {
  const hr = new HookRegistry()
  const mock = makeMockAgent("no-hooks")
  // Should not throw
  const meta = await hr.run("spawn", "pre", "no-hooks", mock)
  assertEqual(Object.keys(meta).length, 0, "run with zero hooks returns empty meta")
}

function testHookMultipleLabels() {
  const hr = new HookRegistry()
  hr.register("spawn", "pre", () => {}, { label: "a", priority: 10 })
  hr.register("spawn", "pre", () => {}, { label: "b", priority: 5 })
  hr.register("spawn", "pre", () => {}, { label: "a", priority: 0 }) // Another "a"
  assertEqual(hr.size, 3, "3 hooks registered")
  hr.unregister("a")
  assertEqual(hr.size, 1, "unregister 'a' removes 2 hooks, leaves 1")
}

// ================================================================
//  AGENTMANAGER — EVENT SYSTEM
// ================================================================

console.log("\n=== AgentManager Event System Tests ===\n")

function testEventOnOff() {
  const mgr = freshManager()
  const events: string[] = []

  const cb = (e: AgentEvent) => { events.push(e.type) }

  mgr.onEvent(cb)
  const mgrAny = mgr as any
  mgrAny.emit("agent:spawned", "test-1", { pid: 123 })
  assertEqual(events.length, 1, "onEvent receives events")

  mgr.offEvent(cb)
  mgrAny.emit("agent:spawned", "test-2", { pid: 456 })
  assertEqual(events.length, 1, "offEvent stops receiving events")
}

function testEventMultipleListeners() {
  const mgr = freshManager()
  const list1: string[] = []
  const list2: string[] = []

  mgr.onEvent((e) => { list1.push(e.type) })
  mgr.onEvent((e) => { list2.push(e.type) })

  const mgrAny = mgr as any
  mgrAny.emit("agent:spawned", "multi-test")

  assertEqual(list1.length, 1, "listener 1 receives event")
  assertEqual(list2.length, 1, "listener 2 receives event")
}

function testEventListenerIsolation() {
  const mgr = freshManager()
  const list: string[] = []

  mgr.onEvent((e) => { list.push(e.type) })

  // One listener throws; others should still receive
  mgr.onEvent(() => { throw new Error("crash") })

  const mgrAny = mgr as any
  mgrAny.emit("agent:spawned", "isolated")

  assertEqual(list.length, 1, "other listeners still receive events even if one throws")
}

// ================================================================
//  AGENTMANAGER — IPC MESSAGE HANDLING (private method)
// ================================================================

console.log("\n=== AgentManager IPC Message Handling Tests ===\n")

function testIpcReady() {
  const mgr = freshManager()
  const inst = makeMockAgent("ipc-ready")
  inst.status = "spawning"
  mgr.agents.set("ipc-ready", inst)

  const events: AgentEvent[] = []
  mgr.onEvent((e) => { events.push(e) })

  // Simulate receiving a "ready" result message
  const msg: AgentIpcMessage = { type: "result", id: "1", payload: { status: "ready" }, timestamp: Date.now() }
  const mgrAny = mgr as any
  mgrAny.handleIpcMessage("ipc-ready", msg)

  assertEqual(inst.status, "running", "ready IPC transitions status to 'running'")
  assert(events.some((e) => e.type === "agent:ready"), "ready IPC emits agent:ready event")
}

function testIpcLog() {
  const mgr = freshManager()
  const inst = makeMockAgent("ipc-log")
  inst.log = []
  mgr.agents.set("ipc-log", inst)

  const msg: AgentIpcMessage = { type: "log", id: "1", payload: { level: "info", text: "Hello from worker" }, timestamp: Date.now() }
  const mgrAny = mgr as any
  mgrAny.handleIpcMessage("ipc-log", msg)

  assertEqual(inst.log.length, 1, "log IPC adds log entry")
  assertEqual(inst.log[0]!.text, "Hello from worker", "log IPC captures text")
  assertEqual(inst.log[0]!.level, "info", "log IPC captures level")
}

function testIpcError() {
  const mgr = freshManager()
  const inst = makeMockAgent("ipc-error")
  inst.log = []
  mgr.agents.set("ipc-error", inst)

  const events: AgentEvent[] = []
  mgr.onEvent((e) => { events.push(e) })

  const msg: AgentIpcMessage = { type: "error", id: "1", payload: { message: "Something broke" }, timestamp: Date.now() }
  const mgrAny = mgr as any
  mgrAny.handleIpcMessage("ipc-error", msg)

  assertEqual(inst.log.length, 1, "error IPC adds log entry")
  assertLogContains(inst.log, "Something broke", "error IPC captures message")
  assert(events.some((e) => e.type === "agent:error"), "error IPC emits agent:error event")
}

function testIpcHeartbeat() {
  const mgr = freshManager()
  const inst = makeMockAgent("ipc-hb")
  inst.status = "spawning"
  mgr.agents.set("ipc-hb", inst)

  const msg: AgentIpcMessage = { type: "heartbeat", id: "1", payload: {}, timestamp: Date.now() }
  const mgrAny = mgr as any
  mgrAny.handleIpcMessage("ipc-hb", msg)

  assertEqual(inst.status, "running", "heartbeat transitions spawning→running")
}

function testIpcHeartbeatUpdatesActivity() {
  const mgr = freshManager()
  const inst = makeMockAgent("ipc-hb2")
  inst.lastActivity = 0
  mgr.agents.set("ipc-hb2", inst)

  const msg: AgentIpcMessage = { type: "heartbeat", id: "1", payload: {}, timestamp: Date.now() }
  const mgrAny = mgr as any
  mgrAny.handleIpcMessage("ipc-hb2", msg)

  assert(inst.lastActivity > 0, "heartbeat updates lastActivity")
}

function testIpcResultWithoutReady() {
  const mgr = freshManager()
  const inst = makeMockAgent("ipc-result")
  inst.status = "running"
  mgr.agents.set("ipc-result", inst)

  const events: AgentEvent[] = []
  mgr.onEvent((e) => { events.push(e) })

  const msg: AgentIpcMessage = { type: "result", id: "1", payload: { output: "task complete" }, timestamp: Date.now() }
  const mgrAny = mgr as any
  mgrAny.handleIpcMessage("ipc-result", msg)

  // No "ready" in payload, so status stays unchanged
  assertEqual(inst.status, "running", "result without ready does not change status")
  assert(events.some((e) => e.type === "agent:result"), "result IPC emits agent:result event")
}

// ================================================================
//  AGENTMANAGER — sendIpc
// ================================================================

console.log("\n=== AgentManager sendIpc Tests ===\n")

function testSendIpc() {
  const mgr = freshManager()
  const written: Uint8Array[] = []
  let flushed = false

  const fakeStdin = {
    write: (data: Uint8Array) => { written.push(data) },
    flush: () => { flushed = true },
  } as any

  const inst = makeMockAgent("send-test")
  ;(inst.process as any).stdin = fakeStdin
  mgr.agents.set("send-test", inst)

  mgr.sendIpc("send-test", { type: "ping", id: "ping-1", payload: {}, timestamp: Date.now() })

  assert(written.length >= 1, "sendIpc writes to stdin")
  assert(flushed, "sendIpc flushes stdin")
  const decoded = new TextDecoder().decode(written[0]!)
  const parsed = JSON.parse(decoded.trim())
  assertEqual(parsed.type, "ping", "sent IPC message has correct type")
  assertEqual(parsed.id, "ping-1", "sent IPC message has correct id")
}

function testSendIpcNonexistent() {
  const mgr = freshManager()
  try {
    mgr.sendIpc("no-such-agent", { type: "ping", id: "1", payload: {}, timestamp: Date.now() })
    assert(false, "sendIpc should throw for nonexistent agent")
  } catch (e: any) {
    assert(e.message.includes("not found"), "sendIpc throws 'not found' error")
  }
}

function testSendIpcClosedStdin() {
  const mgr = freshManager()
  const inst = makeMockAgent("closed-stdin")
  ;(inst.process as any).stdin = null as any
  mgr.agents.set("closed-stdin", inst)

  try {
    mgr.sendIpc("closed-stdin", { type: "ping", id: "1", payload: {}, timestamp: Date.now() })
    assert(false, "sendIpc should throw when stdin is null")
  } catch (e: any) {
    assert(e.message.includes("no writable stdin"), "sendIpc throws 'no writable stdin' error")
  }
}

// ================================================================
//  AGENTMANAGER — kill flow
// ================================================================

console.log("\n=== AgentManager Kill Flow Tests ===\n")

async function testKillChangesStatus() {
  const mgr = freshManager()
  const inst = makeMockAgent("kill-status")
  mgr.agents.set("kill-status", inst)

  const events: AgentEvent[] = []
  mgr.onEvent((e) => { events.push(e) })

  await mgr.kill("kill-status", 100)

  assert(events.some((e) => e.type === "agent:stopped"), "kill emits agent:stopped event")
}

async function testKillNonexistent() {
  const mgr = freshManager()
  try {
    await mgr.kill("no-such-agent", 100)
    assert(false, "kill should throw for nonexistent agent")
  } catch (e: any) {
    assert(e.message.includes("not found"), "kill throws 'not found' error")
  }
}

async function testKillAlreadyStopped() {
  const mgr = freshManager()
  const inst = makeMockAgent("already-stopped")
  inst.status = "stopped"
  mgr.agents.set("already-stopped", inst)

  // Should not throw
  await mgr.kill("already-stopped", 100)
  assert(true, "kill on already-stopped agent does not throw")
}

async function testKillCancelsRecovery() {
  const mgr = freshManager()
  const inst = makeMockAgent("kill-recovery")
  inst.def.recovery = { maxRetries: 5, backoffMs: 1000 }
  mgr.agents.set("kill-recovery", inst)

  // Schedule recovery first
  const mgrAny = mgr as any
  mgrAny.triggerRecovery("kill-recovery", 1)
  assert(mgr.hasPendingRecovery("kill-recovery"), "recovery scheduled")

  await mgr.kill("kill-recovery", 100)
  assert(!mgr.hasPendingRecovery("kill-recovery"), "kill cancels pending recovery")
}

// ================================================================
//  AGENTMANAGER — Query / List / Find
// ================================================================

console.log("\n=== AgentManager Query/List/Find Tests ===\n")

function testGet() {
  const mgr = freshManager()
  const inst = makeMockAgent("get-test")
  mgr.agents.set("get-test", inst)

  const found = mgr.get("get-test")
  assertDefined(found, "get returns agent by ID")
  assertEqual(found!.id, "get-test", "get returns correct agent")

  const notFound = mgr.get("nonexistent")
  assertEqual(notFound, undefined, "get returns undefined for nonexistent")
}

function testListAll() {
  const mgr = freshManager()
  mgr.agents.set("list-1", makeMockAgent("list-1"))
  mgr.agents.set("list-2", makeMockAgent("list-2"))
  mgr.agents.set("list-3", makeMockAgent("list-3"))

  const all = mgr.list()
  assertEqual(all.length, 3, "list() returns all 3 agents")
}

function testListFilterByStatus() {
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
  assertEqual(running.length, 2, "list filter by status: running=2")

  const stopped = mgr.list({ status: "stopped" })
  assertEqual(stopped.length, 1, "list filter by status: stopped=1")
}

function testListFilterByAgentType() {
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
  assertEqual(buildAgents.length, 2, "list filter by agentType: build=2")
}

function testListFilterByTag() {
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
  assertEqual(prod.length, 2, "list filter by tag: production=2")

  const dev = mgr.list({ tag: "development" })
  assertEqual(dev.length, 1, "list filter by tag: development=1")

  const nonexistent = mgr.list({ tag: "nonexistent" })
  assertEqual(nonexistent.length, 0, "list filter by tag: nonexistent=0")
}

function testListCombinedFilters() {
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
  assertEqual(result.length, 1, "list combined filters: build+production=1")
  assertEqual(result[0]!.id, "build-prod", "combined filter returns correct agent")
}

function testListEmpty() {
  const mgr = freshManager()
  const all = mgr.list()
  assertEqual(all.length, 0, "list() returns empty for no agents")
}

function testFindAgentByName() {
  const mgr = freshManager()
  const a1 = makeMockAgent("id-1")
  a1.def.name = "Alice"
  const a2 = makeMockAgent("id-2")
  a2.def.name = "Bob"
  mgr.agents.set("id-1", a1)
  mgr.agents.set("id-2", a2)

  const found = mgr.findAgentByName("Alice")
  assertDefined(found, "findAgentByName finds agent")
  assertEqual(found!.id, "id-1", "findAgentByName returns correct agent")

  const notFound = mgr.findAgentByName("Charlie")
  assertEqual(notFound, undefined, "findAgentByName returns undefined for no match")
}

function testFindAgentByType() {
  const mgr = freshManager()
  const a1 = makeMockAgent("builder-1")
  a1.def.agentType = "build"
  const a2 = makeMockAgent("builder-2")
  a2.def.agentType = "build"
  mgr.agents.set("builder-1", a1)
  mgr.agents.set("builder-2", a2)

  const found = mgr.findAgentByType("build")
  assertDefined(found, "findAgentByType finds first agent of type")
  assert(found!.def.agentType === "build", "findAgentByType returns correct type")

  const notFound = mgr.findAgentByType("nonexistent")
  assertEqual(notFound, undefined, "findAgentByType returns undefined for no match")
}

function testGetLogs() {
  const mgr = freshManager()
  const inst = makeMockAgent("logs-test")
  inst.log = [
    { level: "info", text: "started", timestamp: 100 },
    { level: "error", text: "error happened", timestamp: 200 },
    { level: "info", text: "more info", timestamp: 300 },
  ]
  mgr.agents.set("logs-test", inst)

  const all = mgr.getLogs("logs-test")
  assertEqual(all.length, 3, "getLogs returns all logs")

  const errors = mgr.getLogs("logs-test", { level: "error" })
  assertEqual(errors.length, 1, "getLogs filters by level")
  assertEqual(errors[0]!.text, "error happened", "getLogs level filter returns correct entry")

  const tail = mgr.getLogs("logs-test", { tail: 2 })
  assertEqual(tail.length, 2, "getLogs respects tail limit")
  assertEqual(tail[0]!.text, "error happened", "getLogs tail returns most recent")
}

function testGetLogsNonexistent() {
  const mgr = freshManager()
  const logs = mgr.getLogs("no-such-agent")
  assertEqual(logs.length, 0, "getLogs returns empty for nonexistent agent")
}

// ================================================================
//  AGENTMANAGER — Route IPC
// ================================================================

console.log("\n=== AgentManager Route IPC Tests ===\n")

async function testRouteIpcSourceNotFound() {
  const mgr = freshManager()
  const to = makeMockAgent("target")
  mgr.agents.set("target", to)

  try {
    await mgr.routeIpc("no-source", "target", { type: "ping", id: "1", payload: {}, timestamp: Date.now() })
    assert(false, "routeIpc should throw when source not found")
  } catch (e: any) {
    assert(e.message.includes("Source agent"), "routeIpc throws source not found")
  }
}

async function testRouteIpcTargetNotFound() {
  const mgr = freshManager()
  const from = makeMockAgent("source")
  mgr.agents.set("source", from)

  try {
    await mgr.routeIpc("source", "no-target", { type: "ping", id: "1", payload: {}, timestamp: Date.now() })
    assert(false, "routeIpc should throw when target not found")
  } catch (e: any) {
    assert(e.message.includes("Target agent"), "routeIpc throws target not found")
  }
}

// ================================================================
//  AGENTMANAGER — Destroy
// ================================================================

console.log("\n=== AgentManager Destroy Tests ===\n")

async function testDestroy() {
  const mgr = freshManager()
  mgr.agents.set("destroy-1", makeMockAgent("destroy-1"))
  mgr.agents.set("destroy-2", makeMockAgent("destroy-2"))
  mgr.hooks.register("spawn", "pre", () => {})

  assertEqual(mgr.agents.size, 2, "before destroy: 2 agents")
  assert(mgr.hooks.size > 0, "before destroy: hooks registered")

  await mgr.destroy()

  assertEqual(mgr.agents.size, 0, "after destroy: 0 agents")
  assertEqual(mgr.hooks.size, 0, "after destroy: 0 hooks")
}

async function testDestroyEmpty() {
  const mgr = freshManager()
  // Should not throw
  await mgr.destroy()
  assert(true, "destroy on empty manager does not throw")
}

// ================================================================
//  AGENTMANAGER — Pending Instance / makeLog
// ================================================================

console.log("\n=== AgentManager Utils Tests ===\n")

function testMakeLog() {
  const mgr = freshManager()
  const mgrAny = mgr as any

  const log = mgrAny.makeLog("info", "test message")
  assertEqual(log.level, "info", "makeLog sets level")
  assertEqual(log.text, "test message", "makeLog sets text")
  assert(typeof log.timestamp === "number", "makeLog sets numeric timestamp")
}

function testCancelRecoveryIdempotent() {
  const mgr = freshManager()
  // Should not throw when no recovery state exists
  mgr.cancelRecovery("nonexistent")
  assert(true, "cancelRecovery on nonexistent does not throw")
}

function testHasPendingRecoveryNonexistent() {
  const mgr = freshManager()
  assert(!mgr.hasPendingRecovery("nonexistent"), "hasPendingRecovery returns false for nonexistent")
}

// ================================================================
//  AGENTENGINE — parameterToJsonSchema
// ================================================================

console.log("\n=== AgentEngine Utility Tests ===\n")

function testEngineConstructor() {
  const runtime = new AgentRuntime({ agentId: "engine-test", cwd: "." })
  const engine = new AgentEngine(runtime, {} as any, { maxSteps: 5 })
  assert(true, "AgentEngine constructor with maxSteps succeeds")
}

function testEngineDefaultMaxSteps() {
  const runtime = new AgentRuntime({ agentId: "engine-default", cwd: "." })
  const engine = new AgentEngine(runtime, {} as any)
  assert(true, "AgentEngine constructor with defaults succeeds")
}

// ================================================================
//  RUNNER
// ================================================================

async function runAll() {
  // We must run async tests first, since top-level await might not be available
  // in all contexts. We use an async IIFE within runAll.

  // HookRegistry tests (sync)
  testHookRegister()
  testHookUnregister()
  testHookUnregisterNonexistent()
  await testHookPriority()
  await testHookRunPassesContext()
  await testHookRunWithData()
  await testHookRunMutatesMeta()
  testHookClear()
  await testHookNoRegisteredHooks()
  testHookMultipleLabels()

  // Event system (sync)
  testEventOnOff()
  testEventMultipleListeners()
  testEventListenerIsolation()

  // IPC handling (sync — private methods)
  testIpcReady()
  testIpcLog()
  testIpcError()
  testIpcHeartbeat()
  testIpcHeartbeatUpdatesActivity()
  testIpcResultWithoutReady()

  // sendIpc (sync)
  testSendIpc()
  testSendIpcNonexistent()
  testSendIpcClosedStdin()

  // Kill (async)
  await testKillChangesStatus()
  await testKillNonexistent()
  await testKillAlreadyStopped()
  await testKillCancelsRecovery()

  // Query/List/Find (sync)
  testGet()
  testListAll()
  testListFilterByStatus()
  testListFilterByAgentType()
  testListFilterByTag()
  testListCombinedFilters()
  testListEmpty()
  testFindAgentByName()
  testFindAgentByType()
  testGetLogs()
  testGetLogsNonexistent()

  // Route IPC (async — routeIpc throws via rejected promise)
  await testRouteIpcSourceNotFound()
  await testRouteIpcTargetNotFound()

  // Destroy (async)
  await testDestroy()
  await testDestroyEmpty()

  // Utils (sync)
  testMakeLog()
  testCancelRecoveryIdempotent()
  testHasPendingRecoveryNonexistent()

  // AgentEngine (sync)
  testEngineConstructor()
  testEngineDefaultMaxSteps()

  // Summary
  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()

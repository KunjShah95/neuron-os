#!/usr/bin/env bun
/**
 * Full-stack integration test: API server → agent spawn → WebSocket event feed.
 *
 * Flow:
 *   1. Find a free port, start the API server
 *   2. Connect a WebSocket client to /api/v1/ws
 *   3. Spawn an agent via POST /api/v1/agents
 *   4. Collect WebSocket events until agent:ready is received
 *   5. Verify the event sequence: connected → agent:spawned → agent:ready
 *   6. Clean up (kill agent, stop server)
 *
 * Does NOT require AI API keys — tests the orchestration layer only.
 */

import { startApiServer } from "./api/server"
import { agentManager } from "./agent/manager"

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

// ── Helpers ───────────────────────────────────────────────────────────

/** Find a free port by asking the OS. */
async function findFreePort(): Promise<number> {
  const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() })
  const port: number = srv.port ?? 0
  srv.stop()
  return port
}

/** Wait for a WebSocket connection to open (with timeout). */
function waitForOpen(ws: WebSocket, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) { resolve(); return }
    const timer = setTimeout(() => reject(new Error("WebSocket connection timeout")), timeoutMs)
    ws.addEventListener("open", () => { clearTimeout(timer); resolve() }, { once: true })
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("WebSocket connection error")) }, { once: true })
  })
}

/** Collect WebSocket messages until a predicate is met or timeout. */
function collectWsMessages(
  ws: WebSocket,
  predicate: (msg: any) => boolean,
  timeoutMs = 15_000,
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const messages: any[] = []
    const timer = setTimeout(() => {
      ws.removeEventListener("message", handler)
      reject(new Error(`Timed out waiting for predicate. Collected ${messages.length} messages: ${
        JSON.stringify(messages.map((m: any) => m.event))
      }`))
    }, timeoutMs)

    function handler(event: MessageEvent) {
      try {
        const parsed = JSON.parse(event.data as string)
        messages.push(parsed)
        if (predicate(parsed)) {
          clearTimeout(timer)
          ws.removeEventListener("message", handler)
          resolve(messages)
        }
      } catch { /* skip malformed messages */ }
    }

    ws.addEventListener("message", handler)
  })
}

// ── Cleanup ───────────────────────────────────────────────────────────

async function cleanup(server: { stop: () => void }, agentIds: string[]) {
  for (const id of agentIds) {
    try { await agentManager.kill(id, 2_000) } catch { /* best effort */ }
  }
  await agentManager.destroy()
  server.stop()
}

// ── Tests ─────────────────────────────────────────────────────────────

async function testFullStackWsEventFlow() {
  console.log("\n  Test: Full-stack API → agent spawn → WebSocket event flow")

  const port = await findFreePort()
  const server = startApiServer({ port, host: "127.0.0.1" })
  const spawnedIds: string[] = []

  try {
    // ── Step 1: Connect WebSocket ──────────────────────────────────
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/ws`)
    await waitForOpen(ws)

    // ── Step 2: Wait for the "connected" event ─────────────────────
    const allEvents = await collectWsMessages(
      ws,
      (msg) => msg.event === "connected",
      5_000,
    )
    assert(allEvents.length > 0, "received 'connected' WS event")
    const connectedMsg: any = allEvents.find((m: any) => m.event === "connected")
    assert(connectedMsg?.data?.clientId, "'connected' event has clientId")
    assert(Array.isArray(connectedMsg?.data?.agents), "'connected' event has agents array")
    assertEqual(connectedMsg.data.agents.length, 0, "initial agent list is empty")

    // ── Step 3: Start collecting events for agent spawn ────────────
    const spawnPromise = collectWsMessages(
      ws,
      (msg) => msg.event === "agent:ready",
      15_000,
    )

    // ── Step 4: Spawn an agent via the API ─────────────────────────
    const spawnRes = await fetch(`http://127.0.0.1:${port}/api/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "integ-test-agent" }),
    })
    assertEqual(spawnRes.status, 201, "POST /api/v1/agents returns 201")
    const spawnBody: any = await spawnRes.json()
    assert(spawnBody.id, "spawn response has agent id")
    spawnedIds.push(spawnBody.id)

    // ── Step 5: Verify WebSocket received agent events ─────────────
    const agentEvents: any[] = await spawnPromise

    // Check event sequence
    const eventNames = agentEvents.map((m: any) => m.event).join(",")
    assert(eventNames.includes("agent:spawned"), "event sequence includes 'agent:spawned'")
    assert(eventNames.includes("agent:ready"), "event sequence includes 'agent:ready'")

    // Check event data
    const spawnedEvent: any = agentEvents.find((m: any) => m.event === "agent:spawned")
    assert(spawnedEvent?.data?.agentId, "agent:spawned event has agentId")

    const readyEvent: any = agentEvents.find((m: any) => m.event === "agent:ready")
    assert(readyEvent?.data?.agentId, "agent:ready event has agentId")

    // ── Step 6: Verify WS health endpoint ──────────────────────────
    const healthRes = await fetch(`http://127.0.0.1:${port}/api/v1/ws/health`)
    assertEqual(healthRes.status, 200, "WS health endpoint returns 200")
    const healthBody: any = await healthRes.json()
    assertEqual(healthBody.status, "running", "WS health: bridge is running")
    assert(healthBody.clients.connected >= 1, "WS health: at least 1 client connected")
    assert(healthBody.totalConnections >= 1, "WS health: totalConnections tracked")

    ws.close()
    console.log("  ✅ Full-stack WS event flow test passed\n")
  } finally {
    await cleanup(server, spawnedIds)
  }
}

async function testHealthEndpoint() {
  console.log("\n  Test: API server health endpoint")

  const port = await findFreePort()
  const server = startApiServer({ port, host: "127.0.0.1" })

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`)
    assertEqual(res.status, 200, "health endpoint returns 200")
    const body: any = await res.json()
    assertEqual(body.status, "ok", "health status is ok")
    assert(body.version, "health has version")
    assert(typeof body.uptime === "number", "health has uptime")
    assertEqual(body.agents.total, 0, "health: no agents initially")
    assertEqual(body.agents.running, 0, "health: no running agents initially")
  } finally {
    server.stop()
  }
}

async function testAgentListEndpoint() {
  console.log("\n  Test: Agent list endpoint")

  const port = await findFreePort()
  const server = startApiServer({ port, host: "127.0.0.1" })
  const spawnedIds: string[] = []

  try {
    // Initially empty
    const res1 = await fetch(`http://127.0.0.1:${port}/api/v1/agents`)
    assertEqual(res1.status, 200, "GET /api/v1/agents returns 200")
    const body1: any = await res1.json()
    assert(Array.isArray(body1.agents), "agent list is an array")
    assertEqual(body1.agents.length, 0, "agent list is initially empty")

    // Spawn an agent
    const spawnRes = await fetch(`http://127.0.0.1:${port}/api/v1/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "list-test-agent" }),
    })
    const spawnBody: any = await spawnRes.json()
    spawnedIds.push(spawnBody.id)

    // Agent is already ready (spawn() returned success), verify status directly
    const agent = agentManager.get(spawnBody.id)
    assert(agent !== undefined, "agent exists in manager after spawn")
    if (agent) {
      assert(agent.status === "running" || agent.status === "spawning",
        `agent status is running or spawning (was: ${agent.status})`)
    }

    // Now list should show 1 agent
    const res2 = await fetch(`http://127.0.0.1:${port}/api/v1/agents`)
    const body2: any = await res2.json()
    assertEqual(body2.agents.length, 1, "agent list has 1 entry after spawn")
    assertEqual(body2.agents[0].name, "list-test-agent", "agent name matches")

    // Get single agent detail
    const res3 = await fetch(`http://127.0.0.1:${port}/api/v1/agents/${spawnBody.id}`)
    assertEqual(res3.status, 200, "GET /api/v1/agents/:id returns 200")
    const body3: any = await res3.json()
    assertEqual(body3.id, spawnBody.id, "agent detail id matches")
    assert(body3.status, "agent detail has status")
    assert(typeof body3.logCount === "number", "agent detail has logCount")

    // Kill the agent
    const killRes = await fetch(`http://127.0.0.1:${port}/api/v1/agents/${spawnBody.id}`, {
      method: "DELETE",
    })
    assertEqual(killRes.status, 200, "DELETE /api/v1/agents/:id returns 200")
  } finally {
    await cleanup(server, spawnedIds)
  }
}

async function testWsSseFallback() {
  console.log("\n  Test: SSE fallback endpoint")

  const port = await findFreePort()
  const server = startApiServer({ port, host: "127.0.0.1" })

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/events`)
    assertEqual(res.status, 200, "SSE endpoint returns 200")
    assertEqual(res.headers.get("content-type"), "text/event-stream", "SSE has correct content-type")
    assertEqual(res.headers.get("cache-control"), "no-cache", "SSE has no-cache")

    // Read initial event from the stream
    const reader = res.body?.getReader()
    assert(!!reader, "SSE response has readable body")

    if (reader) {
      const decoder = new TextDecoder()
      const { done, value } = await reader.read()
      assert(!done, "SSE stream is not done after first read")
      const chunk = decoder.decode(value)
      assert(chunk.includes('"event":"connected"'), "SSE first event data has event:connected")
      assert(chunk.includes('"agents"'), "SSE event data includes agents field")
      reader.releaseLock()
    }
  } finally {
    server.stop()
  }
}

// ── Runner ────────────────────────────────────────────────────────────

async function runAll() {
  console.log("\n  ╔══════════════════════════════════════════╗")
  console.log("  ║   Full-Stack Integration Tests           ║")
  console.log("  ╚══════════════════════════════════════════╝")

  await testHealthEndpoint()
  await testAgentListEndpoint()
  await testWsSseFallback()
  await testFullStackWsEventFlow()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()

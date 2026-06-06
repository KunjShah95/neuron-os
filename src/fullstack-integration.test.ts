import { describe, it, expect } from "bun:test"
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

describe("Fullstack Integration Tests", () => {

// ── Helpers ───────────────────────────────────────────────────────────

/** Find a free port by asking the OS. */
async function findFreePort(): Promise<number> {
  const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() })
  const port: number = srv.port ?? 0
  srv.stop()
  return port
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

it("should full stack ws event flow", async () => {
  console.log("\n  Test: Full-stack API → agent spawn → WebSocket event flow")

  const port = await findFreePort()
  const server = startApiServer({ port, host: "127.0.0.1" })
  const spawnedIds: string[] = []

  try {
    // ── Step 1: Connect WebSocket ──────────────────────────────────
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/ws`)
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WS connect timeout")), 5_000)
      ws.addEventListener("open", () => { clearTimeout(timer); resolve() }, { once: true })
      ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("WS connect error")) }, { once: true })
    })

    // ── Step 2: Start collecting events for agent spawn ─────────────
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
    expect(spawnRes.status).toBe(201)
    const spawnBody: any = await spawnRes.json()
    expect(typeof spawnBody.id).toBe("string")
    expect(spawnBody.id.length).toBeGreaterThan(0)
    spawnedIds.push(spawnBody.id)

    // ── Step 5: Verify WebSocket received agent events ─────────────
    const agentEvents: any[] = await spawnPromise

    // Check event sequence
    const eventNames = agentEvents.map((m: any) => m.event).join(",")
    expect(eventNames.includes("agent:spawned")).toBe(true)
    expect(eventNames.includes("agent:ready")).toBe(true)

    // Check event data
    const spawnedEvent: any = agentEvents.find((m: any) => m.event === "agent:spawned")
    expect(typeof spawnedEvent?.data?.agentId).toBe("string")

    const readyEvent: any = agentEvents.find((m: any) => m.event === "agent:ready")
    expect(typeof readyEvent?.data?.agentId).toBe("string")

    // ── Step 6: Verify WS health endpoint ──────────────────────────
    const healthRes = await fetch(`http://127.0.0.1:${port}/api/v1/ws/health`)
    expect(healthRes.status).toBe(200)
    const healthBody: any = await healthRes.json()
    expect(healthBody.status).toBe("running")
    expect(healthBody.clients.connected >= 1).toBe(true)
    expect(healthBody.totalConnections >= 1).toBe(true)

    ws.close()
    console.log("  ✅ Full-stack WS event flow test passed\n")
  } finally {
    await cleanup(server, spawnedIds)
  }
}, 30_000)

it("should health endpoint", async () => {
  console.log("\n  Test: API server health endpoint")

  const port = await findFreePort()
  const server = startApiServer({ port, host: "127.0.0.1" })

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`)
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.status).toBe("ok")
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(typeof body.uptime === "number").toBe(true)
    expect(typeof body.agents.total === "number").toBe(true)
    expect(typeof body.agents.running === "number").toBe(true)
  } finally {
    server.stop()
  }
}, 15_000)

it("should agent list endpoint", async () => {
  console.log("\n  Test: Agent list endpoint")
  // Default bun:test timeout is 5s, but agent spawn + cleanup from prior
  // test can leave the manager busy. Give the second test more headroom.
  // (Bun: pass timeout as third arg to `it()`.)

  const port = await findFreePort()
  const server = startApiServer({ port, host: "127.0.0.1" })
  const spawnedIds: string[] = []

  try {
    // Initially empty
    const res1 = await fetch(`http://127.0.0.1:${port}/api/v1/agents`)
    expect(res1.status).toBe(200)
    const body1: any = await res1.json()
    expect(Array.isArray(body1.agents)).toBe(true)
    expect(body1.agents.length).toBe(0)

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
    expect(agent !== undefined).toBe(true)
    if (agent) {
      expect(agent.status === "running" || agent.status === "spawning").toBe(true)
    }

    // Now list should show 1 agent
    const res2 = await fetch(`http://127.0.0.1:${port}/api/v1/agents`)
    const body2: any = await res2.json()
    expect(body2.agents.length).toBe(1)
    expect(body2.agents[0].name).toBe("list-test-agent")

    // Get single agent detail
    const res3 = await fetch(`http://127.0.0.1:${port}/api/v1/agents/${spawnBody.id}`)
    expect(res3.status).toBe(200)
    const body3: any = await res3.json()
    expect(body3.id).toBe(spawnBody.id)
    expect(body3.status).toBeTruthy()
    expect(typeof body3.logCount === "number").toBe(true)

    // Kill the agent
    const killRes = await fetch(`http://127.0.0.1:${port}/api/v1/agents/${spawnBody.id}`, {
      method: "DELETE",
    })
    expect(killRes.status).toBe(200)
  } finally {
    await cleanup(server, spawnedIds)
  }
}, 20_000)

it("should ws sse fallback", async () => {
  console.log("\n  Test: SSE fallback endpoint")

  const port = await findFreePort()
  const server = startApiServer({ port, host: "127.0.0.1" })

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/events`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/event-stream")
    expect(res.headers.get("cache-control")).toBe("no-cache")

    // Read initial event from the stream
    const reader = res.body?.getReader()
    expect(!!reader).toBe(true)

    if (reader) {
      const decoder = new TextDecoder()
      const { done, value } = await reader.read()
      expect(!done).toBe(true)
      const chunk = decoder.decode(value)
      expect(chunk.includes('"event":"connected"')).toBe(true)
      expect(chunk.includes('"agents"')).toBe(true)
      reader.releaseLock()
    }
  } finally {
    server.stop()
  }
}, 15_000)

// ── Runner ────────────────────────────────────────────────────────────

})

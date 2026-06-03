#!/usr/bin/env bun
import { AgentMemoryConnector } from "./agentmemory"

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

function assertDeepEqual<T>(a: T, b: T, label: string) {
  if (JSON.stringify(a) === JSON.stringify(b)) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
}

const MOCK_PORT = 13111
const BASE = `http://localhost:${MOCK_PORT}`

type MockHandler = (body?: any, req?: Request) => Response

function mockServer(handlers: Record<string, MockHandler>) {
  return Bun.serve({
    port: MOCK_PORT,
    async fetch(req) {
      const url = new URL(req.url)
      const path = url.pathname
      const handler = handlers[path]
      if (!handler) return new Response("Not found", { status: 404 })
      let body: any
      try { body = await req.json() } catch {}
      return handler(body, req)
    },
  })
}

// ── Construction ──────────────────────────────────────────────────

function testConstruction() {
  const c1 = new AgentMemoryConnector()
  assertEqual((c1 as any).baseUrl, "http://localhost:3111", "default URL")

  const c2 = new AgentMemoryConnector({ url: "http://custom:9999", secret: "s3kr1t" })
  assertEqual((c2 as any).baseUrl, "http://custom:9999", "custom URL")
  assertEqual((c2 as any).secret, "s3kr1t", "custom secret")

  const c3 = new AgentMemoryConnector({ enabled: false })
  assertEqual((c3 as any).enabled, false, "disabled via config")
}

// ── Graceful degradation (server down) ────────────────────────────

async function testDegradation() {
  const c = new AgentMemoryConnector({ url: "http://localhost:31199" })
  assertEqual(await c.isAvailable(), false, "isAvailable=false when server down")
  assertDeepEqual(await c.search("test"), [], "search returns [] when server down")
  assertEqual(await c.remember("x"), null, "remember returns null when server down")
  assertEqual(await c.getContext("sid"), null, "getContext returns null when server down")
  assertEqual(await c.startSession(), null, "startSession returns null when server down")
  assertDeepEqual(await c.listSessions(), [], "listSessions returns [] when server down")
  assertDeepEqual(await c.getStats(), {}, "getStats returns {} when server down")
}

// ── Health & availability ─────────────────────────────────────────

async function testHealth() {
  const svr = mockServer({
    "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok", service: "iii-engine" })),
    "/agentmemory/health": () => new Response(JSON.stringify({ status: "ok", service: "iii-engine", viewerPort: 8080 })),
  })

  const c = new AgentMemoryConnector({ url: BASE })
  const available = await c.isAvailable()
  assert(available, "isAvailable=true when server healthy")
  const health = await c.getHealth()
  assertEqual(health?.status, "ok", "health status ok")
  assertEqual(health?.viewerPort, 8080, "health viewerPort")

  svr.stop(true)
}

async function testHealthCaching() {
  let callCount = 0
  const svr = mockServer({
    "/agentmemory/livez": () => { callCount++; return new Response(JSON.stringify({ status: "ok" })) },
  })

  const c = new AgentMemoryConnector({ url: BASE })
  await c.isAvailable()
  await c.isAvailable()
  await c.isAvailable()
  assertEqual(callCount, 1, "health result cached (only 1 call)")

  svr.stop(true)
}

// ── CRUD operations ───────────────────────────────────────────────

async function testSearch() {
  const svr = mockServer({
    "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
    "/agentmemory/smart-search": () => new Response(JSON.stringify({
      results: [
        { content: "Found result about DB performance", score: 0.95, timestamp: "2026-01-01T00:00:00Z" },
        { content: "Another related memory", score: 0.82 },
      ],
    })),
  })

  const c = new AgentMemoryConnector({ url: BASE })
  const results = await c.search("database performance")
  assertEqual(results.length, 2, "search returns 2 results")
  assertEqual(results[0]?.score, 0.95, "search result has score")
  assertEqual(results[1]?.content, "Another related memory", "search result has content")

  svr.stop(true)
}

async function testRemember() {
  const svr = mockServer({
    "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
    "/agentmemory/remember": (body) => {
      assert((body as any).content === "test insight", "remember receives content")
      assert(body.type === "insight", "remember receives type")
      return new Response(JSON.stringify({ id: "mem-123" }))
    },
  })

  const c = new AgentMemoryConnector({ url: BASE })
  const id = await c.remember("test insight")
  assertEqual(id, "mem-123", "remember returns memory ID")

  svr.stop(true)
}

async function testRememberWithConcepts() {
  const svr = mockServer({
    "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
    "/agentmemory/remember": (body) => {
      assertDeepEqual((body as any).concepts, ["ai", "testing"], "remember sends concepts")
      return new Response(JSON.stringify({ id: "mem-456" }))
    },
  })

  const c = new AgentMemoryConnector({ url: BASE })
  const id = await c.remember("test with concepts", "insight", ["ai", "testing"])
  assertEqual(id, "mem-456", "remember with concepts returns ID")

  svr.stop(true)
}

async function testObserve() {
  let received: any = null
  const svr = mockServer({
    "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
    "/agentmemory/observe": (body) => { received = body; return new Response(JSON.stringify({ ok: true })) },
  })

  const c = new AgentMemoryConnector({ url: BASE })
  await c.observe("session-1", "tool called: read_file")
  assertEqual(received?.sessionId, "session-1", "observe sends sessionId")
  assertEqual(received?.content, "tool called: read_file", "observe sends content")

  svr.stop(true)
}

async function testContext() {
  const svr = mockServer({
    "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
    "/agentmemory/context": (body) => {
      assertEqual((body as any).sessionId, "sid-1", "context receives sessionId")
      return new Response(JSON.stringify({ context: "Captured context from agent run" }))
    },
  })

  const c = new AgentMemoryConnector({ url: BASE })
  const ctx = await c.getContext("sid-1")
  assertEqual(ctx, "Captured context from agent run", "getContext returns context string")

  svr.stop(true)
}

async function testSessionLifecycle() {
  const svr = mockServer({
    "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
    "/agentmemory/session/start": () => new Response(JSON.stringify({ sessionId: "session-new" })),
    "/agentmemory/session/end": () => new Response(JSON.stringify({ ok: true })),
  })

  const c = new AgentMemoryConnector({ url: BASE })
  const sid = await c.startSession()
  assertEqual(sid, "session-new", "startSession returns session ID")

  await c.endSession("session-new")
  // No throw = pass
  assert(true, "endSession completes without error")

  svr.stop(true)
}

async function testListSessions() {
  const svr = mockServer({
    "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
    "/agentmemory/sessions": () => new Response(JSON.stringify({
      sessions: [
        { id: "s1", summary: "First session", created: "2026-01-01T00:00:00Z", observationCount: 5 },
        { id: "s2", summary: "Second session", created: "2026-01-02T00:00:00Z", observationCount: 3 },
      ],
    })),
  })

  const c = new AgentMemoryConnector({ url: BASE })
  const sessions = await c.listSessions()
  assertEqual(sessions.length, 2, "listSessions returns 2 sessions")
  assertEqual(sessions[0]?.id, "s1", "first session id")
  assertEqual(sessions[1]?.observationCount, 3, "second session observationCount")

  svr.stop(true)
}

async function testForget() {
  const svr = mockServer({
    "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
    "/agentmemory/forget": (_body) => {
      assertDeepEqual(_body.observationIds, ["obs-1", "obs-2"], "forget sends observationIds")
      return new Response(JSON.stringify({ ok: true }))
    },
  })

  const c = new AgentMemoryConnector({ url: BASE })
  await c.forget(["obs-1", "obs-2"])
  assert(true, "forget completes without error")

  svr.stop(true)
}

async function testGetStats() {
  const svr = mockServer({
    "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
    "/agentmemory/health": () => new Response(JSON.stringify({ status: "ok", service: "iii-engine" })),
    "/agentmemory/sessions": () => new Response(JSON.stringify({
      sessions: [{ id: "s1", created: "2026-01-01T00:00:00Z" }],
    })),
  })

  const c = new AgentMemoryConnector({ url: BASE })
  const stats = await c.getStats()
  assertEqual(stats.totalSessions, 1, "getStats returns session count")

  svr.stop(true)
}

// ── Auth headers ──────────────────────────────────────────────────

async function testAuthHeaders() {
  let authHeader: string | null = null
  const svr = mockServer({
    "/agentmemory/livez": (_body, req) => {
      authHeader = req ? req.headers.get("authorization") : null
      return new Response(JSON.stringify({ status: "ok" }))
    },
  })

  const c = new AgentMemoryConnector({ url: BASE, secret: "my-token" })
  await c.isAvailable()
  assertEqual(authHeader, "Bearer my-token", "sends Bearer token in Authorization header")

  svr.stop(true)
}

// ── Disabled mode ─────────────────────────────────────────────────

async function testDisabledMode() {
  let hitServer = false
  const svr = mockServer({
    "/agentmemory/livez": () => { hitServer = true; return new Response(JSON.stringify({ status: "ok" })) },
  })

  const c = new AgentMemoryConnector({ url: BASE, enabled: false })
  assertEqual(await c.isAvailable(), false, "disabled: isAvailable=false")
  assertDeepEqual(await c.search("test"), [], "disabled: search returns []")
  assertEqual(await c.remember("x"), null, "disabled: remember returns null")
  assert(!hitServer, "disabled: no HTTP requests made")

  svr.stop(true)
}

async function testServerError() {
  const svr = mockServer({
    "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
    "/agentmemory/smart-search": () => new Response("Internal error", { status: 500 }),
    "/agentmemory/remember": () => new Response("Bad Request", { status: 400 }),
  })

  const c = new AgentMemoryConnector({ url: BASE })

  const searchRes = await c.search("test")
  assertDeepEqual(searchRes, [], "500 error: search returns []")

  const remRes = await c.remember("test")
  assertEqual(remRes, null, "400 error: remember returns null")

  svr.stop(true)
}

// ── Runner ────────────────────────────────────────────────────────

async function runAll() {
  console.log("\n=== AgentMemory Connector Tests ===\n")

  testConstruction()
  await testDegradation()
  await testHealth()
  await testHealthCaching()
  await testSearch()
  await testRemember()
  await testRememberWithConcepts()
  await testObserve()
  await testContext()
  await testSessionLifecycle()
  await testListSessions()
  await testForget()
  await testGetStats()
  await testAuthHeaders()
  await testDisabledMode()
  await testServerError()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()

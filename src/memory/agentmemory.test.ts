import { describe, it, expect } from "bun:test"
import { AgentMemoryConnector } from "./agentmemory"

describe("Agentmemory Tests", () => {
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
        try {
          body = await req.json()
        } catch {}
        return handler(body, req)
      },
    })
  }

  // ── Construction ──────────────────────────────────────────────────

  it("should construction", async () => {
    const c1 = new AgentMemoryConnector()
    expect((c1 as any).baseUrl).toBe("http://localhost:3111")

    const c2 = new AgentMemoryConnector({ url: "http://custom:9999", secret: "s3kr1t" })
    expect((c2 as any).baseUrl).toBe("http://custom:9999")
    expect((c2 as any).secret).toBe("s3kr1t")

    const c3 = new AgentMemoryConnector({ enabled: false })
    expect((c3 as any).enabled).toBe(false)
  })

  // ── Graceful degradation (server down) ────────────────────────────

  it("should degradation", async () => {
    const c = new AgentMemoryConnector({ url: "http://localhost:31199" })
    expect(await c.isAvailable()).toBe(false)
    expect(JSON.stringify(await c.search("test"))).toBe(JSON.stringify([]))
    expect(await c.remember("x")).toBe(null)
    expect(await c.getContext("sid")).toBe(null)
    expect(await c.startSession()).toBe(null)
    expect(JSON.stringify(await c.listSessions())).toBe(JSON.stringify([]))
    expect(JSON.stringify(await c.getStats())).toBe(JSON.stringify({}))
  })

  // ── Health & availability ─────────────────────────────────────────

  it("should health", async () => {
    const svr = mockServer({
      "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok", service: "iii-engine" })),
      "/agentmemory/health": () =>
        new Response(JSON.stringify({ status: "ok", service: "iii-engine", viewerPort: 8080 })),
    })

    const c = new AgentMemoryConnector({ url: BASE })
    const available = await c.isAvailable()
    expect(available).toBe(true)
    const health = await c.getHealth()
    expect(health?.status).toBe("ok")
    expect(health?.viewerPort).toBe(8080)

    svr.stop(true)
  })

  it("should health caching", async () => {
    let callCount = 0
    const svr = mockServer({
      "/agentmemory/livez": () => {
        callCount++
        return new Response(JSON.stringify({ status: "ok" }))
      },
    })

    const c = new AgentMemoryConnector({ url: BASE })
    await c.isAvailable()
    await c.isAvailable()
    await c.isAvailable()
    expect(callCount).toBe(1)

    svr.stop(true)
  })

  // ── CRUD operations ───────────────────────────────────────────────

  it("should search", async () => {
    const svr = mockServer({
      "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
      "/agentmemory/smart-search": () =>
        new Response(
          JSON.stringify({
            results: [
              { content: "Found result about DB performance", score: 0.95, timestamp: "2026-01-01T00:00:00Z" },
              { content: "Another related memory", score: 0.82 },
            ],
          }),
        ),
    })

    const c = new AgentMemoryConnector({ url: BASE })
    const results = await c.search("database performance")
    expect(results.length).toBe(2)
    expect(results[0]?.score).toBe(0.95)
    expect(results[1]?.content).toBe("Another related memory")

    svr.stop(true)
  })

  it("should remember", async () => {
    const svr = mockServer({
      "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
      "/agentmemory/remember": (body) => {
        expect((body as any).content === "test insight").toBe(true)
        expect(body.type === "insight").toBe(true)
        return new Response(JSON.stringify({ id: "mem-123" }))
      },
    })

    const c = new AgentMemoryConnector({ url: BASE })
    const id = await c.remember("test insight")
    expect(id).toBe("mem-123")

    svr.stop(true)
  })

  it("should remember with concepts", async () => {
    const svr = mockServer({
      "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
      "/agentmemory/remember": (body) => {
        expect(JSON.stringify((body as any).concepts)).toBe(JSON.stringify(["ai", "testing"]))
        return new Response(JSON.stringify({ id: "mem-456" }))
      },
    })

    const c = new AgentMemoryConnector({ url: BASE })
    const id = await c.remember("test with concepts", "insight", ["ai", "testing"])
    expect(id).toBe("mem-456")

    svr.stop(true)
  })

  it("should observe", async () => {
    let received: any = null
    const svr = mockServer({
      "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
      "/agentmemory/observe": (body) => {
        received = body
        return new Response(JSON.stringify({ ok: true }))
      },
    })

    const c = new AgentMemoryConnector({ url: BASE })
    await c.observe("session-1", "tool called: read_file")
    expect(received?.sessionId).toBe("session-1")
    expect(received?.content).toBe("tool called: read_file")

    svr.stop(true)
  })

  it("should context", async () => {
    const svr = mockServer({
      "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
      "/agentmemory/context": (body) => {
        expect((body as any).sessionId).toBe("sid-1")
        return new Response(JSON.stringify({ context: "Captured context from agent run" }))
      },
    })

    const c = new AgentMemoryConnector({ url: BASE })
    const ctx = await c.getContext("sid-1")
    expect(ctx).toBe("Captured context from agent run")

    svr.stop(true)
  })

  it("should session lifecycle", async () => {
    const svr = mockServer({
      "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
      "/agentmemory/session/start": () => new Response(JSON.stringify({ sessionId: "session-new" })),
      "/agentmemory/session/end": () => new Response(JSON.stringify({ ok: true })),
    })

    const c = new AgentMemoryConnector({ url: BASE })
    const sid = await c.startSession()
    expect(sid).toBe("session-new")

    await c.endSession("session-new")
    // No throw = pass
    expect(true).toBe(true)

    svr.stop(true)
  })

  it("should list sessions", async () => {
    const svr = mockServer({
      "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
      "/agentmemory/sessions": () =>
        new Response(
          JSON.stringify({
            sessions: [
              { id: "s1", summary: "First session", created: "2026-01-01T00:00:00Z", observationCount: 5 },
              { id: "s2", summary: "Second session", created: "2026-01-02T00:00:00Z", observationCount: 3 },
            ],
          }),
        ),
    })

    const c = new AgentMemoryConnector({ url: BASE })
    const sessions = await c.listSessions()
    expect(sessions.length).toBe(2)
    expect(sessions[0]?.id).toBe("s1")
    expect(sessions[1]?.observationCount).toBe(3)

    svr.stop(true)
  })

  it("should forget", async () => {
    const svr = mockServer({
      "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
      "/agentmemory/forget": (_body) => {
        expect(JSON.stringify(_body.observationIds)).toBe(JSON.stringify(["obs-1", "obs-2"]))
        return new Response(JSON.stringify({ ok: true }))
      },
    })

    const c = new AgentMemoryConnector({ url: BASE })
    await c.forget(["obs-1", "obs-2"])
    expect(true).toBe(true)

    svr.stop(true)
  })

  it("should get stats", async () => {
    const svr = mockServer({
      "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
      "/agentmemory/health": () => new Response(JSON.stringify({ status: "ok", service: "iii-engine" })),
      "/agentmemory/sessions": () =>
        new Response(
          JSON.stringify({
            sessions: [{ id: "s1", created: "2026-01-01T00:00:00Z" }],
          }),
        ),
    })

    const c = new AgentMemoryConnector({ url: BASE })
    const stats = await c.getStats()
    expect(stats.totalSessions).toBe(1)

    svr.stop(true)
  })

  // ── Auth headers ──────────────────────────────────────────────────

  it("should auth headers", async () => {
    let authHeader: string | null = null
    const svr = mockServer({
      "/agentmemory/livez": (_body, req) => {
        authHeader = req ? req.headers.get("authorization") : null
        return new Response(JSON.stringify({ status: "ok" }))
      },
    })

    const c = new AgentMemoryConnector({ url: BASE, secret: "my-token" })
    await c.isAvailable()
    expect(authHeader as string | null).toBe("Bearer my-token")

    svr.stop(true)
  })

  // ── Disabled mode ─────────────────────────────────────────────────

  it("should disabled mode", async () => {
    let hitServer = false
    const svr = mockServer({
      "/agentmemory/livez": () => {
        hitServer = true
        return new Response(JSON.stringify({ status: "ok" }))
      },
    })

    const c = new AgentMemoryConnector({ url: BASE, enabled: false })
    expect(await c.isAvailable()).toBe(false)
    expect(JSON.stringify(await c.search("test"))).toBe(JSON.stringify([]))
    expect(await c.remember("x")).toBe(null)
    expect(!hitServer).toBe(true)

    svr.stop(true)
  })

  it("should server error", async () => {
    const svr = mockServer({
      "/agentmemory/livez": () => new Response(JSON.stringify({ status: "ok" })),
      "/agentmemory/smart-search": () => new Response("Internal error", { status: 500 }),
      "/agentmemory/remember": () => new Response("Bad Request", { status: 400 }),
    })

    const c = new AgentMemoryConnector({ url: BASE })

    const searchRes = await c.search("test")
    expect(JSON.stringify(searchRes)).toBe(JSON.stringify([]))

    const remRes = await c.remember("test")
    expect(remRes).toBe(null)

    svr.stop(true)
  })

  // ── Runner ────────────────────────────────────────────────────────
})

import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test"
import { RBACManager } from "../auth/rbac"
import { handleRequest } from "./routes"
import { startApiServer } from "./server"
import {
  authorize,
  resolveRequiredPermission,
  resolveRoutePermission,
  setRbacState,
} from "./security"
import type { ApiRequest, ApiServerConfig } from "./types"

const baseConfig: ApiServerConfig = { port: 0, host: "127.0.0.1" }

let manager: RBACManager

function req(pathname: string, method = "GET", headers: Record<string, string> = {}): ApiRequest {
  return { method, pathname, headers }
}

async function findFreePort(): Promise<number> {
  const srv = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() })
  const port: number = srv.port ?? 0
  srv.stop()
  return port
}

beforeAll(() => {
  manager = new RBACManager({ dbPath: ":memory:" })
})

afterAll(() => {
  manager.close()
})

afterEach(() => {
  setRbacState(false, false)
})

describe("route permission resolution", () => {
  it("maps real routes to existing permissions", () => {
    expect(resolveRoutePermission("/api/v1/agents", "GET")).toBe("agent:view")
    expect(resolveRoutePermission("/api/v1/agents", "POST")).toBe("agent:spawn")
    expect(resolveRoutePermission("/api/v1/chat", "POST")).toBe("agent:spawn")
    expect(resolveRoutePermission("/api/v1/chat/providers", "GET")).toBe("config:read")
    expect(resolveRoutePermission("/api/v1/events", "GET")).toBe("agent:view")
    expect(resolveRoutePermission("/api/v1/ws", "GET")).toBe("agent:view")
    expect(resolveRoutePermission("/api/v1/memory", "GET")).toBe("memory:read")
    expect(resolveRoutePermission("/api/v1/memory", "POST")).toBe("memory:write")
    expect(resolveRoutePermission("/api/v1/skills", "GET")).toBe("config:read")
    expect(resolveRoutePermission("/api/v1/skills", "POST")).toBe("config:write")
  })

  it("returns null for unmapped routes and admin:all as the required fallback", () => {
    expect(resolveRoutePermission("/api/v1/not-a-real-route", "GET")).toBeNull()
    expect(resolveRequiredPermission("/api/v1/not-a-real-route", "GET")).toBe("admin:all")
  })
})

describe("RBAC authorization", () => {
  it("rejects an unmapped /api/v1 route without a credential", () => {
    setRbacState(true, false)
    const res = authorize(req("/api/v1/not-a-real-route"), baseConfig, "10.0.0.1", manager)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(401)
  })

  it("rejects the agent-spawning chat route without a credential", () => {
    setRbacState(true, false)
    const res = authorize(req("/api/v1/chat", "POST"), baseConfig, "10.0.0.2", manager)
    expect(res?.status).toBe(401)
    const providers = authorize(req("/api/v1/chat/providers"), baseConfig, "10.0.0.2", manager)
    expect(providers?.status).toBe(401)
  })

  it("rejects a mapped route without a credential", () => {
    setRbacState(true, false)
    const res = authorize(req("/api/v1/agents"), baseConfig, "10.0.0.3", manager)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(401)
  })

  it("rejects a mapped route with an invalid credential", () => {
    setRbacState(true, false)
    const res = authorize(req("/api/v1/agents", "GET", { authorization: "Bearer not-a-real-key" }), baseConfig, "10.0.0.4", manager)
    expect(res?.status).toBe(401)
  })

  it("keeps /health reachable without credentials", async () => {
    setRbacState(true, false)
    const res = await handleRequest(req("/health"), baseConfig)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status?: string }
    expect(body.status).toBe("ok")
  })

  it("keeps /health reachable without credentials when auth is required for everything else", async () => {
    setRbacState(true, false)
    const res = await handleRequest(req("/health"), baseConfig)
    expect(res.status).toBe(200)
  })

  it("allows a valid admin key on an unmapped route", () => {
    setRbacState(true, false)
    const user = manager.createUser(`admin-${Date.now()}`, ["admin"])
    const { apiKey } = manager.generateApiKey(user.id, "admin-key")
    const res = authorize(req("/api/v1/not-a-real-route", "GET", { authorization: `Bearer ${apiKey}` }), baseConfig, "10.0.0.5", manager)
    expect(res).toBeNull()
  })

  it("denies a viewer key on an unmapped route", () => {
    setRbacState(true, false)
    const user = manager.createUser(`viewer-${Date.now()}`, ["viewer"])
    const { apiKey } = manager.generateApiKey(user.id, "viewer-key")
    const res = authorize(req("/api/v1/not-a-real-route", "GET", { authorization: `Bearer ${apiKey}` }), baseConfig, "10.0.0.6", manager)
    expect(res?.status).toBe(403)
  })

  it("denies a viewer key on the agent spawn route", () => {
    setRbacState(true, false)
    const user = manager.createUser(`viewer2-${Date.now()}`, ["viewer"])
    const { apiKey } = manager.generateApiKey(user.id, "viewer-key-2")
    const res = authorize(req("/api/v1/agents", "POST", { authorization: `Bearer ${apiKey}` }), baseConfig, "10.0.0.7", manager)
    expect(res?.status).toBe(403)
  })
})

describe("api key role revocation", () => {
  it("resolves the current roles of the user instead of the creation-time snapshot", () => {
    const user = manager.createUser(`revocable-${Date.now()}`, ["admin"])
    const { apiKey } = manager.generateApiKey(user.id, "revocable-key")

    const before = manager.validateApiKey(apiKey)
    expect(before.valid).toBe(true)
    expect(before.permissions).toContain("admin:all")

    expect(manager.removeUserRole(user.id, "admin")).toBe(true)

    const after = manager.validateApiKey(apiKey)
    expect(after.valid).toBe(true)
    expect(after.permissions).not.toContain("admin:all")
  })

  it("enforces a revoked role at the authorization layer", () => {
    setRbacState(true, false)
    const user = manager.createUser(`revocable2-${Date.now()}`, ["admin"])
    const { apiKey } = manager.generateApiKey(user.id, "revocable-key-2")
    const headers = { authorization: `Bearer ${apiKey}` }

    expect(authorize(req("/api/v1/agents", "GET", headers), baseConfig, "10.0.0.8", manager)).toBeNull()

    manager.removeUserRole(user.id, "admin")

    const res = authorize(req("/api/v1/agents", "GET", headers), baseConfig, "10.0.0.8", manager)
    expect(res?.status).toBe(403)
  })

  it("ignores roles baked into the key when the user has different roles", () => {
    const user = manager.createUser(`mismatch-${Date.now()}`, ["viewer"])
    const { apiKey } = manager.generateApiKey(user.id, "mismatch-key", ["admin"])
    const result = manager.validateApiKey(apiKey)
    expect(result.valid).toBe(true)
    expect(result.permissions).not.toContain("admin:all")
  })
})

describe("static api key authentication", () => {
  it("fails closed when no api key is configured", () => {
    const res = authorize(req("/api/v1/agents"), { port: 0, host: "127.0.0.1" }, "10.0.0.9", manager)
    expect(res).not.toBeNull()
    expect(res?.status).toBe(401)
  })

  it("allows access when the server was explicitly started unauthenticated", () => {
    const config: ApiServerConfig = { port: 0, host: "127.0.0.1", allowUnauthenticated: true }
    const res = authorize(req("/api/v1/agents"), config, "10.0.0.10", manager)
    expect(res).toBeNull()
  })

  it("accepts the configured key in bearer and raw form", () => {
    const config: ApiServerConfig = { port: 0, host: "127.0.0.1", apiKey: "s3cret" }
    expect(authorize(req("/api/v1/agents", "GET", { authorization: "Bearer s3cret" }), config, "10.0.0.11", manager)).toBeNull()
    expect(authorize(req("/api/v1/agents", "GET", { authorization: "s3cret" }), config, "10.0.0.11", manager)).toBeNull()
    expect(authorize(req("/api/v1/agents", "GET", { "x-api-key": "s3cret" }), config, "10.0.0.11", manager)).toBeNull()
  })

  it("rejects a wrong key", () => {
    const config: ApiServerConfig = { port: 0, host: "127.0.0.1", apiKey: "s3cret" }
    const res = authorize(req("/api/v1/agents", "GET", { authorization: "Bearer wrong" }), config, "10.0.0.12", manager)
    expect(res?.status).toBe(401)
  })
})

describe("server level authorization", () => {
  it("requires authorization for the SSE event stream", async () => {
    const port = await findFreePort()
    const server = startApiServer({ port, host: "127.0.0.1", apiKey: "stream-key" })
    try {
      const denied = await fetch(`http://127.0.0.1:${port}/api/v1/events`)
      expect(denied.status).toBe(401)

      const allowed = await fetch(`http://127.0.0.1:${port}/api/v1/events`, {
        headers: { authorization: "Bearer stream-key" },
      })
      expect(allowed.status).toBe(200)
      expect(allowed.headers.get("content-type")).toBe("text/event-stream")
      await allowed.body?.cancel()
    } finally {
      server.stop()
    }
  }, 15_000)

  it("requires authorization for the websocket upgrade", async () => {
    const port = await findFreePort()
    const server = startApiServer({ port, host: "127.0.0.1", apiKey: "ws-key" })
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/ws`, {
        headers: {
          upgrade: "websocket",
          connection: "Upgrade",
          "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
          "sec-websocket-version": "13",
        },
      })
      expect(res.status).toBe(401)
    } finally {
      server.stop()
    }
  }, 15_000)

  it("rejects api traffic when no key is configured", async () => {
    const port = await findFreePort()
    const server = startApiServer({ port, host: "127.0.0.1" })
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/agents`)
      expect(res.status).toBe(401)
    } finally {
      server.stop()
    }
  }, 15_000)
})

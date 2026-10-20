import { describe, it, expect, afterEach } from "bun:test"
import { existsSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

import { handleAgentRoutes } from "./routes/agents"
import { handleMemoryRoutes } from "./routes/memory"
import { handleSessionRoutes } from "./routes/sessions"
import { handleCostRoutes } from "./routes/cost"
import { SpawnAgentSchema } from "./routes/schemas"
import { isValidProjectName, getProjectDataDir } from "../project/context"
import { authorize, resolveRequiredPermission, resolveRoutePermission, setRbacState } from "./security"
import { RBACManager } from "../auth/rbac"
import type { ApiRequest, ApiServerConfig } from "./types"

const config: ApiServerConfig = {
  port: 0,
  host: "127.0.0.1",
  apiKey: "test-key",
  sessionDb: true,
}

function makeReq(overrides: Partial<ApiRequest> & { pathname: string }): ApiRequest {
  return {
    method: "GET",
    headers: {},
    body: undefined,
    searchParams: new URLSearchParams(),
    ...overrides,
  }
}

describe("POST /api/v1/agents — script path hardening", () => {
  it("rejects a traversal script path at the schema layer", () => {
    const bad = SpawnAgentSchema.safeParse({ name: "evil", script: "../../evil.ts" })
    expect(bad.success).toBe(false)

    const absolute = SpawnAgentSchema.safeParse({ name: "evil", script: "/etc/passwd" })
    expect(absolute.success).toBe(false)
  })

  it("accepts a plain relative script path", () => {
    const ok = SpawnAgentSchema.safeParse({ name: "ok", script: "src/agent/agent-worker.ts" })
    expect(ok.success).toBe(true)
  })

  it("never spawns a user-supplied script — the route always uses the known worker path", async () => {
    const { agentManager } = await import("../agent/manager")
    const originalSpawn = agentManager.spawn.bind(agentManager)
    const seen: Array<{ script?: string }> = []

    ;(agentManager as unknown as { spawn: typeof agentManager.spawn }).spawn = (async (def: { script?: string }) => {
      seen.push({ script: def.script })
      return "agent-test-1"
    }) as typeof agentManager.spawn

    try {
      const res = await handleAgentRoutes(
        makeReq({ pathname: "/api/v1/agents", method: "POST", body: { name: "worker-1" } }),
        config,
      )
      expect(res).not.toBeNull()
      expect(res?.status).toBe(201)
      expect(seen.length).toBe(1)
      expect(seen[0]?.script).toBe("src/agent/agent-worker.ts")
    } finally {
      ;(agentManager as unknown as { spawn: typeof agentManager.spawn }).spawn = originalSpawn
    }
  })

  it("ignores a user-supplied script value and still spawns the known worker", async () => {
    const { agentManager } = await import("../agent/manager")
    const originalSpawn = agentManager.spawn.bind(agentManager)
    const seen: Array<{ script?: string }> = []

    ;(agentManager as unknown as { spawn: typeof agentManager.spawn }).spawn = (async (def: { script?: string }) => {
      seen.push({ script: def.script })
      return "agent-test-2"
    }) as typeof agentManager.spawn

    try {
      const res = await handleAgentRoutes(
        makeReq({
          pathname: "/api/v1/agents",
          method: "POST",
          body: { name: "worker-2", script: "src/agent/agent-worker.ts" },
        }),
        config,
      )
      expect(res?.status).toBe(201)
      expect(seen[0]?.script).toBe("src/agent/agent-worker.ts")
    } finally {
      ;(agentManager as unknown as { spawn: typeof agentManager.spawn }).spawn = originalSpawn
    }
  })

  it("returns 400 for a traversal script path", async () => {
    const res = await handleAgentRoutes(
      makeReq({ pathname: "/api/v1/agents", method: "POST", body: { name: "worker-3", script: "../../evil.ts" } }),
      config,
    )
    expect(res?.status).toBe(400)
  })

  it("returns 400 for a different script path instead of silently ignoring it", async () => {
    const res = await handleAgentRoutes(
      makeReq({ pathname: "/api/v1/agents", method: "POST", body: { name: "worker-4", script: "src/agent/other.ts" } }),
      config,
    )
    expect(res?.status).toBe(400)
    const body = (await res?.json()) as { error?: string }
    expect(body.error).toContain("default agent worker script")
  })
})

describe("project query parameter validation", () => {
  it("rejects invalid project names", () => {
    expect(isValidProjectName("my-project")).toBe(true)
    expect(isValidProjectName("My_Project2")).toBe(true)
    expect(isValidProjectName("my.project")).toBe(true)
    expect(isValidProjectName("_private")).toBe(true)
    expect(isValidProjectName("../../../../tmp/evil")).toBe(false)
    expect(isValidProjectName("..")).toBe(false)
    expect(isValidProjectName("a..b")).toBe(false)
    expect(isValidProjectName("a/b")).toBe(false)
    expect(isValidProjectName("a\\b")).toBe(false)
    expect(isValidProjectName(".hidden")).toBe(false)
    expect(isValidProjectName("")).toBe(false)
    expect(isValidProjectName("x".repeat(65))).toBe(false)
  })

  it("refuses to build a data dir outside the projects tree", () => {
    expect(() => getProjectDataDir("../../../../tmp/evil")).toThrow()
    expect(() => getProjectDataDir("/etc")).toThrow()
    const safe = getProjectDataDir("my-project")
    expect(safe.startsWith(resolve(homedir(), ".aegis", "projects"))).toBe(true)
  })

  it("rejects an invalid project on the memory route with 400 and creates no directory", async () => {
    const outsideDir = join(homedir(), "..", "..", "..", "tmp", `aegis-traversal-${Date.now()}`)
    const res = await handleMemoryRoutes(
      makeReq({
        pathname: "/api/v1/memory",
        searchParams: new URLSearchParams({ project: "../../../../tmp/evil" }),
      }),
      config,
    )
    expect(res?.status).toBe(400)
    expect(existsSync(outsideDir)).toBe(false)
  })

  it("rejects an invalid project on the sessions route with 400", async () => {
    const res = await handleSessionRoutes(
      makeReq({
        pathname: "/api/v1/sessions",
        searchParams: new URLSearchParams({ project: "../../evil" }),
      }),
      config,
    )
    expect(res?.status).toBe(400)
  })

  it("rejects an invalid project on the sessions stats route with 400", async () => {
    const res = await handleSessionRoutes(
      makeReq({
        pathname: "/api/v1/sessions/stats",
        searchParams: new URLSearchParams({ project: "..%2F..%2Fevil" }),
      }),
      config,
    )
    expect(res?.status).toBe(400)
  })
})

describe("GET /api/v1/cost", () => {
  it("returns a cost summary with spend and budget", async () => {
    const res = await handleCostRoutes(makeReq({ pathname: "/api/v1/cost" }), config)
    expect(res?.status).toBe(200)
    const body = (await res?.json()) as Record<string, unknown>
    expect(typeof body.total_spend_usd).toBe("number")
    expect(typeof body.budget_usd).toBe("number")
    expect(typeof body.remaining_usd).toBe("number")
    expect(typeof body.exceeded_budget).toBe("boolean")
    expect(Array.isArray(body.by_model)).toBe(true)
  })

  it("returns null for unrelated paths", async () => {
    expect(await handleCostRoutes(makeReq({ pathname: "/api/v1/nope" }), config)).toBeNull()
  })

  it("is covered by an explicit RBAC route permission", () => {
    expect(resolveRequiredPermission("/api/v1/cost", "GET")).toBe("cost:view")
    expect(resolveRoutePermission("/api/v1/cost", "GET")).toBe("cost:view")
  })

  it("denies a key without cost:view and allows one with it", () => {
    setRbacState(true, false)
    const manager = new RBACManager({ dbPath: ":memory:" })
    try {
      const viewer = manager.createUser(`cost-viewer-${Date.now()}`, ["viewer"])
      const { apiKey } = manager.generateApiKey(viewer.id, "viewer-key")
      const denied = authorize(
        makeReq({ pathname: "/api/v1/cost", headers: { authorization: `Bearer ${apiKey}` } }),
        config,
        "10.0.0.9",
        manager,
      )
      expect(denied?.status).toBe(403)

      const developer = manager.createUser(`cost-dev-${Date.now()}`, ["developer"])
      const { apiKey: devKey } = manager.generateApiKey(developer.id, "dev-key")
      const devAllowed = authorize(
        makeReq({ pathname: "/api/v1/cost", headers: { authorization: `Bearer ${devKey}` } }),
        config,
        "10.0.0.9",
        manager,
      )
      expect(devAllowed).toBeNull()

      const admin = manager.createUser(`cost-admin-${Date.now()}`, ["admin"])
      const { apiKey: adminKey } = manager.generateApiKey(admin.id, "admin-key")
      const allowed = authorize(
        makeReq({ pathname: "/api/v1/cost", headers: { authorization: `Bearer ${adminKey}` } }),
        config,
        "10.0.0.9",
        manager,
      )
      expect(allowed).toBeNull()
    } finally {
      manager.close()
      setRbacState(false, false)
    }
  })

  it("requires a credential when RBAC is enabled", () => {
    setRbacState(true, false)
    const manager = new RBACManager({ dbPath: ":memory:" })
    try {
      const res = authorize(makeReq({ pathname: "/api/v1/cost" }), config, "10.0.0.10", manager)
      expect(res?.status).toBe(401)
    } finally {
      manager.close()
      setRbacState(false, false)
    }
  })
})

afterEach(() => {
  rmSync(join(homedir(), ".aegis", "projects", "..", "aegis-traversal-test"), { recursive: true, force: true })
})

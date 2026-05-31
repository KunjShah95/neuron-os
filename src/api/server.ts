import { agentManager } from "../agent/manager"
import { memorySystem } from "../memory"

export interface ApiServerConfig {
  port: number
  host: string
  apiKey?: string
}

interface ApiRequest {
  method: string
  pathname: string
  headers: Record<string, string>
  body?: unknown
}

interface ApiResponse {
  status: number
  body: unknown
}

function sendJson(res: Response, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
}

function auth(req: ApiRequest, config: ApiServerConfig): boolean {
  if (!config.apiKey) return true
  const authHeader = req.headers["authorization"] || req.headers["x-api-key"] || ""
  return authHeader === `Bearer ${config.apiKey}` || authHeader === config.apiKey
}

async function handleRequest(req: ApiRequest, config: ApiServerConfig): Promise<Response> {
  if (!auth(req, config)) {
    return sendJson(new Response(), 401, { error: "Unauthorized" })
  }

  const { method, pathname, body } = req

  // ── Agents ──────────────────────────────────────────────────────────

  if (pathname === "/api/v1/agents" && method === "GET") {
    const agents = agentManager.list().map((a) => ({
      id: a.id,
      name: a.def.name,
      type: a.def.agentType,
      status: a.status,
      pid: a.pid,
      uptime: a.spawnTime ? Math.floor((Date.now() - a.spawnTime) / 1000) : 0,
    }))
    return sendJson(new Response(), 200, { agents })
  }

  if (pathname === "/api/v1/agents" && method === "POST") {
    const payload = body as { name: string; type?: string; script?: string } | undefined
    if (!payload?.name) {
      return sendJson(new Response(), 400, { error: "name is required" })
    }
    try {
      const id = await agentManager.spawn({
        name: payload.name,
        agentType: payload.type as any,
        script: payload.script ?? "src/agent/agent-worker.ts",
      })
      return sendJson(new Response(), 201, { id, name: payload.name, status: "spawning" })
    } catch (err: any) {
      return sendJson(new Response(), 500, { error: err.message })
    }
  }

  const agentMatch = pathname.match(/^\/api\/v1\/agents\/([^/]+)$/)
  if (agentMatch) {
    const agentId = agentMatch[1]!
    const instance = agentManager.get(agentId)
    if (!instance) return sendJson(new Response(), 404, { error: "Agent not found" })

    if (method === "GET") {
      return sendJson(new Response(), 200, {
        id: instance.id,
        name: instance.def.name,
        type: instance.def.agentType,
        status: instance.status,
        pid: instance.pid,
        logCount: instance.log.length,
      })
    }

    if (method === "DELETE") {
      await agentManager.kill(agentId)
      return sendJson(new Response(), 200, { status: "stopped" })
    }
  }

  // ── Tasks ───────────────────────────────────────────────────────────

  const taskMatch = pathname.match(/^\/api\/v1\/agents\/([^/]+)\/tasks$/)
  if (taskMatch && method === "POST") {
    const agentId = taskMatch[1]!
    const payload = body as { goal?: string } | undefined
    if (!payload?.goal) return sendJson(new Response(), 400, { error: "goal is required" })

    const instance = agentManager.get(agentId)
    if (!instance) return sendJson(new Response(), 404, { error: "Agent not found" })

    const taskId = `api-${Date.now()}`
    agentManager.sendIpc(agentId, {
      type: "run-task",
      id: taskId,
      payload: { goal: payload.goal },
      timestamp: Date.now(),
    })

    return sendJson(new Response(), 202, { taskId, status: "accepted" })
  }

  // ── Memory ──────────────────────────────────────────────────────────

  if (pathname === "/api/v1/memory" && method === "GET") {
    const memory = await memorySystem.loadMemory()
    return sendJson(new Response(), 200, { memory })
  }

  if (pathname === "/api/v1/memory" && method === "POST") {
    const payload = body as { content?: string } | undefined
    if (!payload?.content) return sendJson(new Response(), 400, { error: "content is required" })
    await memorySystem.appendToMemory(payload.content)
    return sendJson(new Response(), 201, { status: "saved" })
  }

  if (pathname === "/api/v1/memory/search" && method === "POST") {
    const payload = body as { query?: string } | undefined
    if (!payload?.query) return sendJson(new Response(), 400, { error: "query is required" })
    const results = await memorySystem.search(payload.query)
    return sendJson(new Response(), 200, { results })
  }

  // ── Health ──────────────────────────────────────────────────────────

  if (pathname === "/api/v1/health" && method === "GET") {
    return sendJson(new Response(), 200, {
      status: "ok",
      agents: agentManager.agents.size,
      uptime: process.uptime(),
    })
  }

  if (pathname === "/api/v1/types" && method === "GET") {
    const { getAllAgentTypes } = await import("../agent/agent-types")
    return sendJson(new Response(), 200, { types: getAllAgentTypes() })
  }

  return sendJson(new Response(), 404, { error: "Not found" })
}

export function startApiServer(config: ApiServerConfig): { stop: () => void } {
  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      const req: ApiRequest = {
        method: request.method,
        pathname: url.pathname,
        headers: Object.fromEntries(request.headers.entries()),
        body: request.method === "POST" || request.method === "PUT" ? await request.json().catch(() => ({})) : undefined,
      }
      return handleRequest(req, config)
    },
  })

  console.log(`🌐 API server listening on http://${config.host}:${config.port}`)

  return {
    stop: () => {
      server.stop()
      console.log("🌐 API server stopped")
    },
  }
}

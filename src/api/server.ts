import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { agentManager } from "../agent/manager"
import { createLogger } from "../cli/logger"
import type { AgentTypeName } from "../agent/agent-types"
import { z } from "zod"

const log = createLogger("api")

// ── Zod Schemas for request validation ─────────────────────────────────

const SpawnAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(64, "Name too long").regex(/^[a-zA-Z0-9_-]+$/, "Name must be alphanumeric with -_"),
  type: z.string().max(32, "Type too long").optional(),
  script: z.string().max(256, "Script path too long").optional(),
})

const TaskGoalSchema = z.object({
  goal: z.string().min(1, "Goal is required").max(4000, "Goal too long"),
})

const MemoryContentSchema = z.object({
  content: z.string().min(1, "Content is required").max(50000, "Content too long"),
})

const MemoryQuerySchema = z.object({
  query: z.string().min(1, "Query is required").max(1000, "Query too long"),
})

/** Read package version once at module load time. */
let _version: string
try {
  const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, "..", "..", "package.json"), "utf-8"))
  _version = String(pkg.version || "0.0.0")
} catch {
  _version = "0.0.0"
}

// ── Types ─────────────────────────────────────────────────────────────

export interface ApiServerConfig {
  port: number
  host: string
  apiKey?: string
  /**
   * Comma-separated list of allowed CORS origins.
   * Defaults to ["http://localhost:5173"] for Vite dev server.
   */
  corsOrigins?: string
  /** Rate limit: max requests per window per IP. Default: 100 */
  rateLimitMax?: number
  /** Rate limit: window in ms. Default: 60000 (1 minute) */
  rateLimitWindowMs?: number
  /** Webhook configuration. When provided, wraps fetch with webhook routes at /api/v1/webhook/* */
  webhookConfig?: import("./webhook-handler").WebhookConfig
  /** Enable session store endpoints at /api/v1/sessions/* (requires SQLite session-persistence) */
  sessionDb?: boolean
}

interface ApiRequest {
  method: string
  pathname: string
  headers: Record<string, string>
  body?: unknown
  searchParams?: URLSearchParams
}

// ── Rate Limiter ──────────────────────────────────────────────────────

class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>()

  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  check(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    let entry = this.hits.get(ip)

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + this.windowMs }
      this.hits.set(ip, entry)
    }

    entry.count++
    const remaining = Math.max(0, this.maxRequests - entry.count)

    // Periodically clean stale entries
    if (this.hits.size > 1000) {
      for (const [key, val] of this.hits) {
        if (now > val.resetAt) this.hits.delete(key)
      }
    }

    return {
      allowed: entry.count <= this.maxRequests,
      remaining,
      resetAt: entry.resetAt,
    }
  }
}

// ── Security Headers ──────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
}

// ── CORS ──────────────────────────────────────────────────────────────

function getAllowedOrigins(config: ApiServerConfig): string[] {
  if (config.corsOrigins) {
    return config.corsOrigins.split(",").map((o) => o.trim()).filter(Boolean)
  }
  return ["http://localhost:5173"]
}

function buildCorsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  if (origin && allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    }
  }
  // If no allowed origin matches and origin is present, don't set ACAO
  // Allow same-origin requests (no Origin header) to proceed
  return {}
}

// ── Input Validation (Zod schemas defined above) ──────────────────────

// ── Response Helpers ──────────────────────────────────────────────────

function auth(req: ApiRequest, config: ApiServerConfig): boolean {
  if (!config.apiKey) return true
  const authHeader = req.headers["authorization"] || req.headers["x-api-key"] || ""
  return authHeader === `Bearer ${config.apiKey}` || authHeader === config.apiKey
}

// ── Request Handler ───────────────────────────────────────────────────

async function handleRequest(req: ApiRequest, config: ApiServerConfig): Promise<Response> {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown"

  // Log request
  log.debug("API request", { method: req.method, path: req.pathname, ip })

  // Authentication
  if (!auth(req, config)) {
    log.warn("Unauthorized API request", { ip, path: req.pathname })
    return jsonResponse(401, { error: "Unauthorized" }, config, req)
  }

  const { method, pathname, body } = req

  // ── CORS preflight ────────────────────────────────────────────────

  if (method === "OPTIONS") {
    const origin = req.headers["origin"] || null
    const allowedOrigins = getAllowedOrigins(config)
    const corsHeaders = buildCorsHeaders(origin, allowedOrigins)
    return new Response(null, {
      status: 204,
      headers: {
        "Content-Length": "0",
        ...corsHeaders,
        ...SECURITY_HEADERS,
      },
    })
  }

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
    return jsonResponse(200, { agents }, config, req)
  }

  if (pathname === "/api/v1/agents" && method === "POST") {
    const spawnResult = SpawnAgentSchema.safeParse(body)
    if (!spawnResult.success) {
      return jsonResponse(400, { error: spawnResult.error.issues.map(i => i.message).join("; ") }, config, req)
    }

    const payload = spawnResult.data
    try {
      const id = await agentManager.spawn({
        name: payload.name,
        agentType: payload.type as AgentTypeName | undefined,
        script: payload.script ?? "src/agent/agent-worker.ts",
      })
      log.info("Agent spawned via API", { agentId: id, name: payload.name })
      return jsonResponse(201, { id, name: payload.name, status: "spawning" }, config, req)
    } catch (err: any) {
      log.error("Failed to spawn agent via API", { error: err.message })
      return jsonResponse(500, { error: err.message }, config, req)
    }
  }

  const agentMatch = pathname.match(/^\/api\/v1\/agents\/([^/]+)$/)
  if (agentMatch) {
    const agentId = agentMatch[1]!
    const instance = agentManager.get(agentId)
    if (!instance) return jsonResponse(404, { error: "Agent not found" }, config, req)

    if (method === "GET") {
      return jsonResponse(200, {
        id: instance.id,
        name: instance.def.name,
        type: instance.def.agentType,
        status: instance.status,
        pid: instance.pid,
        logCount: instance.log.length,
      }, config, req)
    }

    if (method === "DELETE") {
      await agentManager.kill(agentId)
      log.info("Agent killed via API", { agentId })
      return jsonResponse(200, { status: "stopped" }, config, req)
    }
  }

  // ── Tasks ───────────────────────────────────────────────────────────

  const taskMatch = pathname.match(/^\/api\/v1\/agents\/([^/]+)\/tasks$/)
  if (taskMatch && method === "POST") {
    const agentId = taskMatch[1]!
    const goalResult = TaskGoalSchema.safeParse(body)
    if (!goalResult.success) {
      return jsonResponse(400, { error: goalResult.error.issues.map(i => i.message).join("; ") }, config, req)
    }

    const payload = goalResult.data
    const instance = agentManager.get(agentId)
    if (!instance) return jsonResponse(404, { error: "Agent not found" }, config, req)

    const taskId = `api-${Date.now()}`
    agentManager.sendIpc(agentId, {
      type: "run-task",
      id: taskId,
      payload: { goal: payload.goal },
      timestamp: Date.now(),
    })

    log.info("Task submitted via API", { agentId, taskId })
    return jsonResponse(202, { taskId, status: "accepted" }, config, req)
  }

  // ── Memory ──────────────────────────────────────────────────────────

  if (pathname === "/api/v1/memory" && method === "GET") {
    const { memorySystem, getProjectMemorySystem } = await import("../memory/system")
    const project = req.searchParams?.get("project") || undefined
    const memory = project ? getProjectMemorySystem(project).loadMemory() : memorySystem.loadMemory()
    return jsonResponse(200, { memory: await memory }, config, req)
  }

  if (pathname === "/api/v1/memory" && method === "POST") {
    const memResult = MemoryContentSchema.safeParse(body)
    if (!memResult.success) {
      return jsonResponse(400, { error: memResult.error.issues.map(i => i.message).join("; ") }, config, req)
    }
    const payload = memResult.data
    const { memorySystem, getProjectMemorySystem } = await import("../memory/system")
    const project = req.searchParams?.get("project") || undefined
    const ms = project ? getProjectMemorySystem(project) : memorySystem
    await ms.appendToMemory(payload.content)
    return jsonResponse(201, { status: "saved" }, config, req)
  }

  if (pathname === "/api/v1/memory/search" && method === "POST") {
    const queryResult = MemoryQuerySchema.safeParse(body)
    if (!queryResult.success) {
      return jsonResponse(400, { error: queryResult.error.issues.map(i => i.message).join("; ") }, config, req)
    }
    const payload = queryResult.data
    const { memorySystem, getProjectMemorySystem } = await import("../memory/system")
    const project = req.searchParams?.get("project") || undefined
    const ms = project ? getProjectMemorySystem(project) : memorySystem
    const results = await ms.search(payload.query)
    return jsonResponse(200, { results }, config, req)
  }

  // ── Health ──────────────────────────────────────────────────────────

  if (pathname === "/api/v1/health" && method === "GET") {
    return jsonResponse(200, {
      status: "ok",
      version: _version,
      uptime: process.uptime(),
      agents: {
        total: agentManager.agents.size,
        running: agentManager.list().filter((a) => a.status === "running").length,
      },
    }, config, req)
  }

  // ── Projects ─────────────────────────────────────────────────────

  if (pathname === "/api/v1/projects" && method === "GET") {
    const { listProjects } = await import("../project/context")
    const projects = listProjects()
    return jsonResponse(200, { projects }, config, req)
  }

  // ── WebSocket Health ─────────────────────────────────────────────

  if (pathname === "/api/v1/ws/health" && method === "GET") {
    return jsonResponse(200, getWsHealth(), config, req)
  }

  if (pathname === "/api/v1/types" && method === "GET") {
    const { getAllAgentTypes } = await import("../agent/agent-types")
    return jsonResponse(200, { types: getAllAgentTypes() }, config, req)
  }

  // ── Sessions (when sessionDb enabled) ─────────────────────────

  if (config.sessionDb && pathname === "/api/v1/sessions" && method === "GET") {
    const { sessionStore, getProjectSessionStore } = await import("../memory/session-persistence")
    const project = req.searchParams?.get("project") || undefined
    const store = project ? getProjectSessionStore(project) : sessionStore
    const sessions = store.restoreRecentSessions(50)
    return jsonResponse(200, { sessions }, config, req)
  }

  if (config.sessionDb && pathname === "/api/v1/sessions/stats" && method === "GET") {
    const { sessionStore, getProjectSessionStore } = await import("../memory/session-persistence")
    const project = req.searchParams?.get("project") || undefined
    const store = project ? getProjectSessionStore(project) : sessionStore
    const stats = store.getStats()
    return jsonResponse(200, stats, config, req)
  }

  const sessionMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/)
  if (config.sessionDb && sessionMatch && method === "GET") {
    const { sessionStore, getProjectSessionStore } = await import("../memory/session-persistence")
    const project = req.searchParams?.get("project") || undefined
    const store = project ? getProjectSessionStore(project) : sessionStore
    const sessionId = sessionMatch[1]!
    const session = store.getSession(sessionId)
    if (!session) return jsonResponse(404, { error: "Session not found" }, config, req)

    const messages = store.getMessages(sessionId, 100)
    return jsonResponse(200, { session, messages }, config, req)
  }

  if (config.sessionDb && sessionMatch && method === "DELETE") {
    const { sessionStore, getProjectSessionStore } = await import("../memory/session-persistence")
    const project = req.searchParams?.get("project") || undefined
    const store = project ? getProjectSessionStore(project) : sessionStore
    store.deleteSession(sessionMatch[1]!)
    return jsonResponse(200, { status: "deleted" }, config, req)
  }

  return jsonResponse(404, { error: "Not found" }, config, req)
}

// ── Response wrapper with CORS + security headers ────────────────────

function jsonResponse(status: number, body: unknown, config: ApiServerConfig, req: ApiRequest): Response {
  const origin = req.headers["origin"] || null
  const allowedOrigins = getAllowedOrigins(config)
  const corsHeaders = buildCorsHeaders(origin, allowedOrigins)

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...SECURITY_HEADERS,
    },
  })
}

// ── WebSocket Support ────────────────────────────────────────────────

interface WsClient {
  socket: import("bun").ServerWebSocket<undefined>
  id: string
  subscribed: boolean
  connectedAt: number
}

const wsClients = new Map<string, WsClient>()
let wsIdCounter = 0
let unsubWsRef: (() => void) | null = null

// ── WS Health tracking ───────────────────────────────────────────────

interface WsHealthStats {
  /** Total connections ever accepted */
  totalConnections: number
  /** Messages broadcast to clients */
  messagesBroadcast: number
  /** When the WS bridge started */
  bridgeStartedAt: number | null
  /** When the last connection was made */
  lastConnectionAt: number | null
  /** Peak concurrent clients */
  peakConcurrent: number
}

const wsHealth: WsHealthStats = {
  totalConnections: 0,
  messagesBroadcast: 0,
  bridgeStartedAt: null,
  lastConnectionAt: null,
  peakConcurrent: 0,
}

/**
 * Get current WebSocket server health information.
 * Returns connection statistics and the list of connected clients.
 */
export function getWsHealth() {
  const now = Date.now()
  return {
    status: unsubWsRef ? "running" : "stopped",
    clients: {
      connected: wsClients.size,
      subscribed: [...wsClients.values()].filter((c) => c.subscribed).length,
      peak: wsHealth.peakConcurrent,
    },
    uptime: wsHealth.bridgeStartedAt ? Math.floor((now - wsHealth.bridgeStartedAt) / 1000) : 0,
    totalConnections: wsHealth.totalConnections,
    messagesBroadcast: wsHealth.messagesBroadcast,
    lastConnectionAt: wsHealth.lastConnectionAt,
    clientsList: [...wsClients.entries()].map(([id, client]) => ({
      id,
      subscribed: client.subscribed,
      connectedFor: Math.floor((now - client.connectedAt) / 1000),
    })),
  }
}

function broadcastWsEvent(event: string, data: Record<string, unknown>) {
  const msg = JSON.stringify({ event, data, timestamp: Date.now() })
  for (const [id, client] of wsClients) {
    if (client.subscribed) {
      try {
        client.socket.send(msg)
        wsHealth.messagesBroadcast++
      } catch {
        wsClients.delete(id)
      }
    }
  }
}

/**
 * Bridge AgentManager events to WebSocket clients.
 * Call this after creating the server to start forwarding events.
 */
export function startWsEventBridge() {
  if (unsubWsRef) return // already started

  wsHealth.bridgeStartedAt = Date.now()

  const handler = (event: any) => {
    broadcastWsEvent(event.type || "agent:event", {
      agentId: event.agentId,
      data: event.data,
    })
  }

  agentManager.onEvent(handler)
  unsubWsRef = () => agentManager.offEvent(handler)
  log.info("WebSocket event bridge started")
}

/**
 * Stop forwarding AgentManager events to WebSocket clients.
 */
export function stopWsEventBridge() {
  if (unsubWsRef) {
    unsubWsRef()
    unsubWsRef = null
  }
}

// ── Server Start ──────────────────────────────────────────────────────

export function startApiServer(config: ApiServerConfig): { stop: () => void } {
  const rateLimiter = new RateLimiter(config.rateLimitMax ?? 100, config.rateLimitWindowMs ?? 60_000)
  const allowedOrigins = getAllowedOrigins(config)

  log.info("Starting API server", {
    port: config.port,
    host: config.host,
    authEnabled: !!config.apiKey,
    corsOrigins: allowedOrigins.join(", "),
    rateLimit: `${config.rateLimitMax ?? 100}/min`,
  })

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,

    // ── WebSocket handler ───────────────────────────────────────────
    websocket: {
      async open(ws: import("bun").ServerWebSocket<undefined>) {
        const id = `ws-${++wsIdCounter}`
        wsClients.set(id, { socket: ws, id, subscribed: true, connectedAt: Date.now() })

        // Track health stats
        wsHealth.totalConnections++
        wsHealth.lastConnectionAt = Date.now()
        wsHealth.peakConcurrent = Math.max(wsHealth.peakConcurrent, wsClients.size)

        log.info("WebSocket client connected", { clientId: id, totalConnections: wsHealth.totalConnections, concurrent: wsClients.size })

        // Send initial state snapshot
        const agents = agentManager.list().map((a) => ({
          id: a.id,
          name: a.def.name,
          type: a.def.agentType,
          status: a.status,
          pid: a.pid,
          uptime: a.spawnTime ? Math.floor((Date.now() - a.spawnTime) / 1000) : 0,
        }))
        ws.send(JSON.stringify({ event: "connected", data: { clientId: id, agents }, timestamp: Date.now() }))
      },

      message(ws: import("bun").ServerWebSocket<undefined>, message: string | Buffer) {
        // Handle client messages (e.g., subscribe/unsubscribe)
        try {
          const parsed = JSON.parse(message.toString())
          if (parsed.type === "ping") {
            ws.send(JSON.stringify({ event: "pong", data: {}, timestamp: Date.now() }))
          }
          if (parsed.type === "unsubscribe") {
            for (const [, client] of wsClients) {
              if (client.socket === ws) {
                client.subscribed = false
                break
              }
            }
          }
          if (parsed.type === "subscribe") {
            for (const [, client] of wsClients) {
              if (client.socket === ws) {
                client.subscribed = true
                break
              }
            }
          }          } catch (err) {
            log.warn("WS message parse failed", { error: String(err) })
          }
        },

        close(ws: import("bun").ServerWebSocket<undefined>) {
        // Remove client
        for (const [id, client] of wsClients) {
          if (client.socket === ws) {
            wsClients.delete(id)
            log.info("WebSocket client disconnected", { clientId: id })
            break
          }
        }
      },

      drain(_ws: import("bun").ServerWebSocket<undefined>) {
        // Backpressure handling — could implement message buffering here
      },
    },

    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

      // ── WebSocket upgrade ────────────────────────────────────────
      if (url.pathname === "/api/v1/ws" && request.headers.get("upgrade") === "websocket") {
        // Event bridge is started at the end of startApiServer()

        // Check authentication for WebSocket
        if (config.apiKey) {
          const authHeader = request.headers.get("authorization") || request.headers.get("x-api-key") || ""
          const authed = authHeader === `Bearer ${config.apiKey}` || authHeader === config.apiKey
          if (!authed) {
            return new Response("Unauthorized", { status: 401 })
          }
        }

        const upgraded = server.upgrade(request)
        if (upgraded) return new Response(null, { status: 101 })
        return new Response("WebSocket upgrade failed", { status: 400 })
      }

      // Rate limiting
      const rateCheck = rateLimiter.check(ip)
      if (!rateCheck.allowed) {
        log.warn("Rate limit exceeded", { ip, path: url.pathname })
        return new Response(JSON.stringify({ error: "Too many requests" }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil((rateCheck.resetAt - Date.now()) / 1000)),
            ...SECURITY_HEADERS,
          },
        })
      }

      // ── Webhook routes (when webhookConfig is set) ──────────────
      if (config.webhookConfig && url.pathname.startsWith("/api/v1/webhook/")) {
        const { createWebhookHandler } = await import("./webhook-handler")
        const handler = createWebhookHandler(config.webhookConfig)
        return handler(request)
      }

      // Server-sent events endpoint for clients without WebSocket
      if (url.pathname === "/api/v1/events" && request.method === "GET") {
        let unsubSse: (() => void) | null = null
        let closed = false

        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder()

            // Send initial state
            const agents = agentManager.list().map((a) => ({
              id: a.id,
              name: a.def.name,
              type: a.def.agentType,
              status: a.status,
              pid: a.pid,
              uptime: a.spawnTime ? Math.floor((Date.now() - a.spawnTime) / 1000) : 0,
            }))
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: "connected", data: { agents } })}\n\n`))

            // Subscribe to agent events
            const handler = (event: any) => {
              if (closed) return
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event: event.type || "agent:event", data: { agentId: event.agentId, data: event.data } })}\n\n`))
              } catch (err) {
                log.warn("SSE controller enqueue failed", { error: String(err) })
              }
            }
            agentManager.onEvent(handler)
            unsubSse = () => agentManager.offEvent(handler)
          },
          cancel() {
            closed = true
            if (unsubSse) {
              unsubSse()
              unsubSse = null
            }
          },
        })

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            ...SECURITY_HEADERS,
          },
        })
      }

      const req: ApiRequest = {
        method: request.method,
        pathname: url.pathname,
        headers: Object.fromEntries(request.headers.entries()),
        searchParams: url.searchParams,
        body:
          request.method === "POST" || request.method === "PUT"
            ? await request.json().catch(() => ({}))
            : undefined,
      }

      return handleRequest(req, config)
    },
  })

  // Start WebSocket event bridge for any reconnecting clients
  startWsEventBridge()

  log.info("API server listening", { url: `http://${config.host}:${config.port}` })

  return {
    stop: () => {
      stopWsEventBridge()
      wsClients.clear()
      server.stop()
      log.info("API server stopped")
    },
  }
}

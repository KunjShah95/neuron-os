import { agentManager } from "../agent/manager"
import { memorySystem } from "../memory"
import { createLogger } from "../cli/logger"

const log = createLogger("api")

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
}

interface ApiRequest {
  method: string
  pathname: string
  headers: Record<string, string>
  body?: unknown
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

// ── Input Validation ──────────────────────────────────────────────────

interface ValidationRule {
  field: string
  type: "string" | "number" | "boolean"
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
}

function validateBody(body: unknown, rules: ValidationRule[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  const obj = body as Record<string, unknown> | undefined

  if (!obj || typeof obj !== "object") {
    return { valid: false, errors: ["Request body must be a JSON object"] }
  }

  for (const rule of rules) {
    const value = obj[rule.field]

    if (value === undefined || value === null) {
      if (rule.required) {
        errors.push(`"${rule.field}" is required`)
      }
      continue
    }

    if (rule.type === "string") {
      if (typeof value !== "string") {
        errors.push(`"${rule.field}" must be a string`)
        continue
      }
      if (rule.minLength !== undefined && value.length < rule.minLength) {
        errors.push(`"${rule.field}" must be at least ${rule.minLength} characters`)
      }
      if (rule.maxLength !== undefined && value.length > rule.maxLength) {
        errors.push(`"${rule.field}" must be at most ${rule.maxLength} characters`)
      }
      if (rule.pattern && !rule.pattern.test(value)) {
        errors.push(`"${rule.field}" contains invalid characters`)
      }
    }

    if (rule.type === "number") {
      if (typeof value !== "number" || isNaN(value)) {
        errors.push(`"${rule.field}" must be a number`)
      }
    }

    if (rule.type === "boolean") {
      if (typeof value !== "boolean") {
        errors.push(`"${rule.field}" must be a boolean`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

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
    // Validate input
    const validation = validateBody(body, [
      { field: "name", type: "string", required: true, minLength: 1, maxLength: 64, pattern: /^[a-zA-Z0-9_-]+$/ },
      { field: "type", type: "string", maxLength: 32 },
      { field: "script", type: "string", maxLength: 256 },
    ])
    if (!validation.valid) {
      return jsonResponse(400, { error: validation.errors.join("; ") }, config, req)
    }

    const payload = body as { name: string; type?: string; script?: string }
    try {
      const id = await agentManager.spawn({
        name: payload.name,
        agentType: payload.type as any,
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
    const validation = validateBody(body, [
      { field: "goal", type: "string", required: true, minLength: 1, maxLength: 4000 },
    ])
    if (!validation.valid) {
      return jsonResponse(400, { error: validation.errors.join("; ") }, config, req)
    }

    const payload = body as { goal?: string }
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
    const memory = await memorySystem.loadMemory()
    return jsonResponse(200, { memory }, config, req)
  }

  if (pathname === "/api/v1/memory" && method === "POST") {
    const validation = validateBody(body, [
      { field: "content", type: "string", required: true, minLength: 1, maxLength: 50000 },
    ])
    if (!validation.valid) {
      return jsonResponse(400, { error: validation.errors.join("; ") }, config, req)
    }
    const payload = body as { content: string }
    await memorySystem.appendToMemory(payload.content)
    return jsonResponse(201, { status: "saved" }, config, req)
  }

  if (pathname === "/api/v1/memory/search" && method === "POST") {
    const validation = validateBody(body, [
      { field: "query", type: "string", required: true, minLength: 1, maxLength: 1000 },
    ])
    if (!validation.valid) {
      return jsonResponse(400, { error: validation.errors.join("; ") }, config, req)
    }
    const payload = body as { query: string }
    const results = await memorySystem.search(payload.query)
    return jsonResponse(200, { results }, config, req)
  }

  // ── Health ──────────────────────────────────────────────────────────

  if (pathname === "/api/v1/health" && method === "GET") {
    return jsonResponse(200, {
      status: "ok",
      version: "0.1.0",
      uptime: process.uptime(),
      agents: {
        total: agentManager.agents.size,
        running: agentManager.list().filter((a) => a.status === "running").length,
      },
    }, config, req)
  }

  if (pathname === "/api/v1/types" && method === "GET") {
    const { getAllAgentTypes } = await import("../agent/agent-types")
    return jsonResponse(200, { types: getAllAgentTypes() }, config, req)
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

    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

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

      const req: ApiRequest = {
        method: request.method,
        pathname: url.pathname,
        headers: Object.fromEntries(request.headers.entries()),
        body:
          request.method === "POST" || request.method === "PUT"
            ? await request.json().catch(() => ({}))
            : undefined,
      }

      return handleRequest(req, config)
    },
  })

  log.info("API server listening", { url: `http://${config.host}:${config.port}` })

  return {
    stop: () => {
      server.stop()
      log.info("API server stopped")
    },
  }
}

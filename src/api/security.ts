import { createLogger } from "../cli/logger"
import { rbacManager, type Permission } from "../auth"
import type { ApiRequest, ApiServerConfig } from "./types"

const log = createLogger("api")

export class RateLimiter {
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

let rbacEnabled = false
let rbacRequired = false

export function setRbacState(enabled: boolean, required: boolean): void {
  rbacEnabled = enabled
  rbacRequired = required
}

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
}

export const HSTS_HEADER = "max-age=63072000; includeSubDomains"

export function getAllowedOrigins(config: ApiServerConfig): string[] {
  if (config.corsOrigins) {
    return config.corsOrigins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean)
  }
  // Default to same-origin only. For production, set AEGIS_CORS_ORIGINS env var.
  // Examples: "https://yourdomain.com,https://app.yourdomain.com"
  return []
}

export function buildCorsHeaders(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  if (origin && allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    }
  }
  return {}
}

const ROUTE_PERMISSIONS: Array<{ pattern: RegExp; method: string; permission: Permission }> = [
  { pattern: /^\/api\/v1\/agents$/, method: "GET", permission: "agent:view" },
  { pattern: /^\/api\/v1\/agents$/, method: "POST", permission: "agent:spawn" },
  { pattern: /^\/api\/v1\/agents\/([^/]+)$/, method: "GET", permission: "agent:view" },
  { pattern: /^\/api\/v1\/agents\/([^/]+)$/, method: "DELETE", permission: "agent:stop" },
  { pattern: /^\/api\/v1\/agents\/([^/]+)\/tasks$/, method: "POST", permission: "agent:modify" },
  { pattern: /^\/api\/v1\/memory$/, method: "GET", permission: "memory:read" },
  { pattern: /^\/api\/v1\/memory$/, method: "POST", permission: "memory:write" },
  { pattern: /^\/api\/v1\/memory\/search$/, method: "POST", permission: "memory:read" },
  { pattern: /^\/api\/v1\/skills$/, method: "GET", permission: "config:read" },
  { pattern: /^\/api\/v1\/skills$/, method: "POST", permission: "config:write" },
  { pattern: /^\/api\/v1\/projects$/, method: "GET", permission: "admin:all" },
  { pattern: /^\/api\/v1\/sessions/, method: "GET", permission: "admin:all" },
  { pattern: /^\/api\/v1\/sessions/, method: "DELETE", permission: "admin:all" },
  { pattern: /^\/api\/v1\/health$/, method: "GET", permission: "admin:all" },
  { pattern: /^\/api\/v1\/metrics$/, method: "GET", permission: "admin:all" },
  { pattern: /^\/api\/v1\/souls$/, method: "GET", permission: "admin:all" },
  { pattern: /^\/api\/v1\/souls\/([^/]+)$/, method: "GET", permission: "admin:all" },
  { pattern: /^\/api\/v1\/types$/, method: "GET", permission: "agent:view" },
  { pattern: /^\/api\/v1\/ws\/health$/, method: "GET", permission: "admin:all" },
]

function resolveRoutePermission(pathname: string, method: string): Permission | null {
  for (const entry of ROUTE_PERMISSIONS) {
    if (entry.pattern.test(pathname) && entry.method === method) {
      return entry.permission
    }
  }
  return null
}

function extractBearerKey(req: ApiRequest): string | null {
  const authHeader = req.headers["authorization"]
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i)
    if (match && match[1]) return match[1]
  }
  const queryKey = req.searchParams?.get("api_key")
  if (queryKey) return queryKey
  return null
}

function staticKeyAuth(req: ApiRequest, config: ApiServerConfig): boolean {
  if (!config.apiKey) return true
  const authHeader = req.headers["authorization"] || req.headers["x-api-key"] || ""
  return authHeader === `Bearer ${config.apiKey}` || authHeader === config.apiKey
}

export function authorize(req: ApiRequest, config: ApiServerConfig, ip: string): Response | null {
  if (rbacEnabled) {
    const routePerm = resolveRoutePermission(req.pathname, req.method)
    if (routePerm || rbacRequired) {
      const required = routePerm ?? ("admin:all" as Permission)
      const apiKey = extractBearerKey(req)
      if (!apiKey) {
        return jsonResponse(401, { error: "Unauthorized: no API key provided" }, config, req)
      }
      const result = rbacManager.validateApiKey(apiKey)
      if (!result.valid) {
        return jsonResponse(401, { error: "Unauthorized: invalid API key" }, config, req)
      }
      if (!result.permissions?.includes(required) && !result.permissions?.includes("admin:all" as Permission)) {
        log.warn("RBAC denied", { ip, path: req.pathname, permission: required })
        return jsonResponse(403, { error: "Forbidden: insufficient permissions" }, config, req)
      }
    }
    return null
  }
  if (!staticKeyAuth(req, config)) {
    log.warn("Unauthorized API request", { ip, path: req.pathname })
    return jsonResponse(401, { error: "Unauthorized" }, config, req)
  }
  return null
}

export function jsonResponse(status: number, body: unknown, config: ApiServerConfig, req: ApiRequest): Response {
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

import { timingSafeEqual } from "node:crypto"
import { createLogger } from "../cli/logger"
import { rbacManager, type Permission, type RBACManager } from "../auth"
import type { ApiRequest, ApiServerConfig } from "./types"

export { RateLimiter } from "./rate-limiter"

const log = createLogger("api")

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

const API_PREFIX = "/api/v1"

export const ADMIN_PERMISSION: Permission = "admin:all"

export const UNMAPPED_ROUTE_PERMISSION: Permission = ADMIN_PERMISSION

const ROUTE_PERMISSIONS: Array<{ pattern: RegExp; method: string; permission: Permission }> = [
  { pattern: /^\/api\/v1\/agents$/, method: "GET", permission: "agent:view" },
  { pattern: /^\/api\/v1\/agents$/, method: "POST", permission: "agent:spawn" },
  { pattern: /^\/api\/v1\/agents\/([^/]+)$/, method: "GET", permission: "agent:view" },
  { pattern: /^\/api\/v1\/agents\/([^/]+)$/, method: "DELETE", permission: "agent:stop" },
  { pattern: /^\/api\/v1\/agents\/([^/]+)\/tasks$/, method: "POST", permission: "agent:modify" },
  { pattern: /^\/api\/v1\/chat$/, method: "POST", permission: "agent:spawn" },
  { pattern: /^\/api\/v1\/chat\/providers$/, method: "GET", permission: "config:read" },
  { pattern: /^\/api\/v1\/events$/, method: "GET", permission: "agent:view" },
  { pattern: /^\/api\/v1\/ws$/, method: "GET", permission: "agent:view" },
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
  { pattern: /^\/api\/v1\/webhook\//, method: "POST", permission: "trigger:fire" },
]

export function isProtectedApiPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`)
}

export function resolveRoutePermission(pathname: string, method: string): Permission | null {
  for (const entry of ROUTE_PERMISSIONS) {
    if (entry.pattern.test(pathname) && entry.method === method) {
      return entry.permission
    }
  }
  return null
}

export function resolveRequiredPermission(pathname: string, method: string): Permission {
  return resolveRoutePermission(pathname, method) ?? UNMAPPED_ROUTE_PERMISSION
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

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8")
  const bufB = Buffer.from(b, "utf-8")
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function staticKeyAuth(req: ApiRequest, config: ApiServerConfig): boolean {
  const configuredKey = config.apiKey
  if (!configuredKey) return false
  const authHeader = req.headers["authorization"] || req.headers["x-api-key"] || ""
  if (!authHeader) return false
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)
  const presentedKey = bearer && bearer[1] ? bearer[1] : authHeader
  return safeEqual(presentedKey, configuredKey)
}

function authorizeRbac(
  req: ApiRequest,
  config: ApiServerConfig,
  ip: string,
  manager: RBACManager,
): Response | null {
  const routePerm = resolveRoutePermission(req.pathname, req.method)
  const protectedPath = routePerm !== null || rbacRequired || isProtectedApiPath(req.pathname)
  if (!protectedPath) return null

  const isPreflight = req.method === "OPTIONS"
  if (isPreflight && !rbacRequired) return null

  const required = routePerm ?? UNMAPPED_ROUTE_PERMISSION
  const apiKey = extractBearerKey(req)
  if (!apiKey) {
    return jsonResponse(401, { error: "Unauthorized: no API key provided" }, config, req)
  }
  const result = manager.validateApiKey(apiKey)
  if (!result.valid) {
    return jsonResponse(401, { error: "Unauthorized: invalid API key" }, config, req)
  }
  if (isPreflight) return null

  const permissions = result.permissions ?? []
  if (!permissions.includes(required) && !permissions.includes(ADMIN_PERMISSION)) {
    log.warn("RBAC denied", { ip, path: req.pathname, permission: required })
    return jsonResponse(403, { error: "Forbidden: insufficient permissions" }, config, req)
  }
  return null
}

export function authorize(
  req: ApiRequest,
  config: ApiServerConfig,
  ip: string,
  manager: RBACManager = rbacManager,
): Response | null {
  if (rbacEnabled) {
    return authorizeRbac(req, config, ip, manager)
  }

  if (!config.apiKey) {
    if (config.allowUnauthenticated) return null
    log.warn("Unauthorized API request: server has no API key configured", { ip, path: req.pathname })
    return jsonResponse(401, { error: "Unauthorized: server has no API key configured" }, config, req)
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

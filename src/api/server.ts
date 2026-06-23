import { createLogger } from "../cli/logger"
import { createRedirectServer } from "./redirect"
import {
  getAllowedOrigins,
  HSTS_HEADER,
  RateLimiter,
  SECURITY_HEADERS,
  setRbacState,
} from "./security"
import { handleRequest } from "./routes"
import {
  clearWsClients,
  createSseResponse,
  createWebSocketHandlers,
  startA2uiWsBridge,
  startWsEventBridge,
  stopWsEventBridge,
} from "./ws"
import type { ApiRequest, ApiServerConfig } from "./types"

export type { ApiServerConfig } from "./types"
export { getWsHealth, startWsEventBridge, startA2uiWsBridge, stopWsEventBridge } from "./ws"

const log = createLogger("api")

export function startApiServer(config: ApiServerConfig): { stop: () => void } {
  const rateLimiter = new RateLimiter(config.rateLimitMax ?? 100, config.rateLimitWindowMs ?? 60_000)
  const allowedOrigins = getAllowedOrigins(config)

  setRbacState(config.auth ?? false, config.authRequired ?? false)

  const tlsCertPath = process.env.AEGIS_TLS_CERT
  const tlsKeyPath = process.env.AEGIS_TLS_KEY
  const tlsActive = !!(tlsCertPath && tlsKeyPath)
  let redirectServer: { stop: () => void } | null = null

  if (tlsActive) {
    log.info("TLS enabled", { cert: tlsCertPath, key: tlsKeyPath })
    SECURITY_HEADERS["Strict-Transport-Security"] = HSTS_HEADER
  }

  log.info("Starting API server", {
    port: config.port,
    host: config.host,
    authEnabled: !!config.apiKey,
    rbacEnabled: config.auth ?? false,
    rbacRequired: config.authRequired ?? false,
    corsOrigins: allowedOrigins.join(", "),
    rateLimit: `${config.rateLimitMax ?? 100}/min`,
    tls: tlsActive,
  })

  // ── Try to bind to the requested port, auto-retry on next port if busy ──
  const MAX_PORT_RETRIES = 5
  let server: ReturnType<typeof Bun.serve>
  let boundPort = config.port

  for (let attempt = 0; attempt <= MAX_PORT_RETRIES; attempt++) {
    const tryPort = config.port + attempt
    try {
      server = Bun.serve({
        port: tryPort,
        hostname: config.host,

        websocket: createWebSocketHandlers(),

        async fetch(request: Request): Promise<Response> {
          const url = new URL(request.url)
          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"

          if (url.pathname === "/api/v1/ws" && request.headers.get("upgrade") === "websocket") {
            if (config.apiKey) {
              const authHeader = request.headers.get("authorization") || request.headers.get("x-api-key") || ""
              const authed = authHeader === `Bearer ${config.apiKey}` || authHeader === config.apiKey
              if (!authed) {
                return new Response("Unauthorized", { status: 401 })
              }
            }

            const upgraded = (server as Bun.Server<undefined>).upgrade(request)
            if (upgraded) return new Response(null, { status: 101 })
            return new Response("WebSocket upgrade failed", { status: 400 })
          }

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

          if (config.webhookConfig && url.pathname.startsWith("/api/v1/webhook/")) {
            const { createWebhookHandler } = await import("./webhook-handler")
            const handler = createWebhookHandler(config.webhookConfig)
            return handler(request)
          }

          if (url.pathname === "/api/v1/events" && request.method === "GET") {
            return createSseResponse()
          }

          const req: ApiRequest = {
            method: request.method,
            pathname: url.pathname,
            headers: Object.fromEntries(request.headers.entries()),
            searchParams: url.searchParams,
            body:
              request.method === "POST" || request.method === "PUT" ? await request.json().catch(() => ({})) : undefined,
          }

          // ── Global route error boundary: individual route errors never crash the server ──
          try {
            return await handleRequest(req, config)
          } catch (routeErr) {
            const errMsg = routeErr instanceof Error ? routeErr.message : String(routeErr)
            log.error("Unhandled route error", { path: req.pathname, method: req.method, error: errMsg })
            return new Response(
              JSON.stringify({ error: "Internal server error", code: "ROUTE_ERROR" }),
              {
                status: 500,
                headers: { "Content-Type": "application/json", ...SECURITY_HEADERS },
              },
            )
          }
        },
      })
      boundPort = tryPort
      if (attempt > 0) {
        log.warn(`Port ${config.port} was in use, bound to alternative port ${tryPort}`)
      }
      break
    } catch (err) {
      if (attempt < MAX_PORT_RETRIES) {
        log.warn(`Port ${tryPort} is in use, trying next port...`, { error: String(err) })
        continue
      }
      // All retries exhausted — throw a clear, actionable error
      const msg = `Failed to bind to any port in range ${config.port}–${config.port + MAX_PORT_RETRIES}. Check if another service is using these ports.`
      log.error(msg)
      throw new Error(msg)
    }
  }

  // At this point `server` is guaranteed to be assigned from the successful loop above.
  const boundServer = server!

  startWsEventBridge()
  const unsubA2ui = startA2uiWsBridge()

  if (tlsActive) {
    const httpRedirectPort = boundPort
    const httpsPort = boundPort + 1
    try {
      redirectServer = createRedirectServer(httpRedirectPort, httpsPort)
      log.info("TLS redirect active", { httpPort: httpRedirectPort, httpsPort })
    } catch (err) {
      log.warn("Failed to start redirect server", { error: String(err) })
    }
  }

  const protocol = tlsActive ? "https" : "http"
  log.info("API server listening", { url: `${protocol}://${config.host}:${boundPort}` })

  return {
    stop: () => {
      stopWsEventBridge()
      if (unsubA2ui) unsubA2ui()
      if (redirectServer) redirectServer.stop()
      clearWsClients()
      boundServer.stop()
      log.info("API server stopped")
    },
  }
}

import { serve } from "bun"
import { createLogger } from "../cli/logger"
import { loadCiConfig } from "./config"
import { verifyPayload } from "./hmac"
import { handleCiFixRequest } from "./watcher"
import type { CiFixRequest } from "./types"

const log = createLogger("ci-server")

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Handle a CI fix request. Requires a valid HMAC signature over the raw body.
 * A missing key is a hard failure (503) — the endpoint is never served unauthenticated.
 */
export async function handleCiFixHttpRequest(req: Request, hmacKey: string | null): Promise<Response> {
  if (!hmacKey) {
    log.error("CI fix endpoint called with no hmac_key configured")
    return jsonResponse(503, { error: "server misconfigured" })
  }

  const body = await req.text()
  const signature = req.headers.get("X-Aegis-Signature")

  if (!signature || !verifyPayload(body, signature, hmacKey)) {
    log.warn("HMAC verification failed")
    return jsonResponse(401, { error: "Unauthorized" })
  }

  try {
    const fixRequest = JSON.parse(body) as CiFixRequest
    const status = await handleCiFixRequest(fixRequest)
    return jsonResponse(202, status)
  } catch (err) {
    log.warn(`Invalid fix request: ${err}`)
    return jsonResponse(400, { error: "Invalid request" })
  }
}

export function startCiServer(port?: number): void {
  const config = loadCiConfig()
  const hmacKey = config.hmac_key || process.env.AEGIS_CI_HMAC_KEY || null

  if (!hmacKey) {
    log.error(
      "No HMAC key configured for the CI fix endpoint. Set hmac_key in ~/.aegis/ci.yaml or export AEGIS_CI_HMAC_KEY. Every /api/v1/ci/fix request is rejected until a key is configured.",
    )
  }

  serve({
    port: port ?? config.port,
    async fetch(req) {
      const url = new URL(req.url)

      // CORS
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204 })
      }

      // Health check
      if (url.pathname === "/health") {
        return jsonResponse(200, { status: "ok" })
      }

      // CI fix endpoint
      if (url.pathname === "/api/v1/ci/fix" && req.method === "POST") {
        return handleCiFixHttpRequest(req, hmacKey)
      }

      return new Response("Not found", { status: 404 })
    },
  })

  log.info(`CI daemon listening on port ${port ?? config.port}`)
}

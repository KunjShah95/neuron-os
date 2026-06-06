import { serve } from "bun"
import { createLogger } from "../cli/logger"
import { loadCiConfig } from "./config"
import { verifySignature } from "./hmac"
import { handleCiFixRequest } from "./watcher"
import type { CiFixRequest } from "./types"

const log = createLogger("ci-server")

export function startCiServer(port?: number): void {
  const config = loadCiConfig()
  const hmacKey = config.hmac_key

  if (!hmacKey) {
    log.warn("No hmac_key configured in CI config. Set one with: aegis ci config")
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
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }

      // CI fix endpoint
      if (url.pathname === "/api/v1/ci/fix" && req.method === "POST") {
        const body = await req.text()

        // HMAC verification
        if (hmacKey) {
          const signature = req.headers.get("X-Aegis-Signature")
          if (!signature || !verifySignature(body, signature, hmacKey)) {
            log.warn("HMAC verification failed")
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: { "Content-Type": "application/json" },
            })
          }
        }

        try {
          const fixRequest = JSON.parse(body) as CiFixRequest
          const status = await handleCiFixRequest(fixRequest)

          return new Response(JSON.stringify(status), {
            status: 202,
            headers: { "Content-Type": "application/json" },
          })
        } catch (err) {
          log.warn(`Invalid fix request: ${err}`)
          return new Response(JSON.stringify({ error: "Invalid request" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          })
        }
      }

      return new Response("Not found", { status: 404 })
    },
  })

  log.info(`CI daemon listening on port ${port ?? config.port}`)
}

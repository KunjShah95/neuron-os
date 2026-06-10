import { createLogger } from "../cli/logger"

const log = createLogger("api:redirect")

/**
 * Create an HTTP server that redirects all requests to HTTPS.
 * Used when TLS is active to transparently upgrade insecure connections.
 */
export function createRedirectServer(httpPort: number, httpsPort: number): {
  stop: () => void
  port: number
} {
  const server = Bun.serve({
    port: httpPort,
    fetch(req: Request): Response {
      const url = new URL(req.url)
      const target = `https://${url.hostname}:${httpsPort}${url.pathname}${url.search}`

      log.debug("Redirecting HTTP → HTTPS", { from: url.pathname, to: target })

      return Response.redirect(target, 301)
    },
  })

  log.info("HTTP → HTTPS redirect server started", { httpPort, httpsPort })

  return {
    port: httpPort,
    stop: () => {
      server.stop()
      log.info("HTTP → HTTPS redirect server stopped")
    },
  }
}

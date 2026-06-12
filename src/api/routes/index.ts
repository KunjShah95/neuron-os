import { createLogger } from "../../cli/logger"
import {
  authorize,
  buildCorsHeaders,
  getAllowedOrigins,
  jsonResponse,
  SECURITY_HEADERS,
} from "../security"
import type { ApiRequest, ApiServerConfig } from "../types"
import { handleAgentRoutes } from "./agents"
import { handleMemoryRoutes } from "./memory"
import { handleSessionRoutes } from "./sessions"
import { handleSkillRoutes } from "./skills"
import { handleSystemRoutes } from "./system"

const log = createLogger("api")

export async function handleRequest(req: ApiRequest, config: ApiServerConfig): Promise<Response> {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown"

  log.debug("API request", { method: req.method, path: req.pathname, ip })

  const denied = authorize(req, config, ip)
  if (denied) return denied

  if (req.method === "OPTIONS") {
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

  const handlers = [handleAgentRoutes, handleMemoryRoutes, handleSystemRoutes, handleSessionRoutes, handleSkillRoutes]
  for (const handler of handlers) {
    const response = await handler(req, config)
    if (response) return response
  }

  return jsonResponse(404, { error: "Not found" }, config, req)
}

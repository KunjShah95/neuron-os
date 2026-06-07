import type { IncomingMessage, ServerResponse } from "node:http"
import type { Permission, RBACManager } from "./rbac"

export class AuthMiddleware {
  constructor(private rbac: RBACManager) {}

  requirePermission(permission: Permission): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
    return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
      const apiKey = this.extractApiKey(req)
      if (!apiKey) {
        res.statusCode = 401
        res.end(JSON.stringify({ error: "Unauthorized: no API key provided" }))
        return false
      }

      const result = this.rbac.validateApiKey(apiKey)
      if (!result.valid) {
        res.statusCode = 401
        res.end(JSON.stringify({ error: "Unauthorized: invalid API key" }))
        return false
      }

      if (!result.permissions?.includes(permission) && !result.permissions?.includes("admin:all" as Permission)) {
        res.statusCode = 403
        res.end(JSON.stringify({ error: "Forbidden: insufficient permissions" }))
        return false
      }

      return true
    }
  }

  extractApiKey(req: IncomingMessage): string | null {
    const authHeader = req.headers["authorization"]
    if (authHeader) {
      const match = authHeader.match(/^Bearer\s+(.+)$/i)
      if (match && match[1]) return match[1]
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
    const queryKey = url.searchParams.get("api_key")
    if (queryKey) return queryKey

    return null
  }

  validateSessionToken(_token: string): { valid: boolean; userId?: string } {
    return { valid: false }
  }
}

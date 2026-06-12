import { jsonResponse } from "../security"
import type { ApiRequest, ApiServerConfig } from "../types"

export async function handleSessionRoutes(req: ApiRequest, config: ApiServerConfig): Promise<Response | null> {
  if (!config.sessionDb) return null

  const { method, pathname } = req

  if (pathname === "/api/v1/sessions" && method === "GET") {
    const { sessionStore, getProjectSessionStore } = await import("../../memory/session-persistence")
    const project = req.searchParams?.get("project") || undefined
    const store = project ? getProjectSessionStore(project) : sessionStore
    const sessions = store.restoreRecentSessions(50)
    return jsonResponse(200, { sessions }, config, req)
  }

  if (pathname === "/api/v1/sessions/stats" && method === "GET") {
    const { sessionStore, getProjectSessionStore } = await import("../../memory/session-persistence")
    const project = req.searchParams?.get("project") || undefined
    const store = project ? getProjectSessionStore(project) : sessionStore
    const stats = store.getStats()
    return jsonResponse(200, stats, config, req)
  }

  const sessionMatch = pathname.match(/^\/api\/v1\/sessions\/([^/]+)$/)
  if (sessionMatch && sessionMatch[1] && method === "GET") {
    const { sessionStore, getProjectSessionStore } = await import("../../memory/session-persistence")
    const project = req.searchParams?.get("project") || undefined
    const store = project ? getProjectSessionStore(project) : sessionStore
    const sessionId = sessionMatch[1]
    const session = store.getSession(sessionId)
    if (!session) return jsonResponse(404, { error: "Session not found" }, config, req)

    const messages = store.getMessages(sessionId, 100)
    return jsonResponse(200, { session, messages }, config, req)
  }

  if (sessionMatch && sessionMatch[1] && method === "DELETE") {
    const { sessionStore, getProjectSessionStore } = await import("../../memory/session-persistence")
    const project = req.searchParams?.get("project") || undefined
    const store = project ? getProjectSessionStore(project) : sessionStore
    store.deleteSession(sessionMatch[1])
    return jsonResponse(200, { status: "deleted" }, config, req)
  }

  return null
}

import { jsonResponse } from "../security"
import type { ApiRequest, ApiServerConfig } from "../types"
import { MemoryContentSchema, MemoryQuerySchema } from "./schemas"

export async function handleMemoryRoutes(req: ApiRequest, config: ApiServerConfig): Promise<Response | null> {
  const { method, pathname, body } = req

  if (pathname === "/api/v1/memory" && method === "GET") {
    const { memorySystem, getProjectMemorySystem } = await import("../../memory/system")
    const project = req.searchParams?.get("project") || undefined
    const memory = project ? getProjectMemorySystem(project).loadMemory() : memorySystem.loadMemory()
    return jsonResponse(200, { memory: await memory }, config, req)
  }

  if (pathname === "/api/v1/memory" && method === "POST") {
    const memResult = MemoryContentSchema.safeParse(body)
    if (!memResult.success) {
      return jsonResponse(400, { error: memResult.error.issues.map((i) => i.message).join("; ") }, config, req)
    }
    const payload = memResult.data
    const { memorySystem, getProjectMemorySystem } = await import("../../memory/system")
    const project = req.searchParams?.get("project") || undefined
    const ms = project ? getProjectMemorySystem(project) : memorySystem
    await ms.appendToMemory(payload.content)
    return jsonResponse(201, { status: "saved" }, config, req)
  }

  if (pathname === "/api/v1/memory/search" && method === "POST") {
    const queryResult = MemoryQuerySchema.safeParse(body)
    if (!queryResult.success) {
      return jsonResponse(400, { error: queryResult.error.issues.map((i) => i.message).join("; ") }, config, req)
    }
    const payload = queryResult.data
    const { memorySystem, getProjectMemorySystem } = await import("../../memory/system")
    const project = req.searchParams?.get("project") || undefined
    const ms = project ? getProjectMemorySystem(project) : memorySystem
    const results = await ms.search(payload.query)
    return jsonResponse(200, { results }, config, req)
  }

  return null
}

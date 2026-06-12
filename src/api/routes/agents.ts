import { agentManager } from "../../agent/manager"
import type { AgentTypeName } from "../../agent/agent-types"
import { createLogger } from "../../cli/logger"
import { jsonResponse } from "../security"
import type { ApiRequest, ApiServerConfig } from "../types"
import { SpawnAgentSchema, TaskGoalSchema } from "./schemas"

const log = createLogger("api")

export interface AgentSummary {
  id: string
  name: string
  type: string | undefined
  status: string
  pid: number | undefined
  uptime: number
}

export function listAgentSummaries(): AgentSummary[] {
  return agentManager.list().map((a) => ({
    id: a.id,
    name: a.def.name,
    type: a.def.agentType,
    status: a.status,
    pid: a.pid,
    uptime: a.spawnTime ? Math.floor((Date.now() - a.spawnTime) / 1000) : 0,
  }))
}

export async function handleAgentRoutes(req: ApiRequest, config: ApiServerConfig): Promise<Response | null> {
  const { method, pathname, body } = req

  if (pathname === "/api/v1/agents" && method === "GET") {
    return jsonResponse(200, { agents: listAgentSummaries() }, config, req)
  }

  if (pathname === "/api/v1/agents" && method === "POST") {
    const spawnResult = SpawnAgentSchema.safeParse(body)
    if (!spawnResult.success) {
      return jsonResponse(400, { error: spawnResult.error.issues.map((i) => i.message).join("; ") }, config, req)
    }

    const payload = spawnResult.data
    try {
      const id = await agentManager.spawn({
        name: payload.name,
        agentType: payload.type as AgentTypeName | undefined,
        script: payload.script ?? "src/agent/agent-worker.ts",
      })
      log.info("Agent spawned via API", { agentId: id, name: payload.name })
      return jsonResponse(201, { id, name: payload.name, status: "spawning" }, config, req)
    } catch (err: unknown) {
      const spawnErrMsg = err instanceof Error ? err.message : String(err)
      log.error("Failed to spawn agent via API", { error: spawnErrMsg })
      return jsonResponse(500, { error: spawnErrMsg }, config, req)
    }
  }

  const agentMatch = pathname.match(/^\/api\/v1\/agents\/([^/]+)$/)
  if (agentMatch && agentMatch[1]) {
    const agentId = agentMatch[1]
    const instance = agentManager.get(agentId)
    if (!instance) return jsonResponse(404, { error: "Agent not found" }, config, req)

    if (method === "GET") {
      return jsonResponse(
        200,
        {
          id: instance.id,
          name: instance.def.name,
          type: instance.def.agentType,
          status: instance.status,
          pid: instance.pid,
          logCount: instance.log.length,
        },
        config,
        req,
      )
    }

    if (method === "DELETE") {
      await agentManager.kill(agentId)
      log.info("Agent killed via API", { agentId })
      return jsonResponse(200, { status: "stopped" }, config, req)
    }
  }

  const taskMatch = pathname.match(/^\/api\/v1\/agents\/([^/]+)\/tasks$/)
  if (taskMatch && taskMatch[1] && method === "POST") {
    const agentId = taskMatch[1]
    const goalResult = TaskGoalSchema.safeParse(body)
    if (!goalResult.success) {
      return jsonResponse(400, { error: goalResult.error.issues.map((i) => i.message).join("; ") }, config, req)
    }

    const payload = goalResult.data
    const instance = agentManager.get(agentId)
    if (!instance) return jsonResponse(404, { error: "Agent not found" }, config, req)

    const taskId = `api-${Date.now()}`
    agentManager.sendIpc(agentId, {
      type: "run-task",
      id: taskId,
      payload: { goal: payload.goal },
      timestamp: Date.now(),
    })

    log.info("Task submitted via API", { agentId, taskId })
    return jsonResponse(202, { taskId, status: "accepted" }, config, req)
  }

  return null
}

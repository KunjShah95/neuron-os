import type { Tool, ToolResult, ToolContext } from "./registry"
import { agentManager } from "../agent/manager"

export const delegateTaskTool: Tool = {
  name: "delegate_task",
  description:
    "Delegate a task to a specialized sub-agent. Routes the goal to an existing agent by type or name, or spawns a new one if none is available. Returns the sub-agent's output synchronously.",
  parameters: [
    {
      name: "goal",
      type: "string",
      description: "The goal or task description for the sub-agent",
      required: true,
    },
    {
      name: "agentType",
      type: "string",
      description:
        "Target agent type (build, read, review, debug, etc.) or 'name:<agent-name>' to target a specific named agent",
    },
    {
      name: "context",
      type: "string",
      description: "Optional context or files to pass to the sub-agent as background",
    },
    {
      name: "timeout",
      type: "number",
      description: "Timeout in milliseconds (default: 300000 / 5 min)",
    },
  ],
  async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const goal = params.goal as string
    if (!goal) {
      return { success: false, output: "", error: "Goal parameter is required" }
    }

    const agentTypeParam = (params.agentType as string) || "build"
    const context = (params.context as string) || ""
    const timeoutMs = (params.timeout as number) || 300_000

    // Determine whether target is a name (prefix "name:") or a type
    const isNameLookup = agentTypeParam.startsWith("name:")
    const targetName = isNameLookup ? agentTypeParam.slice(5).trim() : undefined
    const targetType = isNameLookup ? undefined : agentTypeParam

    // Build the full goal with optional context
    const fullGoal = context ? `Context from ${ctx.agentId}:\n${context}\n\nTask: ${goal}` : goal

    try {
      // 1. Try to find an existing agent of the requested type/name
      const targetAgent = targetName
        ? agentManager.findAgentByName(targetName)
        : targetType
          ? agentManager.findAgentByType(targetType)
          : undefined

      if (targetAgent) {
        // Route dispatch to the existing agent via manager
        const result = await agentManager.routeIpc(ctx.agentId, targetAgent.id, {
          type: "dispatch",
          id: `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          payload: {
            goal: fullGoal,
            sourceAgentId: ctx.agentId,
            timeoutMs,
          },
          timestamp: Date.now(),
        })

        const data = result as {
          success?: boolean
          output?: string
          error?: string
          durationMs?: number
        }

        return {
          success: data?.success ?? true,
          output: data?.output ?? "(no output)",
          error: data?.error,
          metadata: {
            targetAgent: targetAgent.def.name,
            targetAgentId: targetAgent.id,
            durationMs: data?.durationMs,
          },
        }
      }

      // 2. No existing agent found — spawn a new one and dispatch to it
      const agentName = `delegate-${targetType || "build"}-${Date.now().toString(36)}`
      const newAgentId = await agentManager.spawn({
        name: agentName,
        script: "src/agent/agent-worker.ts",
        agentType: (targetType as any) || "build",
        env: {
          AEGIS_AGENT_TYPE: targetType || "build",
        },
        recovery: { maxRetries: 2 },
      })

      try {
        const result = await agentManager.routeIpc(ctx.agentId, newAgentId, {
          type: "dispatch",
          id: `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          payload: {
            goal: fullGoal,
            sourceAgentId: ctx.agentId,
            timeoutMs,
          },
          timestamp: Date.now(),
        })

        const data = result as {
          success?: boolean
          output?: string
          error?: string
          durationMs?: number
        }

        return {
          success: data?.success ?? true,
          output: data?.output ?? "(no output)",
          error: data?.error,
          metadata: {
            targetAgent: agentName,
            targetAgentId: newAgentId,
            spawned: true,
            durationMs: data?.durationMs,
          },
        }
      } finally {
        // Clean up: send shutdown to spawned agent after task completes
        try {
          agentManager.sendIpc(newAgentId, {
            type: "shutdown",
            id: "cleanup",
            payload: { reason: "dispatch-complete" },
            timestamp: Date.now(),
          })
        } catch {
          // Agent may have already exited; ignore cleanup errors
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return {
        success: false,
        output: "",
        error: `Delegation failed: ${msg}`,
      }
    }
  },
}

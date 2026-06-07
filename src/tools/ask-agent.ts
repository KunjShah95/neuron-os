import type { Tool, ToolContext, ToolResult } from "./registry"
import { taskQueue } from "../agent/queue"

export const askAgentTool: Tool = {
  name: "ask_agent",
  description:
    "Ask another specialized agent to perform a task for you. The task will run asynchronously in the background, and this tool will block until the agent completes the work and returns the result.",
  parameters: [
    {
      name: "goal",
      type: "string",
      description: "The specific goal or question to assign to the new agent.",
      required: true,
    },
    {
      name: "agentType",
      type: "string",
      description: "Optional type of agent to spawn (e.g. 'frontend', 'backend', 'researcher'). Default is 'default'.",
      required: false,
    },
  ],
  execute: async (params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> => {
    const goal = String(params.goal)

    // Submit a high priority task so another worker grabs it quickly
    const taskId = taskQueue.submit(goal, "high")

    // Poll the queue until completion (with timeout)
    const timeoutMs = 5 * 60 * 1000 // 5 minutes
    const start = Date.now()

    while (Date.now() - start < timeoutMs) {
      const task = taskQueue.getTask(taskId)
      if (task) {
        if (task.status === "completed") {
          return {
            success: true,
            output: task.result || "(Task completed without specific output)",
          }
        }
        if (task.status === "failed") {
          return {
            success: false,
            output: "",
            error: task.result || "Task failed with unknown error",
          }
        }
      }

      // Sleep for 2 seconds before checking again
      await new Promise((r) => setTimeout(r, 2000))
    }

    return {
      success: false,
      output: "",
      error: `Agent task timed out after 5 minutes (Task ID: ${taskId})`,
    }
  },
}

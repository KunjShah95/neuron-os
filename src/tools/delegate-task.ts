import type { Tool, ToolResult, ToolContext } from "./registry"

export const delegateTaskTool: Tool = {
  name: "delegate_task",
  description: "Delegate a task to a specialized sub-agent. The sub-agent runs asynchronously and returns its result when complete.",
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
      description: "Agent type: build, research, review, debug, etc.",
    },
    {
      name: "context",
      type: "string",
      description: "Optional context or files to pass to the sub-agent",
    },
    {
      name: "timeout",
      type: "number",
      description: "Timeout in milliseconds (default: 300000 / 5 min)",
    },
  ],
  async execute(params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const goal = params.goal as string
    if (!goal) {
      return { success: false, output: "", error: "Goal parameter is required" }
    }

    const agentType = (params.agentType as string) || "build"
    const context = (params.context as string) || ""

    return {
      success: true,
      output: `[Delegated to ${agentType} agent: "${goal.slice(0, 100)}"${context ? `\nContext: ${context.slice(0, 200)}` : ""}\nThe sub-agent will execute asynchronously. Check agent list for status.]`,
      metadata: { goal, agentType, delegated: true },
    }
  },
}

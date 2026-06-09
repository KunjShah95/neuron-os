import type { ToolPermission } from "../agent/agent-types"

export interface ToolContext {
  agentId: string
  agentType?: string
  cwd: string
  permissions: ToolPermission[]
}

export interface ToolResult {
  success: boolean
  output: string
  error?: string
  metadata?: Record<string, unknown>
}

export interface Tool {
  name: string
  description: string
  parameters: ToolParameter[]
  execute: (params: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>
}

export interface ToolParameter {
  name: string
  type: "string" | "number" | "boolean" | "array"
  description: string
  required?: boolean
  default?: unknown
}

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  list(): Tool[] {
    return Array.from(this.tools.values())
  }

  async execute(name: string, params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return {
        success: false,
        output: "",
        error: `Unknown tool: ${name}`,
      }
    }

    // Check permissions
    const perm = ctx.permissions.find((p) => p.name === name)
    if (!perm || !perm.allow) {
      return {
        success: false,
        output: "",
        error: `Tool '${name}' not permitted for this agent`,
      }
    }

    // Plugin hook: on_tool_call (can block)
    try {
      const { runToolCallHooks } = await import("../plugin/hook-integration")
      const hookResult = await runToolCallHooks(name, params, ctx)
      if (hookResult.blocked) {
        return { success: false, output: "", error: `Tool '${name}' blocked by plugin hook` }
      }
    } catch {
      // Plugin hooks are optional
    }

    // Validate parameters
    for (const param of tool.parameters) {
      if (param.required && !(param.name in params)) {
        return {
          success: false,
          output: "",
          error: `Missing required parameter: ${param.name}`,
        }
      }
    }

    try {
      return await tool.execute(params, ctx)
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

export const toolRegistry = new ToolRegistry()

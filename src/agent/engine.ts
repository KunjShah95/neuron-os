import { streamText, generateText, tool, jsonSchema, stepCountIs } from "ai"
import type { ModelMessage, ToolSet } from "ai"
import { AgentRuntime } from "./runtime"
import { toolRegistry, type ToolParameter, type ToolContext } from "../tools"
import { AIProviderManager } from "../ai"
import type { ToolPermission } from "./agent-types"

const FULL_TOOL_PERMISSIONS: ToolPermission[] = [
  { name: "read", allow: true },
  { name: "write", allow: true },
  { name: "edit", allow: true },
  { name: "bash", allow: true },
  { name: "grep", allow: true },
  { name: "glob", allow: true },
]

export interface AgentEngineConfig {
  maxSteps?: number
}

export class AgentEngine {
  private runtime: AgentRuntime
  private ai: AIProviderManager
  private maxSteps: number

  constructor(runtime: AgentRuntime, ai: AIProviderManager, config?: AgentEngineConfig) {
    this.runtime = runtime
    this.ai = ai
    this.maxSteps = config?.maxSteps ?? 10
  }

  private parameterToJsonSchema(p: ToolParameter): Record<string, unknown> {
    const typeMap: Record<string, string> = {
      string: "string",
      number: "number",
      boolean: "boolean",
      array: "array",
    }
    return {
      type: typeMap[p.type] || "string",
      description: p.description,
    }
  }

  private buildVercelTools(): ToolSet {
    const allTools = toolRegistry.list()
    const tools: ToolSet = {}

    for (const t of allTools) {
      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const p of t.parameters) {
        properties[p.name] = this.parameterToJsonSchema(p)
        if (p.required) {
          required.push(p.name)
        }
      }

      const schema: Record<string, unknown> = {
        type: "object",
        properties,
      }
      if (required.length > 0) {
        schema.required = required
      }

      const toolName = t.name

      ;(tools as any)[toolName] = {
        description: t.description,
        parameters: jsonSchema(schema),
        execute: async (args: any) => {
          const toolCtx: ToolContext = {
            agentId: this.runtime.context.agentId,
            agentType: this.runtime.context.agentType,
            cwd: this.runtime.context.cwd,
            permissions: FULL_TOOL_PERMISSIONS,
          }
          const result = await toolRegistry.execute(toolName, args, toolCtx)
          if (result.success) {
            return result.output || "(tool completed with no output)"
          }
          return `Error: ${result.error}`
        },
      }
    }

    return tools
  }

  private buildToolDescription(): string {
    const allTools = toolRegistry.list()
    const lines = ["You have access to the following tools:", ""]
    for (const t of allTools) {
      const params = t.parameters
        .map((p) => `${p.name}${p.required ? "" : "?"}: ${p.type}`)
        .join(", ")
      lines.push(`- **${t.name}**: ${t.description}`)
      if (params) lines.push(`  Parameters: ${params}`)
      lines.push("")
    }
    lines.push("When you need to accomplish a task, call the appropriate tool. The tool results will be provided to you in subsequent messages.")
    return lines.join("\n")
  }

  async streamChat(
    messages: ModelMessage[],
    callbacks?: {
      onChunk?: (chunk: string) => void
      onSignal?: AbortSignal
    },
  ): Promise<string> {
    const base = await this.runtime.buildSystemPrompt()
    const toolDesc = this.buildToolDescription()
    const systemPrompt = base.trim() ? `${base}\n\n---\n\n${toolDesc}` : toolDesc

    const tools = this.buildVercelTools()
    const toolKeys = Object.keys(tools)

    const result = streamText({
      model: this.ai.getModel(),
      system: systemPrompt,
      messages,
      tools: toolKeys.length > 0 ? tools : undefined,
      stopWhen: stepCountIs(this.maxSteps),
      abortSignal: callbacks?.onSignal,
      temperature: this.ai.getConfig().temperature ?? 0.7,
    })

    let fullText = ""
    for await (const chunk of result.textStream) {
      fullText += chunk
      callbacks?.onChunk?.(chunk)
    }

    return fullText
  }

  async chat(messages: ModelMessage[]): Promise<{ text: string }> {
    const base = await this.runtime.buildSystemPrompt()
    const toolDesc = this.buildToolDescription()
    const systemPrompt = base.trim() ? `${base}\n\n---\n\n${toolDesc}` : toolDesc

    const tools = this.buildVercelTools()
    const toolKeys = Object.keys(tools)

    const result = await generateText({
      model: this.ai.getModel(),
      system: systemPrompt,
      messages,
      tools: toolKeys.length > 0 ? tools : undefined,
      stopWhen: stepCountIs(this.maxSteps),
      temperature: this.ai.getConfig().temperature ?? 0.7,
    })

    return { text: result.text }
  }
}

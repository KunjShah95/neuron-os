import { skillRegistry } from "../skills"
import type { Tool, ToolResult } from "./registry"

export const readSkillTool: Tool = {
  name: "read_skill",
  description: "Load a skill by name and return its full content",
  parameters: [
    {
      name: "name",
      type: "string",
      description: "Skill name to load",
      required: true,
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const name = params.name as string

    try {
      await skillRegistry.loadAll()
      const content = await skillRegistry.readSkill(name, {
        agentId: ctx.agentId,
        agentType: ctx.agentType,
        cwd: ctx.cwd,
      })

      if (!content) {
        return {
          success: false,
          output: "",
          error: `Unknown skill: ${name}`,
        }
      }

      return {
        success: true,
        output: content,
        metadata: { name },
      }
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },
}

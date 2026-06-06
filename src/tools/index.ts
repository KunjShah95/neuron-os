export { toolRegistry, ToolRegistry } from "./registry"
export type { Tool, ToolContext, ToolResult, ToolParameter } from "./registry"
export { readSkillTool } from "./read-skill"
export { computerTool } from "./computer"
export { executeCodeTool } from "./execute-code"

import { toolRegistry } from "./registry"
import { bashTool } from "./bash"
import { readTool } from "./read"
import { writeTool } from "./write"
import { editTool } from "./edit"
import { grepTool } from "./grep"
import { globTool } from "./glob"
import { readSkillTool } from "./read-skill"
import { webFetchTool } from "./web-fetch"
import { webSearchTool } from "./web-search"
import { computerTool } from "./computer"
import { askAgentTool } from "./ask-agent"
import { executeCodeTool } from "./execute-code"

// Auto-register A2UI tool (import side-effect registers it)
import "./a2ui-tool"

// Register all built-in tools
export function registerBuiltinTools(): void {
  toolRegistry.register(bashTool)
  toolRegistry.register(askAgentTool)
  toolRegistry.register(readTool)
  toolRegistry.register(readSkillTool)
  toolRegistry.register(writeTool)
  toolRegistry.register(editTool)
  toolRegistry.register(grepTool)
  toolRegistry.register(globTool)
  toolRegistry.register(webFetchTool)
  toolRegistry.register(webSearchTool)
  toolRegistry.register(computerTool)
  toolRegistry.register(executeCodeTool)
}

// Auto-register on import
registerBuiltinTools()

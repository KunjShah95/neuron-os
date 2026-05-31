export { toolRegistry, ToolRegistry } from "./registry"
export type { Tool, ToolContext, ToolResult, ToolParameter } from "./registry"
export { readSkillTool } from "./read-skill"
export { computerTool } from "./computer"

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

// Register all built-in tools
export function registerBuiltinTools(): void {
  toolRegistry.register(bashTool)
  toolRegistry.register(readTool)
  toolRegistry.register(readSkillTool)
  toolRegistry.register(writeTool)
  toolRegistry.register(editTool)
  toolRegistry.register(grepTool)
  toolRegistry.register(globTool)
  toolRegistry.register(webFetchTool)
  toolRegistry.register(webSearchTool)
  toolRegistry.register(computerTool)
}

// Auto-register on import
registerBuiltinTools()

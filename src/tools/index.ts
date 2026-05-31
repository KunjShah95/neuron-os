export { toolRegistry, ToolRegistry } from "./registry"
export type { Tool, ToolContext, ToolResult, ToolParameter } from "./registry"

import { toolRegistry } from "./registry"
import { bashTool } from "./bash"
import { readTool } from "./read"
import { writeTool } from "./write"
import { editTool } from "./edit"
import { grepTool } from "./grep"
import { globTool } from "./glob"

// Register all built-in tools
export function registerBuiltinTools(): void {
  toolRegistry.register(bashTool)
  toolRegistry.register(readTool)
  toolRegistry.register(writeTool)
  toolRegistry.register(editTool)
  toolRegistry.register(grepTool)
  toolRegistry.register(globTool)
}

// Auto-register on import
registerBuiltinTools()

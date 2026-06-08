export { toolRegistry, ToolRegistry } from "./registry"
export type { Tool, ToolContext, ToolResult, ToolParameter } from "./registry"
export { readSkillTool } from "./read-skill"
export { computerTool } from "./computer"
export { executeCodeTool } from "./execute-code"
export { webExtractTool } from "./web-extract"
export { visionAnalyzeTool } from "./vision-analyze"
export { delegateTaskTool } from "./delegate-task"
export { memoryReadTool } from "./memory-read"
export { memoryWriteTool } from "./memory-write"
export { memorySearchTool } from "./memory-search"
export { planStateTool } from "./plan-state"
export { treeSitterTool } from "./tree-sitter"

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
import { webExtractTool } from "./web-extract"
import { visionAnalyzeTool } from "./vision-analyze"
import { delegateTaskTool } from "./delegate-task"
import { memoryReadTool } from "./memory-read"
import { memoryWriteTool } from "./memory-write"
import { memorySearchTool } from "./memory-search"
import { computerTool } from "./computer"
import { askAgentTool } from "./ask-agent"
import { executeCodeTool } from "./execute-code"
import { docsCrawlTool } from "../docs-crawl/tool"
import { planStateTool } from "./plan-state"
import { treeSitterTool } from "./tree-sitter"

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
  toolRegistry.register(webExtractTool)
  toolRegistry.register(visionAnalyzeTool)
  toolRegistry.register(delegateTaskTool)
  toolRegistry.register(memoryReadTool)
  toolRegistry.register(memoryWriteTool)
  toolRegistry.register(memorySearchTool)
  toolRegistry.register(computerTool)
  toolRegistry.register(executeCodeTool)
  toolRegistry.register(docsCrawlTool)
  toolRegistry.register(planStateTool)
  toolRegistry.register(treeSitterTool)
}

// Auto-register on import
registerBuiltinTools()

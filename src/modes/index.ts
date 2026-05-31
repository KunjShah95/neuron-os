import { registerMode } from "./registry"
import { statusMode } from "./status"
import { skillsMode } from "./skills"
import { configMode } from "./config"
import { cronMode } from "./cron"
import { memoryMode } from "./memory"
import { agentMode } from "./agent"
import { setupMode } from "./setup"
import { serveMode } from "./serve"
import { mcpMode } from "./mcp"
import { agentMemoryMode } from "./agentmemory"
import { dashboardMode, chatMode } from "./builtin"

export function registerAllModes() {
  registerMode(dashboardMode)
  registerMode(chatMode)
  registerMode(statusMode)
  registerMode(skillsMode)
  registerMode(configMode)
  registerMode(cronMode)
  registerMode(memoryMode)
  registerMode(agentMode)
  registerMode(setupMode)
  registerMode(serveMode)
  registerMode(mcpMode)
  registerMode(agentMemoryMode)
}

export { runModeLauncher } from "./launcher"
export { registerMode, listModes, getMode } from "./registry"
export type { Mode, KeyEvent } from "./types"
export { parseKey } from "./types"

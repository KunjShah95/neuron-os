import type { Command } from "commander"
import { registerWakeup } from "./wakeup"
import { registerSetup } from "./setup"
import { registerDashboard } from "./dashboard"
import { registerAgent } from "./agent"
import { registerChat } from "./chat"
import { registerStatus } from "./status"
import { registerSkills } from "./skills"
import { registerConfig } from "./config"
import { registerCron } from "./cron"
import { registerServe } from "./serve"

export function registerAllCommands(program: Command) {
  registerWakeup(program)
  registerSetup(program)
  registerDashboard(program)
  registerAgent(program)
  registerChat(program)
  registerStatus(program)
  registerSkills(program)
  registerConfig(program)
  registerCron(program)
  registerServe(program)
}

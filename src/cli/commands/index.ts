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
import { registerMCP } from "./mcp"
import { registerMemory } from "./memory"
import { registerAgentMemory } from "./agentmemory"
import { registerTelegram } from "./telegram"
import { registerAsk } from "./ask"
import { registerPlan } from "./plan"
import { registerSandbox } from "./sandbox"
import { registerComputer } from "./computer"
import { registerHarness } from "./harness"
import { registerAgentRun } from "./agent-run"
import { registerOpenApi } from "./openapi"
import { registerTelemetry } from "./telemetry"
import { registerSetupKeys } from "./setup-keys"
import { registerPool } from "./pool"
import { registerResearch } from "./research"
import { registerOrchestrate } from "./orchestrate"
import { registerWebhook } from "./webhook"
import { registerSession } from "./session"
import { registerToolset } from "./toolset"
import { registerProject } from "./project"
import { registerExperience } from "./experience"
import { registerAudit } from "./audit"
import { registerMesh } from "./mesh"
import { registerBench } from "./bench"
import { registerEmail } from "./email"
import { registerDiscord } from "./discord"
import { registerSlack } from "./slack"
import { registerWhatsApp } from "./whatsapp"
import { registerSMS } from "./sms"
import { registerVoice } from "./voice"
import { registerDoctor } from "./doctor"
import { registerCompletion } from "./completion"
import { registerSupervise } from "./supervise"
import { registerReflect } from "./reflect"
import { registerAdversarial } from "./adversarial"
import { registerCi } from "./ci"

export function registerAllCommands(program: Command) {
  registerDoctor(program)
  registerCompletion(program)
  registerSupervise(program)
  registerReflect(program)
  registerProject(program)
  registerExperience(program)
  registerAdversarial(program)
  registerCi(program)
  registerAudit(program)
  registerMesh(program)
  registerBench(program)
  registerEmail(program)
  registerDiscord(program)
  registerSlack(program)
  registerWhatsApp(program)
  registerSMS(program)
  registerVoice(program)
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
  registerMCP(program)
  registerMemory(program)
  registerAgentMemory(program)
  registerTelegram(program)
  registerAsk(program)
  registerPlan(program)
  registerSandbox(program)
  registerComputer(program)
  registerHarness(program)
  registerAgentRun(program)
  registerOpenApi(program)
  registerTelemetry(program)
  registerSetupKeys(program)
  registerPool(program)
  registerResearch(program)
  registerOrchestrate(program)
  registerWebhook(program)
  registerSession(program)
  registerToolset(program)
}

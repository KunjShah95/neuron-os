/**
 * plan/orchestrator — full plan mode flow: generate → select → execute.
 * Ported from chaicodeclaw-build.
 */

import chalk from "chalk"
import { confirm, isCancel, text } from "@clack/prompts"
import { ToolLoopAgent, stepCountIs, jsonSchema } from "ai"
import type { Tool } from "ai"
import { AIProviderManager, resolveApiKey } from "../../ai"
import type { AIConfig, AIProvider } from "../../ai"
import { ActionTracker } from "../../agent/action-tracker"
import { AgentToolExecutor } from "../../agent/agent-tools"
import { runApprovalFlow, applyAndReport } from "../../agent/approval"
import { generatePlan } from "./planner"
import { printPlan, selectSteps } from "./selection"
import { createWebTools } from "./web-tools"
import type { PlanStep } from "./types"
import { renderTerminalMarkdown } from "../../tui/terminal-md"

interface PlanTool extends Tool {
  parameters?: Tool["inputSchema"]
  execute?: (args: Record<string, unknown>) => Promise<string>
}

function buildAIConfig(): AIConfig {
  const provider = (process.env.AEGIS_AI_PROVIDER ?? "openai") as AIProvider
  return {
    provider,
    model: process.env.AEGIS_AI_MODEL ?? "gpt-4o",
    apiKey: process.env.AEGIS_AI_API_KEY || resolveApiKey(provider),
    baseUrl: process.env.AEGIS_AI_BASE_URL,
    temperature: 0.5,
  }
}

function stepPrompt(goal: string, step: PlanStep): string {
  return [`Goal: ${goal}`, `Step: ${step.title}`, step.description].join("\n")
}

export async function runPlanModeInteractive(): Promise<void> {
  console.log(chalk.bold("\n🧭 Plan Mode\n"))

  const goal = await text({ message: "What is your goal?" })
  if (isCancel(goal) || !goal.trim()) return

  const plan = await generatePlan(goal)
  printPlan(plan)

  const selected = await selectSteps(plan)
  if (selected.length === 0) return

  const proceed = await confirm({
    message: `Execute ${selected.length} step(s)`,
    initialValue: true,
  })

  if (isCancel(proceed) || !proceed) return

  const tracker = new ActionTracker()
  const executor = new AgentToolExecutor(tracker)
  const tools: Record<string, PlanTool> = {
    read_file: {
      description: "Read a workspace file (relative path).",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string" } }, required: ["path"] }),
      execute: async (args: { path: string }) => executor.readFile(args.path),
    },
    create_file: {
      description: "Stage creation of a new file (not written until approval).",
      parameters: jsonSchema({
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      }),
      execute: async (args: { path: string; content: string }) => executor.createFile(args.path, args.content),
    },
    modify_file: {
      description: "Stage a full-file replacement (pending approval).",
      parameters: jsonSchema({
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string", description: "Complete new file contents" },
        },
        required: ["path", "content"],
      }),
      execute: async (args: { path: string; content: string }) => executor.modifyFile(args.path, args.content),
    },
    delete_file: {
      description: "Stage deletion of a file (pending approval).",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string" } }, required: ["path"] }),
      execute: async (args: { path: string }) => executor.deleteFile(args.path),
    },
    list_files: {
      description: "List files/dirs at a path.",
      parameters: jsonSchema({
        type: "object",
        properties: { path: { type: "string" }, recursive: { type: "boolean" } },
        required: ["path"],
      }),
      execute: async (args: { path: string; recursive?: boolean }) => executor.listFiles(args.path, args.recursive ?? false),
    },
    search_files: {
      description: "Find files matching a glob pattern.",
      parameters: jsonSchema({
        type: "object",
        properties: { root: { type: "string" }, pattern: { type: "string" }, content_contains: { type: "string" } },
        required: ["root", "pattern"],
      }),
      execute: async (args: { root: string; pattern: string; content_contains?: string }) => executor.searchFiles(args.root, args.pattern, args.content_contains),
    },
    analyze_codebase: {
      description: "Summarize the codebase structure.",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string" } }, required: [] }),
      execute: async (args: { path?: string }) => executor.analyzeCodebase(args.path || "."),
    },
    ...(process.env.FIRECRAWL_API_KEY ? createWebTools(tracker) : {}),
  }
  const ai = new AIProviderManager(buildAIConfig())

  for (const step of selected) {
    console.log(chalk.bold(`\n🔧 ${step.title}\n`))

    const agent = new ToolLoopAgent({
      model: ai.getModel(),
      stopWhen: stepCountIs(10),
      tools,
    } as ConstructorParameters<typeof ToolLoopAgent>[0])

    const r = await agent.generate({ prompt: stepPrompt(plan.goal, step) })
    if (r.text?.trim()) {
      console.log(renderTerminalMarkdown(r.text))
    }
  }

  const ok = await runApprovalFlow(tracker)
  if (!ok) {
    executor.clearStaging()
    return
  }

  await applyAndReport(tracker, executor)
  executor.clearStaging()
}

/**
 * Non-interactive plan execution (for Telegram/API use).
 * Returns the plan structure for further processing.
 */
export async function generatePlanForGoal(goal: string): Promise<{
  plan: Awaited<ReturnType<typeof generatePlan>>
  tracker: ActionTracker
  executor: AgentToolExecutor
}> {
  const plan = await generatePlan(goal)
  const tracker = new ActionTracker()
  const executor = new AgentToolExecutor(tracker)
  return { plan, tracker, executor }
}

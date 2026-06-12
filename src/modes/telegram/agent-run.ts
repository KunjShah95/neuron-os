/**
 * telegram/agent-run — run agent/ask/plan operations from Telegram context.
 * Uses jsonSchema() pattern consistent with engine.ts.
 */

import { ToolLoopAgent, stepCountIs, jsonSchema } from "ai"
import { AIProviderManager, resolveApiKey } from "../../ai"
import type { AIConfig, AIProvider } from "../../ai"
import { ActionTracker } from "../../agent/action-tracker"
import { AgentToolExecutor } from "../../agent/agent-tools"
import { createWebTools } from "../plan/web-tools"
import type { Plan, PlanStep } from "../plan/types"
import { replyMd } from "./text"
import { finishOrApprove } from "./approval-session"

function buildAIConfig(): AIConfig {
  const provider = (process.env.AEGIS_AI_PROVIDER ?? "openai") as AIProvider
  return {
    provider,
    model: process.env.AEGIS_AI_MODEL ?? "gpt-4o",
    apiKey: process.env.AEGIS_AI_API_KEY || resolveApiKey(provider),
    baseUrl: process.env.AEGIS_AI_BASE_URL,
    temperature: 0.7,
  }
}

function agentOptions(maxSteps: number, instructions: string) {
  return {
    model: new AIProviderManager(buildAIConfig()).getModel(),
    stopWhen: stepCountIs(maxSteps),
    instructions,
  }
}

function readOnlyTools(executor: AgentToolExecutor) {
  return {
    read_file: {
      description: "Read a workspace file (relative path).",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string" } }, required: ["path"] }),
      execute: async (args: Record<string, unknown>) => executor.readFile(args.path as string),
    },
    list_files: {
      description: "List files/dirs at a path.",
      parameters: jsonSchema({
        type: "object",
        properties: { path: { type: "string" }, recursive: { type: "boolean" } },
        required: ["path"],
      }),
      execute: async (args: Record<string, unknown>) => executor.listFiles(args.path as string, args.recursive as boolean),
    },
    search_files: {
      description: "Find files matching a glob pattern; optional content filter.",
      parameters: jsonSchema({
        type: "object",
        properties: { root: { type: "string" }, pattern: { type: "string" }, content_contains: { type: "string" } },
        required: ["root", "pattern"],
      }),
      execute: async (args: Record<string, unknown>) => executor.searchFiles(args.root as string, args.pattern as string, args.content_contains as string),
    },
    analyze_codebase: {
      description: "Summarize the codebase structure.",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string" } }, required: [] }),
      execute: async (args: Record<string, unknown>) => executor.analyzeCodebase((args.path as string) || "."),
    },
  }
}

function fileTools(executor: AgentToolExecutor) {
  return {
    read_file: {
      description: "Read a workspace file (relative path).",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string" } }, required: ["path"] }),
      execute: async (args: Record<string, unknown>) => executor.readFile(args.path as string),
    },
    create_file: {
      description: "Stage creation of a new file (not written until approval).",
      parameters: jsonSchema({
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      }),
      execute: async (args: Record<string, unknown>) => executor.createFile(args.path as string, args.content as string),
    },
    modify_file: {
      description: "Stage a full-file replacement for an existing file (pending approval).",
      parameters: jsonSchema({
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string", description: "Complete new file contents" },
        },
        required: ["path", "content"],
      }),
      execute: async (args: Record<string, unknown>) => executor.modifyFile(args.path as string, args.content as string),
    },
    delete_file: {
      description: "Stage deletion of a file (pending approval).",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string" } }, required: ["path"] }),
      execute: async (args: Record<string, unknown>) => executor.deleteFile(args.path as string),
    },
    list_files: {
      description: "List files/dirs at a path.",
      parameters: jsonSchema({
        type: "object",
        properties: { path: { type: "string" }, recursive: { type: "boolean" } },
        required: ["path"],
      }),
      execute: async (args: Record<string, unknown>) => executor.listFiles(args.path as string, args.recursive as boolean),
    },
    search_files: {
      description: "Find files matching a glob pattern; optional content filter.",
      parameters: jsonSchema({
        type: "object",
        properties: { root: { type: "string" }, pattern: { type: "string" }, content_contains: { type: "string" } },
        required: ["root", "pattern"],
      }),
      execute: async (args: Record<string, unknown>) => executor.searchFiles(args.root as string, args.pattern as string, args.content_contains as string),
    },
    analyze_codebase: {
      description: "Summarize the codebase structure.",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string" } }, required: [] }),
      execute: async (args: Record<string, unknown>) => executor.analyzeCodebase((args.path as string) || "."),
    },
  }
}

function extraWebTools(tracker: ActionTracker) {
  return process.env.FIRECRAWL_API_KEY ? createWebTools(tracker) : {}
}

export async function runAsk(ctx: { reply: (t: string, o?: object) => Promise<unknown> }, question: string) {
  const tracker = new ActionTracker()
  const executor = new AgentToolExecutor(tracker, {
    allowFileCreation: false,
    allowFileModification: false,
    allowFolderCreation: false,
    allowShellExecution: false,
  })
  const tools = { ...readOnlyTools(executor), ...extraWebTools(tracker) }
  const agent = new ToolLoopAgent({
    ...agentOptions(20, `Workspace root: ${process.cwd()}. Read-only research mode.`),
    tools,
  } as ConstructorParameters<typeof ToolLoopAgent>[0])
  const { text } = await agent.generate({ prompt: question })
  await replyMd(ctx, text || "(no answer)")
}

export async function runAgent(
  ctx: { reply: (t: string, o?: object) => Promise<unknown> },
  chatId: number,
  goal: string,
) {
  const tracker = new ActionTracker()
  const executor = new AgentToolExecutor(tracker)
  const tools = fileTools(executor)
  const agent = new ToolLoopAgent({
    ...agentOptions(40, `Workspace root: ${process.cwd()}. All mutations are staged until approval.`),
    tools,
  } as ConstructorParameters<typeof ToolLoopAgent>[0])
  const { text } = await agent.generate({ prompt: goal })
  if (text?.trim()) await replyMd(ctx, text.trim())
  await finishOrApprove(ctx, chatId, tracker, executor, "✅ Done. No file changes were needed.")
}

export async function runPlanSteps(
  ctx: { reply: (t: string, o?: object) => Promise<unknown> },
  chatId: number,
  plan: Plan,
  steps: PlanStep[],
) {
  const tracker = new ActionTracker()
  const executor = new AgentToolExecutor(tracker)
  const tools = { ...fileTools(executor), ...extraWebTools(tracker) }
  const ai = new AIProviderManager(buildAIConfig())

  for (const step of steps) {
    await ctx.reply(`🔧 Executing: *${step.title}*`, { parse_mode: "Markdown" })
    const prompt = [`Goal: ${plan.goal}`, `Step: ${step.title}`, step.description].join("\n")
    const agent = new ToolLoopAgent({
      model: ai.getModel(),
      stopWhen: stepCountIs(30),
      tools,
    } as ConstructorParameters<typeof ToolLoopAgent>[0])
    const { text } = await agent.generate({ prompt })
    if (text?.trim()) await replyMd(ctx, text.trim())
  }

  await finishOrApprove(ctx, chatId, tracker, executor, "✅ All steps done. No file changes needed.")
}

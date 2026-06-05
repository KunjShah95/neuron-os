/**
 * plan/planner — structured plan generation with JSON schema extraction.
 * Uses Vercel AI SDK's output middleware for structured plan generation.
 */

import { Output, extractJsonMiddleware, generateText, jsonSchema, wrapLanguageModel, stepCountIs } from "ai"
import { z } from "zod"
import chalk from "chalk"
import { AIProviderManager, resolveApiKey } from "../../ai"
import type { AIConfig } from "../../ai"
import { ActionTracker } from "../../agent/action-tracker"
import { AgentToolExecutor } from "../../agent/agent-tools"
import { createWebTools } from "./web-tools"
import type { Plan, PlanStep } from "./types"

const planSchema = z.object({
  researchSummary: z.string().optional(),
  steps: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        hints: z.array(z.string()).optional(),
        complexity: z.enum(["low", "medium", "high"]).optional(),
      }),
    )
    .min(1)
    .max(15),
})

function buildAIConfig(): AIConfig {
  const provider = (process.env.AEGIS_AI_PROVIDER ?? "openai") as any
  return {
    provider,
    model: process.env.AEGIS_AI_MODEL ?? "gpt-4o",
    apiKey: process.env.AEGIS_AI_API_KEY || resolveApiKey(provider),
    baseUrl: process.env.AEGIS_AI_BASE_URL,
    temperature: 0.5,
  }
}

const PLAN_INSTRUCTIONS = (codebase: string, hasWeb: boolean) =>
  [
    "You are a Plan-Mode planner. You DO NOT modify files.",
    `Workspace: ${codebase}`,
    "Use read-only tools for codebase/skills research.",
    hasWeb
      ? "Web tools are available (web_search/web_crawl/fetch_url). Use only when needed."
      : "Web tools are unavailable (no FIRECRAWL_API_KEY).",
    "Output must match the provided JSON schema.",
    "Keep it short: 1–15 steps.",
  ].join("\n")

export async function generatePlan(goal: string): Promise<Plan> {
  const tracker = new ActionTracker()
  const executor = new AgentToolExecutor(tracker, {
    allowFileCreation: false,
    allowFileModification: false,
    allowFolderCreation: false,
    allowShellExecution: false,
  })
  const hasWeb = !!process.env.FIRECRAWL_API_KEY

  const ai = new AIProviderManager(buildAIConfig())
  const model = wrapLanguageModel({
    model: ai.getModel() as any,
    middleware: extractJsonMiddleware(),
  })

  const tools: Record<string, any> = {
    read_file: {
      description: "Read a text file from the workspace. Use a path relative to the project root.",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string", description: "Relative file path" } }, required: ["path"] }),
      execute: async (args: any) => executor.readFile(args.path),
    },
    list_files: {
      description: "List files and directories under a path.",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string" }, recursive: { type: "boolean" } }, required: ["path"] }),
      execute: async (args: any) => executor.listFiles(args.path, args.recursive),
    },
    search_files: {
      description: 'Find files matching a glob pattern (e.g. "*.ts", "**/*.md"). Optional content substring filter.',
      parameters: jsonSchema({ type: "object", properties: { root: { type: "string", description: "Directory to search" }, pattern: { type: "string", description: "Glob pattern using * and **" }, content_contains: { type: "string" } }, required: ["root", "pattern"] }),
      execute: async (args: any) => executor.searchFiles(args.root, args.pattern, args.content_contains),
    },
    analyze_codebase: {
      description: "Summarize structure: file counts, size, extensions. Read-only.",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string" } }, required: [] }),
      execute: async (args: any) => executor.analyzeCodebase(args.path || "."),
    },
    list_skills: {
      description: "List absolute paths to SKILL.md files under configured skill directories.",
      parameters: jsonSchema({ type: "object", properties: {} }),
      execute: async () => executor.listSkills(),
    },
    read_skill: {
      description: "Read a SKILL.md file. Path must be absolute and under skill roots.",
      parameters: jsonSchema({ type: "object", properties: { path: { type: "string" } }, required: ["path"] }),
      execute: async (args: any) => executor.readSkill(args.path),
    },
    ...(hasWeb ? createWebTools(tracker) : {}),
  }

  console.log(chalk.cyan("\n🔍 Researching & drafting a plan…\n"))

  const result = await generateText({
    model: model as any,
    tools,
    stopWhen: stepCountIs(20),
    system: PLAN_INSTRUCTIONS(process.cwd(), hasWeb),
    prompt: `User goal: \n${goal}`,
    output: Output.object({ schema: planSchema }),
  })

  const validated = planSchema.parse(result.output)
  const steps: PlanStep[] = validated.steps.map((s, i) => ({
    id: `step-${i + 1}`,
    title: s.title,
    description: s.description,
    hints: s.hints,
    complexity: s.complexity,
  }))

  return { goal, researchSummary: validated.researchSummary, steps }
}

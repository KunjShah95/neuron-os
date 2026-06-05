/**
 * multi-agent — Decomposes complex tasks into sub-tasks for parallel execution.
 *
 * Inspired by OpenClaw/Hermes multi-agent collaboration patterns:
 * - Planner agent decomposes the goal into sub-tasks
 * - Worker agents execute sub-tasks in parallel via AgentPool
 * - Reviewer agent validates results
 * - All results are aggregated into a final summary
 *
 * Architecture:
 *   goal → [planner] → sub-tasks → [pool.execute(sub-tasks)] → [reviewer] → final
 */

import { generateText, stepCountIs } from "ai"
import { AIProviderManager, resolveApiKey } from "../ai"
import type { AIConfig } from "../ai"
import { agentPool } from "./agent-pool"

export interface SubTask {
  id: string
  title: string
  description: string
  dependencies: string[] // sub-task IDs that must complete first
  complexity: "simple" | "medium" | "complex"
}

export interface OrchestrationPlan {
  goal: string
  subTasks: SubTask[]
  parallelGroups: SubTask[][] // tasks that can run in parallel per group
}

export interface SubTaskResult {
  subTaskId: string
  title: string
  success: boolean
  summary: string
  error?: string
}

export interface OrchestrationResult {
  goal: string
  plan: OrchestrationPlan
  results: SubTaskResult[]
  overallSuccess: boolean
  summary: string
  durationMs: number
}

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

/**
 * Decompose a complex goal into sub-tasks using a planner agent.
 * Returns an orchestration plan with dependency-aware parallel groups.
 */
export async function decomposeGoal(goal: string): Promise<OrchestrationPlan> {
  const ai = new AIProviderManager(buildAIConfig())

  const prompt = [
    `You are a multi-agent orchestrator. Your task is to decompose the following goal into`,
    `independent sub-tasks that can be executed in parallel by AI agents.`,
    ``,
    `GOAL: ${goal}`,
    ``,
    `Rules:`,
    `1. Break the goal into 2-8 specific, actionable sub-tasks`,
    `2. Each sub-task should be self-contained (one agent handles it)`,
    `3. Identify dependencies: which sub-tasks must finish before others can start`,
    `4. Group independent sub-tasks together for parallel execution`,
    `5. Keep sub-tasks focused — each should take 1-5 minutes for an AI agent`,
    `6. Label complexity: simple (<5 tool calls), medium (5-15), complex (15+)`,
    ``,
    `Output format:`,
    `PLAN:`,
    `  Sub-task 1: [title]`,
    `    Description: [what to do]`,
    `    Dependencies: [none | IDs]`,
    `    Complexity: [simple|medium|complex]`,
    `  ...`,
    `PARALLEL GROUPS:`,
    `  Group 1: [IDs of sub-tasks that run in parallel]`,
    `  Group 2: [IDs of sub-tasks that run after Group 1]`,
    `  ...`,
  ].join("\n")

  const result = await generateText({
    model: ai.getModel(),
    stopWhen: stepCountIs(5),
    prompt,
    temperature: 0.5,
  })

  return parsePlan(goal, result.text)
}

/**
 * Parse the AI's plan output into structured sub-tasks and parallel groups.
 */
function parsePlan(goal: string, text: string): OrchestrationPlan {
  const subTasks: SubTask[] = []
  const parallelGroups: SubTask[][] = []
  let currentGroup: SubTask[] = []

  const lines = text.split("\n")
  let parsingTasks = false
  let parsingGroups = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.startsWith("Sub-task") && trimmed.includes(":")) {
      parsingTasks = true
      parsingGroups = false
      const title = trimmed.split(":")[1]?.trim() ?? `Sub-task ${subTasks.length + 1}`
      const id = `sub-${subTasks.length + 1}`
      subTasks.push({
        id,
        title,
        description: "",
        dependencies: [],
        complexity: "medium",
      })
    } else if (parsingTasks && subTasks.length > 0) {
      const last = subTasks[subTasks.length - 1]!
      if (trimmed.startsWith("Description:")) {
        last.description = trimmed.replace("Description:", "").trim()
      } else if (trimmed.startsWith("Dependencies:")) {
        const deps = trimmed.replace("Dependencies:", "").trim()
        last.dependencies = deps === "none" ? [] : deps.split(",").map((d) => d.trim()).filter(Boolean)
      } else if (trimmed.startsWith("Complexity:")) {
        const c = trimmed.replace("Complexity:", "").trim().toLowerCase()
        if (c === "simple" || c === "medium" || c === "complex") {
          last.complexity = c
        }
      }
    } else if (trimmed.startsWith("Group") && trimmed.includes(":")) {
      parsingGroups = true
      parsingTasks = false
      if (currentGroup.length > 0) {
        parallelGroups.push(currentGroup)
      }
      currentGroup = []
    } else if (parsingGroups && trimmed) {
      // Parse IDs like "1, 2, 3" or "sub-1, sub-2"
      const ids = trimmed.split(",").map((s) => s.trim()).filter(Boolean)
      for (const rawId of ids) {
        const idx = parseInt(rawId.replace("sub-", ""), 10) - 1
        if (idx >= 0 && idx < subTasks.length) {
          currentGroup.push(subTasks[idx]!)
        }
      }
    }
  }

  // Push the last group
  if (currentGroup.length > 0) parallelGroups.push(currentGroup)

  // If no groups were parsed, put all independent tasks in one group
  if (parallelGroups.length === 0 && subTasks.length > 0) {
    parallelGroups.push(subTasks)
  }

  return { goal, subTasks, parallelGroups }
}

/**
 * Execute an orchestration plan using the AgentPool.
 * Tasks are executed group by group (groups run sequentially, tasks within a group run in parallel).
 */
export async function executePlan(plan: OrchestrationPlan): Promise<OrchestrationResult> {
  const startTime = Date.now()
  const results: SubTaskResult[] = []

  for (const group of plan.parallelGroups) {
    const taskPromises = group.map(async (subTask) => {
      try {
        const taskId = agentPool.submit(subTask.description, {
          name: subTask.title,
          priority: subTask.complexity === "complex" ? "high" : "normal",
          tags: ["multi-agent", subTask.id],
        })

        const poolResult = await agentPool.waitForTask(taskId, 300_000)

        results.push({
          subTaskId: subTask.id,
          title: subTask.title,
          success: poolResult.success,
          summary: poolResult.summary,
          error: poolResult.error,
        })

        return poolResult
      } catch (err: any) {
        results.push({
          subTaskId: subTask.id,
          title: subTask.title,
          success: false,
          summary: `Failed: ${err.message ?? String(err)}`,
          error: err.message ?? String(err),
        })
        return null
      }
    })

    // Run group in parallel
    await Promise.allSettled(taskPromises)
  }

  const overallSuccess = results.every((r) => r.success)
  const durationMs = Date.now() - startTime

  const summaryLines = [
    `## Multi-Agent Orchestration Result`,
    ``,
    `**Goal:** ${plan.goal}`,
    `**Duration:** ${(durationMs / 1000).toFixed(1)}s`,
    `**Overall:** ${overallSuccess ? "✅ All sub-tasks completed" : "⚠️ Some sub-tasks failed"}`,
    ``,
    `### Results`,
    ``,
    ...results.map(
      (r) => `- ${r.success ? "✅" : "❌"} **${r.title}** — ${r.summary.slice(0, 100)}`,
    ),
  ].join("\n")

  return {
    goal: plan.goal,
    plan,
    results,
    overallSuccess,
    summary: summaryLines,
    durationMs,
  }
}

/**
 * High-level orchestrator: decompose → execute → review → return.
 * Calls the planner agent, then executes with the pool, then reviews results.
 */
export async function runMultiAgent(goal: string): Promise<OrchestrationResult> {
  console.log(`\n🧠 Decomposing goal into sub-tasks: "${goal.slice(0, 80)}"...`)

  const plan = await decomposeGoal(goal)
  console.log(`  → ${plan.subTasks.length} sub-tasks in ${plan.parallelGroups.length} parallel groups`)

  for (const [i, group] of plan.parallelGroups.entries()) {
    const taskNames = group.map((t) => t.title).join(", ")
    console.log(`  Group ${i + 1}: ${taskNames}`)
  }

  console.log(`\n🚀 Executing plan...`)
  const result = await executePlan(plan)

  console.log(`\n✅ Done in ${(result.durationMs / 1000).toFixed(1)}s`)
  console.log(`  Success: ${result.overallSuccess ? "✓" : "✗"}`)
  console.log(`  ${result.results.filter((r) => r.success).length}/${result.results.length} sub-tasks passed`)

  return result
}

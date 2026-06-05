/**
 * research — Karpathy-style autonomous research agent with safe ratchet mechanism.
 *
 * Implements a "ratchet" loop where an AI agent iterates on a codebase
 * autonomously, keeping only changes that improve a measurable outcome.
 *
 * Uses the shared RatchetRuntime kernel (src/agent/ratchet.ts) for all
 * git operations. Research-specific prompts and the iteration loop live here;
 * stash/measure/revert mechanics are delegated.
 *
 * Inspired by: https://github.com/karpathy/autoresearch
 */

import chalk from "chalk"
import { generateText, stepCountIs } from "ai"
import { AIProviderManager } from "../ai"
import type { AIConfig } from "../ai"
import { AgentToolExecutor } from "../agent/agent-tools"
import { ActionTracker } from "../agent/action-tracker"
import { RatchetRuntime } from "../agent/ratchet"

export interface ResearchConfig {
  goal: string
  successCriteria: string
  maxIterations?: number
  testCommand?: string
  workspacePath?: string
}

export interface ResearchIteration {
  iteration: number
  hypothesis: string
  approach: string
  outcome: "improved" | "degraded" | "neutral" | "error"
  score?: number
  metric?: string
  summary: string
}

/**
 * Run an autonomous research loop with safe git operations.
 *
 * 1. Stashes any user WIP before starting (restored on completion)
 * 2. Agent proposes and implements changes each iteration
 * 3. Changes are measured via RatchetRuntime (typecheck by default, or testCommand)
 * 4. If metric degrades, only the agent's changes are reverted
 * 5. Ratchet: improvements are kept, regressions are discarded
 */
export async function runResearchLoop(
  config: ResearchConfig,
  onProgress?: (msg: string) => void,
): Promise<{
  iterations: ResearchIteration[]
  converged: boolean
  finalSummary: string
}> {
  const maxIter = config.maxIterations ?? 10
  const iterations: ResearchIteration[] = []
  const tracker = new ActionTracker()
  const executor = new AgentToolExecutor(tracker, {
    allowFileCreation: true,
    allowFileModification: true,
    allowShellExecution: true,
  })
  const cwd = config.workspacePath || process.cwd()

  const ratchet = new RatchetRuntime()

  const ai = new AIProviderManager({
    provider: (process.env.AEGIS_AI_PROVIDER ?? "openai") as any,
    model: process.env.AEGIS_AI_MODEL ?? "gpt-4o",
    apiKey: process.env.AEGIS_AI_API_KEY,
    baseUrl: process.env.AEGIS_AI_BASE_URL,
    temperature: 0.8,
  } as AIConfig)

  let converged = false
  let previousScore: number | undefined
  let lastMetricText = ""

  const log = (msg: string) => {
    if (onProgress) onProgress(msg)
    else console.log(chalk.dim(`  ${msg}`))
  }

  // ── Stash user's WIP before starting ───────────────────────────────
  log(chalk.yellow("📦 Stashing any uncommitted user changes for safety..."))
  const hadStash = ratchet.stash(cwd)
  if (hadStash) {
    log(chalk.green("  Stashed. Will restore on completion."))
  } else {
    log(chalk.dim("  No changes to stash or not a git repo."))
  }

  try {
    for (let i = 0; i < maxIter; i++) {
      log(chalk.bold(`\n🧪 Research Iteration ${i + 1}/${maxIter}`))

      // Phase 1: Agent proposes a hypothesis + approach
      const explorationPrompt = [
        `You are an autonomous research agent. You are working on the following goal:`,
        ``,
        `GOAL: ${config.goal}`,
        `SUCCESS CRITERIA: ${config.successCriteria}`,
        ``,
        `You have made ${i} iteration(s) so far.`,
        previousScore !== undefined ? `PREVIOUS SCORE: ${previousScore.toFixed(2)}` : "No previous score recorded.",
        lastMetricText ? `PREVIOUS METRIC: "${lastMetricText}"` : "",
        ``,
        `Your task: Explore the codebase and propose a SINGLE, targeted change to try next.`,
        `Be specific about:`,
        `1. What you hypothesize will improve things`,
        `2. What file(s) you need to modify`,
        `3. What the exact changes should be`,
        `4. How to verify/measure the result`,
        ``,
        `Keep changes small and focused — one hypothesis per iteration.`,
      ].filter(Boolean).join("\n")

      const exploration = await generateText({
        model: ai.getModel(),
        stopWhen: stepCountIs(10),
        prompt: explorationPrompt,
        system: "You are a research scientist iterating on a codebase. Propose precise, testable changes.",
        temperature: 0.8,
      })

      const approach = exploration.text || "(no proposal)"
      log(`Hypothesis: ${approach.slice(0, 200)}...`)

      // Phase 2: Execute the proposed changes
      const execPrompt = [
        `Implement the following change to the codebase:`,
        ``,
        approach,
        ``,
        `Use the available tools to make the changes.`,
        `Read files before modifying them. Stage all changes through the tools.`,
      ].join("\n")

      await generateText({
        model: ai.getModel(),
        stopWhen: stepCountIs(15),
        prompt: execPrompt,
        temperature: 0.3,
      })

      // Phase 3: Apply staged changes and measure
      const pending = tracker.getPendingMutations()

      if (pending.length > 0) {
        tracker.approveAll()
        const { errors } = executor.applyApproved()
        executor.clearStaging()

        if (errors.length > 0) {
          log(`⚠️  Apply errors: ${errors.slice(0, 3).join("; ")}`)
          iterations.push({
            iteration: i + 1,
            hypothesis: approach.slice(0, 200),
            approach: "apply",
            outcome: "error",
            summary: `Errors: ${errors.join("; ")}`,
          })
          continue
        }

        // Phase 4: Measure via RatchetRuntime
        const measure = await ratchet.measure(
          config.testCommand
            ? { cwd, testCommand: config.testCommand }
            : { cwd, criteria: [{ metric: "typecheck" }] },
          previousScore,
        )

        lastMetricText = measure.output
        previousScore = measure.score

        log(`Measure: outcome=${measure.outcome}, score=${measure.score.toFixed(2)}`)

        // Phase 5: RATCHET — if degraded, revert via RatchetRuntime
        if (measure.outcome === "degraded" && measure.filesChanged.length > 0) {
          log(chalk.yellow(`↩️  Metric degraded — reverting ${measure.filesChanged.length} file(s)`))
          ratchet.revertFiles(cwd, measure.filesChanged)
        } else if (measure.outcome === "improved") {
          log(chalk.green(`✅ Iteration ${i + 1} outcome: improved`))
        } else if (measure.outcome === "neutral") {
          log(chalk.dim(`➖ Iteration ${i + 1} outcome: neutral`))
        }

        iterations.push({
          iteration: i + 1,
          hypothesis: approach.slice(0, 200),
          approach: "apply+measure",
          outcome: measure.outcome,
          score: measure.score,
          metric: measure.output.slice(0, 300),
          summary: measure.outcome === "improved"
            ? "Changes improved the metric"
            : measure.outcome === "neutral"
              ? "No measurable change"
              : measure.outcome === "degraded"
                ? "Metric degraded, files reverted"
                : "Evaluator error",
        })
      } else {
        iterations.push({
          iteration: i + 1,
          hypothesis: approach.slice(0, 200),
          approach: "exploration only",
          outcome: "neutral",
          summary: "No changes proposed — agent may have converged",
        })
      }
    }
  } finally {
    // ── Restore user's stashed work ───────────────────────────────
    if (hadStash) {
      log(chalk.yellow("\n📦 Restoring user's stashed changes..."))
      ratchet.restore(cwd)
    }
  }

  converged = iterations.filter((i) => i.outcome === "improved").length > 0

  const summaryLines = [
    `## Research Complete`,
    ``,
    `**Goal:** ${config.goal}`,
    `**Iterations:** ${iterations.length}/${maxIter}`,
    `**Converged:** ${converged ? "✅ Yes" : "❌ No — max iterations reached"}`,
    ``,
    `### Iteration Summary`,
    ``,
    ...iterations.map(
      (it) =>
        `- **Iteration ${it.iteration}:** ${it.outcome === "improved" ? "✅" : it.outcome === "degraded" ? "↩️" : it.outcome === "error" ? "❌" : "➖"} ${it.outcome}${it.score !== undefined ? ` (score ${it.score.toFixed(2)})` : ""} — ${it.summary.slice(0, 120)}`,
    ),
    ``,
    `### Final Metric`,
    ``,
    `\`${lastMetricText || "(no metric recorded)"}\``,
  ].join("\n")

  return {
    iterations,
    converged,
    finalSummary: summaryLines,
  }
}

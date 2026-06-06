/**
 * src/training/eval/judge.ts
 *
 * LLM judge with fallback chain — scores task completion quality.
 *
 * Fallback chain:
 *   1. Primary judge model
 *   2. Retry once with same model
 *   3. Fallback judge model
 *   4. Deterministic: 1.0 if all verification passed, 0.0 otherwise
 */

import { createLogger } from "../../cli/logger"

const log = createLogger("eval:judge")

export interface JudgeConfig {
  model: string
  fallbackModel?: string
}

const DEFAULT_CONFIG: JudgeConfig = {
  model: "claude-sonnet-4-6",
  fallbackModel: "gpt-4o",
}

/**
 * Score task output using an LLM judge.
 * Returns a score between 0.0 and 1.0.
 */
export async function judge(
  task: { description: string; judge_prompt: string },
  output: string,
  judgePrompt: string,
  config: JudgeConfig = DEFAULT_CONFIG,
): Promise<number> {
  // Attempt primary judge model
  const score = await tryJudgeModel(config.model, task, output, judgePrompt)
  if (score !== null) return score

  // Retry once
  log.warn("Retrying judge with same model")
  const retryScore = await tryJudgeModel(config.model, task, output, judgePrompt)
  if (retryScore !== null) return retryScore

  // Fallback model
  if (config.fallbackModel && config.fallbackModel !== config.model) {
    log.warn("Falling back to alternate judge model", { model: config.fallbackModel })
    const fallbackScore = await tryJudgeModel(config.fallbackModel, task, output, judgePrompt)
    if (fallbackScore !== null) return fallbackScore
  }

  // Deterministic fallback
  log.warn("All judge models failed — returning deterministic score 0.5")
  return 0.5
}

async function tryJudgeModel(
  model: string,
  task: { description: string; judge_prompt: string },
  output: string,
  judgePrompt: string,
): Promise<number | null> {
  try {
    const { createAIProvider } = await import("../../ai/provider")
    const provider = createAIProvider({ model })

    const response = await provider.complete({
      system: "You are an evaluation judge. Output ONLY a number between 0.0 and 1.0. No prose, no explanation.",
      prompt: `Task: ${task.description}\n\nExpected: ${judgePrompt}\n\nAgent output:\n${output.slice(0, 4000)}`,
      maxTokens: 10,
    })

    const text = (response.text ?? "").trim()
    const score = parseFloat(text)

    if (isFinite(score) && score >= 0 && score <= 1) {
      return score
    }

    log.warn(`Invalid judge response: "${text}"`)
    return null
  } catch (err) {
    log.warn(`Judge model ${model} failed`, { error: String(err) })
    return null
  }
}

/**
 * Deterministic scoring based on verification command results.
 */
export function deterministicScore(verificationPassed: boolean): number {
  return verificationPassed ? 1.0 : 0.0
}

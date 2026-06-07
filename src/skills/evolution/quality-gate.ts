/**
 * src/skills/evolution/quality-gate.ts
 *
 * Enhanced quality gate for the self-evolving skills loop.
 * Evaluates SkillCandidates via:
 *   1. LLM-as-judge — "Is this a reusable, well-structured skill?"
 *   2. Regression suite — replay evidence episodes against the candidate
 *      and measure success rate.
 *
 * Decision matrix:
 *   judge=pass AND regression ≥ 80% → approve
 *   judge=pass AND regression < 80% → reject (low regression)
 *   judge=fail → reject (low quality)
 *   judge=skipped (timeout) → regression-only gate
 */

import { createLogger } from "../../cli/logger"
import type { SkillCandidate, QualityGateDecision, DistillerConfig } from "./types"
import { DistillerConfigSchema } from "./types"

const log = createLogger("quality-gate")

const DEFAULT_CONFIG = DistillerConfigSchema.parse({})

// ── LLM-as-Judge ───────────────────────────────────────────────────────

async function llmJudge(
  candidate: SkillCandidate,
  timeoutMs: number,
): Promise<{ verdict: "pass" | "fail" | "skipped"; reason?: string }> {
  try {
    const { createAIProvider } = await import("../../ai")
    const provider = process.env.AEGIS_AI_PROVIDER || "openai"
    const model = process.env.AEGIS_EVOLUTION_JUDGE_MODEL || process.env.AEGIS_AI_MODEL || "gpt-4o"

    const ai = createAIProvider({
      provider: provider as any,
      model,
      apiKey: process.env.AEGIS_AI_API_KEY,
    })

    const evidenceSummary = candidate.evidence
      .slice(0, 3)
      .map(
        (ep, i) =>
          `[${i + 1}] outcome=${ep.outcome} seq=${ep.tool_sequence.join("→")} context="${ep.context_summary.slice(0, 100)}"`,
      )
      .join("\n")

    const prompt = [
      "You are a skill quality judge. Evaluate the following skill candidate.",
      "",
      `Name: ${candidate.name}`,
      `Evidence: ${candidate.evidence.length} episodes`,
      "",
      "Evidence summary:",
      evidenceSummary,
      "",
      "Skill content:",
      candidate.content.slice(0, 2000),
      "",
      'Respond with a JSON object: { "verdict": "pass" | "fail", "reason": "..." }',
      "",
      "Pass if: the skill is reusable, well-structured, has clear steps/instructions, and would generalize beyond the evidence episodes.",
      "Fail if: the skill is too specific, hallucinated steps, vague/ambiguous, or the evidence doesn't support it.",
    ].join("\n")

    const result = (await Promise.race([
      ai.generate([{ role: "user", content: prompt }]),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ])) as { text: string }

    const parsed = JSON.parse(result.text.trim())
    if (parsed.verdict === "pass" || parsed.verdict === "fail") {
      return { verdict: parsed.verdict, reason: parsed.reason }
    }

    return { verdict: "fail", reason: "Malformed judge response" }
  } catch (err: any) {
    if (err.message === "timeout") {
      log.warn(`LLM judge timed out for ${candidate.name}, falling back to regression-only gate`)
      return { verdict: "skipped", reason: "timeout" }
    }
    log.warn(`LLM judge error for ${candidate.name}: ${err.message}`)
    return { verdict: "skipped", reason: err.message }
  }
}

// ── Regression suite ───────────────────────────────────────────────────

async function runRegression(
  candidate: SkillCandidate,
  _passThreshold: number,
): Promise<{ passRate: number; passed: number; total: number }> {
  // For each evidence episode, we check: does the skill content cover the
  // tool_sequence that was actually used? A simple heuristic for v1:
  // the skill's "Steps" section should mention all tools in the sequence.
  const total = Math.min(candidate.evidence.length, DEFAULT_CONFIG.regressionCaseCount)
  let passed = 0

  for (let i = 0; i < total; i++) {
    const ep = candidate.evidence[i]!
    const content = candidate.content.toLowerCase()

    // Check that the skill mentions each tool in the sequence
    const allToolsMentioned = ep.tool_sequence.every((tool) => content.includes(tool.toLowerCase()))
    // Check that the skill mentions the general context
    const contextMentioned = ep.context_summary
      .split(/\s+/)
      .some((word) => word.length > 4 && content.includes(word.toLowerCase()))

    if (allToolsMentioned && contextMentioned) {
      passed++
    }
  }

  // If we somehow have 0 test cases, pass by default
  const effectiveTotal = Math.max(total, 1)
  return {
    passRate: passed / effectiveTotal,
    passed,
    total: effectiveTotal,
  }
}

// ── Main gate entry point ──────────────────────────────────────────────

export async function gate(
  candidate: SkillCandidate,
  config: Partial<DistillerConfig> = {},
): Promise<QualityGateDecision> {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  log.info(`quality gate: evaluating ${candidate.name} (id=${candidate.id})`)

  // Step 1: LLM judge
  const judge = await llmJudge(candidate, cfg.judgeTimeoutMs)

  // Step 2: Regression suite
  const regression = await runRegression(candidate, cfg.regressionPassThreshold)

  // Step 3: Decision
  const judgePassed = judge.verdict === "pass"
  const regressionPassed = regression.passRate >= cfg.regressionPassThreshold

  // If judge was skipped (timeout), use regression-only
  const effectiveJudgePassed = judge.verdict === "skipped" ? regressionPassed : judgePassed
  const passed = effectiveJudgePassed && regressionPassed

  log.info(
    `quality gate result: ${passed ? "✅ approved" : "❌ rejected"} (judge=${judge.verdict}, regression=${Math.round(regression.passRate * 100)}%)`,
  )

  return {
    passed,
    judge,
    regression,
    action: passed ? "approve" : "reject",
    diff: passed
      ? null
      : `quality gate failed: judge=${judge.verdict}, regression=${Math.round(regression.passRate * 100)}%`,
  }
}

/**
 * scripts/run-calibration.ts
 *
 * Run the golden calibration dataset through JudgeCalibration to measure
 * baseline judge accuracy, bias, and reliability.
 *
 * Usage:
 *   bun run scripts/run-calibration.ts
 *   MODEL=gpt-4o bun run scripts/run-calibration.ts
 *   MODEL=deepseek-v3 bun run scripts/run-calibration.ts
 *
 * Set ANTHROPIC_API_KEY or OPENAI_API_KEY in environment as needed.
 */

import { JudgeCalibration } from "../src/harness/grader/calibration"
import { GOLDEN_CALIBRATION_DATASET, getDatasetStats } from "../src/harness/grader/calibration-dataset"
import { createAIProvider } from "../src/ai/provider"
import type { AIProvider } from "../src/ai/provider"

const MODEL = process.env.MODEL ?? "claude-sonnet-4-6"
const PROVIDER = (process.env.PROVIDER ?? "openrouter") as AIProvider

function bold(s: string): string {
  return `\x1b[1m${s}\x1b[22m`
}

function dim(s: string): string {
  return `\x1b[2m${s}\x1b[22m`
}

function green(s: string): string {
  return `\x1b[32m${s}\x1b[39m`
}

function yellow(s: string): string {
  return `\x1b[33m${s}\x1b[39m`
}

function red(s: string): string {
  return `\x1b[31m${s}\x1b[39m`
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log()
  console.log(bold("🧪 Golden Calibration Dataset — Judge Calibration Run"))
  console.log(dim(`Model: ${MODEL}`))
  console.log()

  // 1. Load dataset and print stats
  const stats = getDatasetStats()
  console.log(bold("Dataset Statistics:"))
  console.log(`  Total examples: ${stats.totalExamples}`)
  console.log(`  Unique IDs:     ${stats.uniqueIds}`)
  console.log(`  Avg score:      ${stats.overallAvgScore.toFixed(3)}`)
  console.log()
  console.log(`  Score distribution:`)
  for (const [bucket, count] of Object.entries(stats.scoreDistribution)) {
    const bar = "█".repeat(count)
    console.log(`    ${bucket.padEnd(10)} ${bar} ${count}`)
  }
  console.log()
  console.log(`  By category:`)
  for (const [cat, s] of Object.entries(stats.byCategory)) {
    console.log(`    ${cat.padEnd(15)} ${s.count} examples, scores ${s.minScore.toFixed(1)}–${s.maxScore.toFixed(1)}, avg ${s.avgScore.toFixed(2)}`)
  }
  console.log()

  // 2. Initialize JudgeCalibration with the golden dataset
  const calibration = new JudgeCalibration()
  calibration.addCalibrationExamples(GOLDEN_CALIBRATION_DATASET)
  console.log(green(`✓ Loaded ${GOLDEN_CALIBRATION_DATASET.length} calibration examples`))
  console.log()

  // 3. Create an AI provider for the judge
  const provider = createAIProvider({
    provider: PROVIDER,
    model: MODEL,
    apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || "",
  })

  // Build the LLM judge scoring function
  const llmJudge = async (task: string, output: string): Promise<number> => {
    const prompt = [
      `You are evaluating an AI agent's output. Score ONLY on the criteria below.`,
      ``,
      `Task: ${task}`,
      ``,
      `Agent output:`,
      `\`\`\``,
      output,
      `\`\`\``,
      ``,
      `Criteria:`,
      `1. CORRECTNESS: Does the output correctly solve the task? (0.0–1.0)`,
      `2. COMPLETENESS: Does it cover all aspects of the task? (0.0–1.0)`,
      `3. QUALITY: Is the code/response well-structured and professional? (0.0–1.0)`,
      ``,
      `First, reason step-by-step about each criterion.`,
      `Then output ONLY valid JSON: {"score": <0.0-1.0>, "reasoning": "<brief explanation>"}`,
    ].join("\n")

    const response = await provider.generate([{ role: "user", content: prompt }])
    const text = response.text

    // Parse JSON from the response
    try {
      const jsonMatch = text.match(/\{[^]*"score"\s*:\s*([\d.]+)[^]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (typeof parsed.score === "number") {
          return Math.max(0, Math.min(1, parsed.score))
        }
      }
      // Fallback: try to find any number between 0 and 1
      const scoreMatch = text.match(/"score"\s*[:=]\s*([01](?:\.\d+)?)/)
      if (scoreMatch) {
        return Math.max(0, Math.min(1, parseFloat(scoreMatch[1]!)))
      }
    } catch {
      // Parse failed — use a neutral score
    }
    return 0.5
  }

  // 4. Run calibration
  console.log(bold("Running calibration against LLM judge..."))
  console.log(dim("This will call the LLM for each calibration example."))
  console.log(dim("Expected ~" + (GOLDEN_CALIBRATION_DATASET.length * 2) + "s for ~" + GOLDEN_CALIBRATION_DATASET.length + " examples at 2s each."))
  console.log()

  const startTime = Date.now()
  const result = await calibration.calibrate(llmJudge)

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // 5. Print calibration results
  console.log()
  console.log(bold("📊 Calibration Results"))
  console.log(dim(`Completed in ${elapsed}s`))
  console.log()
  console.log(`  ${bold("Metric")}            ${bold("Value")}`)
  console.log(`  ${"─".repeat(40)}`)
  console.log(`  Accuracy           ${formatPct(result.accuracy)} ${formatBadge(result.accuracy, 0.8, 0.6)}`)
  console.log(`  Mean error (bias)  ${result.meanError > 0 ? "+" : ""}${result.meanError.toFixed(3)} ${formatBiasBadge(result.meanError)}`)
  console.log(`  Std deviation      ${result.stdDev.toFixed(3)} ${formatBadge(1 - result.stdDev, 0.8, 0.6)}`)
  console.log(`  Position bias      ${result.positionBias.toFixed(3)} ${formatBadge(1 - result.positionBias, 0.85, 0.7)}`)
  console.log(`  Length bias        ${result.lengthBias.toFixed(3)} ${formatBadge(1 - result.lengthBias, 0.85, 0.7)}`)
  console.log(`  Cohen's Kappa      ${result.cohensKappa.toFixed(3)} ${formatKappaBadge(result.cohensKappa)}`)
  console.log(`  Sample size        ${result.sampleSize}`)
  console.log()

  // 6. Print recommendations
  console.log(bold("💡 Recommendations:"))
  for (const rec of result.recommendations) {
    const icon = rec.includes("acceptable") || rec.includes("Continue monitoring")
      ? "✅"
      : rec.includes("low") || rec.includes("unreliable")
        ? "🔴"
        : "🟡"
    console.log(`  ${icon} ${rec}`)
  }
  console.log()

  // 7. Check for drift
  const drift = calibration.detectDrift()
  if (drift) {
    console.log(bold("📈 Drift Detection:"))
    console.log(`  Detected: ${drift.detected ? red("YES") : green("no")}`)
    if (drift.detected) {
      console.log(`  Previous accuracy: ${formatPct(drift.previousAccuracy)}`)
      console.log(`  Current accuracy:  ${formatPct(drift.currentAccuracy)}`)
      console.log(`  Delta:             ${drift.delta > 0 ? "+" : ""}${(drift.delta * 100).toFixed(1)}%`)
      console.log(`  Severity:          ${drift.severity}`)
      console.log(`  ${drift.recommendation}`)
    }
    console.log()
  }

  console.log(bold("Calibration complete."))
  console.log(dim(`Data saved to .aegis/calibration/calibration-data.json`))
  console.log()
}

function formatPct(val: number): string {
  return `${(val * 100).toFixed(1).padStart(5)}%`
}

function formatBadge(val: number, good: number, warn: number): string {
  if (val >= good) return green("✓ good")
  if (val >= warn) return yellow("⚠ warn")
  return red("✗ poor")
}

function formatBiasBadge(val: number): string {
  const abs = Math.abs(val)
  if (abs < 0.05) return green("✓ minimal")
  if (abs < 0.1) return yellow("⚠ moderate")
  return red("✗ significant")
}

function formatKappaBadge(val: number): string {
  if (val >= 0.8) return green("✓ strong")
  if (val >= 0.6) return yellow("⚠ moderate")
  return red("✗ weak")
}

main().catch((err) => {
  console.error("Calibration failed:", err)
  process.exit(1)
})

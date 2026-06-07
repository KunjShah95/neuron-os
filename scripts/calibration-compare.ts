/**
 * scripts/calibration-compare.ts
 *
 * Run the golden calibration dataset against multiple LLM models and
 * compare accuracy, bias, and inter-rater reliability side-by-side.
 *
 * Usage:
 *   bun run scripts/calibration-compare.ts
 *
 * Options:
 *   MODELS=openai:gpt-4o:GPT-4o,deepseek:deepseek-chat:DeepSeek
 *                    Comma-separated list of provider:model:label
 *   SKIP=gpt-4o      Skip specific models (comma-separated labels or model IDs)
 *   LIMIT=5          Run only N calibration examples (default: all 40)
 *   PARALLEL=true    Run all models concurrently (default: sequential)
 *
 * Requires at least one API key:
 *   OpenAI:      OPENAI_API_KEY
 *   DeepSeek:    DEEPSEEK_API_KEY
 *   Gemini:      GOOGLE_GENERATIVE_AI_API_KEY
 *   Groq:        GROQ_API_KEY
 *   OpenRouter:  OPENROUTER_API_KEY
 *   Anthropic:   ANTHROPIC_API_KEY
 *   Mistral:     MISTRAL_API_KEY
 *   Ollama:      (local — no API key needed, set OLLAMA_API_KEY=dummy)
 *   xAI:         XAI_API_KEY
 *   Cohere:      COHERE_API_KEY
 *   Perplexity:  PERPLEXITY_API_KEY
 *
 * Run time: ~40 LLM calls per model (2-5s each) ≈ 2-8 min per model (longer on local CPU/Ollama)
 */

import { JudgeCalibration } from "../src/harness/grader/calibration"
import { GOLDEN_CALIBRATION_DATASET, getDatasetStats } from "../src/harness/grader/calibration-dataset"
import type { CalibrationExample, CalibrationResult } from "../src/harness/grader/types"
import { createAIProvider } from "../src/ai/provider"
import type { AIProvider } from "../src/ai/provider"

// ── Model definitions ────────────────────────────────────────────

interface ModelDef {
  provider: AIProvider
  model: string
  label: string
  envKey: string
}

const DEFAULT_MODELS: ModelDef[] = [
  { provider: "openai",   model: "gpt-4o",               label: "GPT-4o",          envKey: "OPENAI_API_KEY" },
  { provider: "deepseek", model: "deepseek-chat",        label: "DeepSeek Chat",   envKey: "DEEPSEEK_API_KEY" },
  { provider: "gemini",   model: "gemini-2.0-flash",     label: "Gemini 2.0 Flash", envKey: "GOOGLE_GENERATIVE_AI_API_KEY" },
  { provider: "groq",     model: "llama-3.3-70b-versatile", label: "Groq Llama3.3 70B", envKey: "GROQ_API_KEY" },
  { provider: "ollama",   model: "llama3.2",             label: "Ollama Llama3.2",  envKey: "OLLAMA_API_KEY" },
  { provider: "ollama",   model: "qwen2.5-coder:7b",     label: "Ollama Qwen2.5 Coder 7B", envKey: "OLLAMA_API_KEY" },
]

// ── Terminal helpers ─────────────────────────────────────────────

const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"
const CYAN = "\x1b[36m"
const RESET = "\x1b[0m"

function bold(s: string): string { return `${BOLD}${s}${RESET}` }
function dim(s: string): string { return `${DIM}${s}${RESET}` }
function green(s: string): string { return `${GREEN}${s}${RESET}` }
function yellow(s: string): string { return `${YELLOW}${s}${RESET}` }
function red(s: string): string { return `${RED}${s}${RESET}` }
function cyan(s: string): string { return `${CYAN}${s}${RESET}` }

function formatPct(v: number): string { return `${(v * 100).toFixed(1)}%` }

function accuracyBadge(v: number): string {
  if (v >= 0.8) return green(`${formatPct(v)}`)
  if (v >= 0.6) return yellow(`${formatPct(v)}`)
  return red(`${formatPct(v)}`)
}

function biasBadge(v: number): string {
  const a = Math.abs(v)
  if (a < 0.05) return `${v > 0 ? "+" : ""}${v.toFixed(3)} ${green("✓")}`
  if (a < 0.10) return `${v > 0 ? "+" : ""}${v.toFixed(3)} ${yellow("⚠")}`
  return `${v > 0 ? "+" : ""}${v.toFixed(3)} ${red("✗")}`
}

function kappaBadge(v: number): string {
  if (v >= 0.8) return `${v.toFixed(3)} ${green("✓ strong")}`
  if (v >= 0.6) return `${v.toFixed(3)} ${yellow("⚠ moderate")}`
  return `${v.toFixed(3)} ${red("✗ weak")}`
}

function stdBadge(v: number): string {
  if (v < 0.10) return `${v.toFixed(3)} ${green("✓")}`
  if (v < 0.18) return `${v.toFixed(3)} ${yellow("⚠")}`
  return `${v.toFixed(3)} ${red("✗")}`
}

function posBiasBadge(v: number): string {
  if (v < 0.08) return `${v.toFixed(3)} ${green("✓")}`
  if (v < 0.15) return `${v.toFixed(3)} ${yellow("⚠")}`
  return `${v.toFixed(3)} ${red("✗")}`
}

function lenBiasBadge(v: number): string {
  if (v < 0.08) return `${v.toFixed(3)} ${green("✓")}`
  if (v < 0.15) return `${v.toFixed(3)} ${yellow("⚠")}`
  return `${v.toFixed(3)} ${red("✗")}`
}

// ── Judge function factory ──────────────────────────────────────

function createJudge(
  provider: ReturnType<typeof createAIProvider>,
): (task: string, output: string) => Promise<number> {
  return async (task: string, output: string): Promise<number> => {
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

    try {
      const jsonMatch = text.match(/\{[^]*"score"\s*:\s*([\d.]+)[^]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (typeof parsed.score === "number") {
          return Math.max(0, Math.min(1, parsed.score))
        }
      }
      const scoreMatch = text.match(/"score"\s*[:=]\s*([01](?:\.\d+)?)/)
      if (scoreMatch) {
        return Math.max(0, Math.min(1, parseFloat(scoreMatch[1]!)))
      }
    } catch {
      // fall through
    }
    return 0.5
  }
}

// ── Per-model result tracking ────────────────────────────────────

interface ModelResult {
  def: ModelDef
  result: CalibrationResult | null
  elapsed: number
  error: string | null
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  // 1. Parse models
  const models = parseModels()
  if (models.length === 0) {
    console.error(`${red("✗")} No models to compare. Check MODELS env var.`)
    process.exit(1)
  }

  // 2. Parse limit
  const limit = parseLimit()
  const examples = limit ? GOLDEN_CALIBRATION_DATASET.slice(0, limit) : GOLDEN_CALIBRATION_DATASET

  // 3. Print header
  console.log()
  console.log(bold("🧪 Multi-Model Calibration Comparison"))
  const exampleCount = examples.length
  console.log(dim(`Comparing ${models.length} models across ${exampleCount} calibration example(s)`))
  if (limit) console.log(dim(`  (limited to ${limit} examples via LIMIT=${limit})`))
  console.log()

  // 4. Print dataset stats
  const ds = getDatasetStats()
  console.log(bold("Dataset:"))
  console.log(`  Examples:  ${exampleCount}${limit ? ` / ${ds.totalExamples} total` : ""}  |  Categories: ${Object.keys(ds.byCategory).length}  |  Avg score: ${ds.overallAvgScore.toFixed(2)}`)
  console.log()

  // 4. Run calibration per model
  const results: ModelResult[] = []
  const parallel = process.env.PARALLEL === "true"

  if (parallel) {
    console.log(bold(`Running all models in parallel...`))
    console.log()

    const tasks = models.map(async (def): Promise<ModelResult> => {
      process.stdout.write(`${dim("  Queued:")} ${def.label}...\n`)
      return runModel(def, examples)
    })

    const settled = await Promise.allSettled(tasks)
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value)
      else results.push({ def: models[results.length]!, result: null, elapsed: 0, error: s.reason?.toString() ?? "Unknown error" })
    }
  } else {
    for (let i = 0; i < models.length; i++) {
      const def = models[i]!
      console.log()
      console.log(bold(`═══ [${i + 1}/${models.length}] ${def.label} (${def.model}) ═══`))
      console.log()

      const mr = await runModel(def, examples)
      results.push(mr)

      if (mr.error) {
        console.log(`  ${red("✗")} ${mr.error}`)
      } else if (mr.result) {
        printModelSummary(mr)
      }
    }
  }

  // 5. Print comparison table
  console.log()
  console.log(bold("📊 Calibration Comparison"))
  console.log()
  printComparisonTable(results)

  // 6. Determine and print winner
  printWinner(results)

  console.log()
  console.log(dim("Comparison complete."))
  console.log()
}

// ── Run a single model ──────────────────────────────────────────

async function runModel(def: ModelDef, examples: CalibrationExample[]): Promise<ModelResult> {
  // Check API key (skip for local providers like Ollama)
  const localProviders: Set<string> = new Set(["ollama"])
  const apiKey = process.env[def.envKey]
  if (!apiKey && !localProviders.has(def.provider)) {
    return { def, result: null, elapsed: 0, error: `Missing ${def.envKey} — skipped` }
  }

  try {
    const provider = createAIProvider({
      provider: def.provider,
      model: def.model,
      apiKey,
    })

    const calibration = new JudgeCalibration()
    calibration.addCalibrationExamples(examples)

    const judge = createJudge(provider)
    const start = Date.now()
    const result = await calibration.calibrate(judge)
    const elapsed = (Date.now() - start) / 1000

    // Save per-model snapshot
    console.log(`  ${green("✓")} ${def.label}: ${formatPct(result.accuracy)} accuracy, κ=${result.cohensKappa.toFixed(3)}, ${formatTime(elapsed)}`)

    return { def, result, elapsed, error: null }
  } catch (err) {
    return { def, result: null, elapsed: 0, error: String(err) }
  }
}

// ── Print per-model summary (sequential mode) ───────────────────

function printModelSummary(mr: ModelResult): void {
  const r = mr.result!
  console.log(`  ${bold("Metric")}               ${bold("Value")}`)
  console.log(`  ${"─".repeat(45)}`)
  console.log(`  Accuracy            ${accuracyBadge(r.accuracy)}`)
  console.log(`  Mean error (bias)   ${biasBadge(r.meanError)}`)
  console.log(`  Std deviation       ${stdBadge(r.stdDev)}`)
  console.log(`  Position bias       ${posBiasBadge(r.positionBias)}`)
  console.log(`  Length bias         ${lenBiasBadge(r.lengthBias)}`)
  console.log(`  Cohen's Kappa       ${kappaBadge(r.cohensKappa)}`)
  console.log(`  Sample size         ${r.sampleSize}`)
  console.log(`  Time                ${formatTime(mr.elapsed)}`)
}

// ── Comparison table ───────────────────────────────────────────

function printComparisonTable(results: ModelResult[]): void {
  const valid = results.filter(
    (r): r is ModelResult & { result: CalibrationResult } => r.result !== null,
  )
  if (valid.length === 0) {
    console.log(`  ${yellow("No models completed successfully.")}`)
    return
  }

  // Column widths
  const labelCol = 22
  const colWidth = 14
  const sep = "  "

  // Header
  console.log(`  ${bold("Metric".padEnd(labelCol))}${valid.map((r) => bold(r.def.label.padEnd(colWidth))).join(sep)}`)
  console.log(`  ${dim("─".repeat(labelCol + valid.length * (colWidth + sep.length)))}`)

  // Rows — fmt takes result and index (for the Time row)
  const rows: Array<{ label: string; fmt: (r: CalibrationResult, idx: number) => string }> = [
    { label: "Accuracy",          fmt: (r, _i) => accuracyBadge(r.accuracy).padEnd(colWidth) },
    { label: "Bias (mean error)", fmt: (r, _i) => biasBadge(r.meanError).padEnd(colWidth) },
    { label: "Std deviation",     fmt: (r, _i) => stdBadge(r.stdDev).padEnd(colWidth) },
    { label: "Position bias",     fmt: (r, _i) => posBiasBadge(r.positionBias).padEnd(colWidth) },
    { label: "Length bias",       fmt: (r, _i) => lenBiasBadge(r.lengthBias).padEnd(colWidth) },
    { label: "Cohen's Kappa",     fmt: (r, _i) => kappaBadge(r.cohensKappa).padEnd(colWidth) },
    { label: "Sample size",       fmt: (r, _i) => String(r.sampleSize).padEnd(colWidth) },
    { label: "Time",              fmt: (_r, idx) => formatTime(valid[idx]?.elapsed ?? 0).padEnd(colWidth) },
  ]

  for (const row of rows) {
    const values = valid.map((r, idx) => row.fmt(r.result, idx))
    console.log(`  ${dim(row.label.padEnd(labelCol))}${values.join(sep)}`)
  }

  // Skipped models
  const skipped = results.filter((r) => r.error !== null)
  if (skipped.length > 0) {
    console.log()
    console.log(`  ${yellow("Skipped:")}`)
    for (const s of skipped) {
      console.log(`    ${dim(s.def.label.padEnd(labelCol))}${yellow(s.error!)}`)
    }
  }
}

// ── Winner determination ─────────────────────────────────────────

function printWinner(results: ModelResult[]): void {
  const valid = results.filter(
    (r): r is ModelResult & { result: CalibrationResult } => r.result !== null,
  )

  if (valid.length === 0) {
    console.log(`\n  ${yellow("⚠ No models completed — nothing to compare.")}`)
    return
  }

  if (valid.length === 1) {
    console.log(`\n  ${cyan("ℹ Only one model completed. Add more models for comparison.")}`)
    return
  }

  // Score each model: accuracy (40%) + kappa (30%) + -bias (15%) + -stddev (15%)
  function compositeScore(r: CalibrationResult): number {
    const accScore = r.accuracy * 0.40
    const kappaScore = Math.max(0, r.cohensKappa) * 0.30
    const biasScore = Math.max(0, 1 - Math.abs(r.meanError)) * 0.15
    const stdScore = Math.max(0, 1 - r.stdDev) * 0.15
    return accScore + kappaScore + biasScore + stdScore
  }

  const scored = valid.map((modelResult) => ({
    label: modelResult.def.label,
    score: compositeScore(modelResult.result),
    modelResult,
  }))
  scored.sort((a, b) => b.score - a.score)

  const winner = scored[0]!
  const runnerUp = scored[1]

  console.log()
  console.log(bold(`🏆 Winner: ${winner.label}`))
  console.log(`  Composite score: ${(winner.score * 100).toFixed(1)}%`)
  console.log(`  Accuracy:        ${formatPct(winner.modelResult.result.accuracy)}`)
  console.log(`  Cohen's Kappa:   ${winner.modelResult.result.cohensKappa.toFixed(3)}`)

  if (runnerUp) {
    const delta = ((winner.score - runnerUp.score) * 100).toFixed(1)
    console.log(`  vs ${runnerUp.label}: ${green(`+${delta}%`)} composite`)
  }

  // Rankings
  console.log()
  console.log(bold("Rankings:"))
  for (let i = 0; i < scored.length; i++) {
    const s = scored[i]!
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  "
    console.log(`  ${medal} ${s.label.padEnd(16)} ${(s.score * 100).toFixed(1)}%  (acc: ${formatPct(s.modelResult.result.accuracy)}, κ: ${s.modelResult.result.cohensKappa.toFixed(3)})`)
  }

  // Winner recommendations
  console.log()
  const wr = winner.modelResult.result
  if (wr.recommendations.length > 0 && wr.recommendations[0] !== "Judge performance is within acceptable range. Continue monitoring.") {
    console.log(bold("Action items for winner:"))
    for (const rec of wr.recommendations) {
      console.log(`  • ${rec}`)
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function parseLimit(): number | null {
  const raw = process.env.LIMIT
  if (!raw) return null
  const n = parseInt(raw, 10)
  if (isNaN(n) || n < 1) return null
  return Math.min(n, GOLDEN_CALIBRATION_DATASET.length)
}

function parseModels(): ModelDef[] {
  const raw = process.env.MODELS
  if (raw) {
    return raw.split(",").map((entry) => {
      const trimmed = entry.trim()
      // Format: provider:model:label  (model may contain colons for OpenRouter)
      const firstColon = trimmed.indexOf(":")
      const lastColon = trimmed.lastIndexOf(":")
      if (firstColon === -1) {
        return { provider: trimmed as AIProvider, model: "", label: trimmed, envKey: "" }
      }
      const provider = trimmed.slice(0, firstColon) as AIProvider
      const label = trimmed.slice(lastColon + 1)
      const model = trimmed.slice(firstColon + 1, lastColon)
      const envMap: Record<string, string> = {
        openai: "OPENAI_API_KEY",
        deepseek: "DEEPSEEK_API_KEY",
        gemini: "GOOGLE_GENERATIVE_AI_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
        groq: "GROQ_API_KEY",
        mistral: "MISTRAL_API_KEY",
        ollama: "OLLAMA_API_KEY",
        openrouter: "OPENROUTER_API_KEY",
        xai: "XAI_API_KEY",
        cohere: "COHERE_API_KEY",
        perplexity: "PERPLEXITY_API_KEY",
      }
      return { provider, model, label, envKey: envMap[provider] ?? `${provider.toUpperCase()}_API_KEY` }
    })
  }

  // Apply SKIP env var
  const skip = new Set(
    (process.env.SKIP ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  )

  return DEFAULT_MODELS.filter(
    (m) => !skip.has(m.label.toLowerCase()) && !skip.has(m.model.toLowerCase()),
  )
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(0)
  return `${m}m ${s}s`
}

// ── Run ─────────────────────────────────────────────────────────

main().catch((err) => {
  console.error(`\n${red("Comparison failed:")} ${err}`)
  process.exit(1)
})

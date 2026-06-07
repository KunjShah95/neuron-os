/**
 * src/cli/commands/improve-validate.ts
 *
 * aegis improve validate — Validate skill candidates against the eval harness.
 * aegis improve validate stats  — Show validation history and stats.
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerImproveValidate(program: Command) {
  const improve =
    program.commands.find((c) => c.name() === "improve") ??
    program.command("improve").description("Self-improving agents")

  const validate = improve
    .command("validate")
    .description("Validate skill candidates against the eval harness before publishing")

  validate
    .command("run [candidateId]")
    .description("Validate one or all skill candidates against the eval harness")
    .option("--all", "Validate all candidates (default: validates all)")
    .option("--min-score <n>", "Minimum composite score to pass", "0.7")
    .option("--dry-run", "Show what would be validated without running")
    .action(handleValidateRun)

  validate
    .command("list")
    .description("List validation history")
    .option("--limit <n>", "Number of recent entries to show", "10")
    .action(handleValidateList)

  validate.command("stats").description("Show validation statistics").action(handleValidateStats)
}

// ── Handlers ──────────────────────────────────────────────────────

async function handleValidateRun(
  candidateId: string | undefined,
  opts: {
    all?: boolean
    minScore?: string
    dryRun?: boolean
  },
) {
  showBanner()
  const { SkillExtractor } = await import("../../improve/skill-extractor")
  const { EvalValidator } = await import("../../improve/eval-validator")

  const extractor = new SkillExtractor()
  const validator = new EvalValidator({
    minPassScore: parseFloat(opts.minScore ?? "0.7") || 0.7,
  })

  const candidates = extractor.getCandidates("candidate")
  const target = candidateId ? candidates.filter((c) => c.id === candidateId || c.name === candidateId) : candidates

  if (target.length === 0) {
    console.log(theme.warn(`\n  No skill candidates found${candidateId ? ` matching "${candidateId}"` : ""}.\n`))
    return
  }

  if (opts.dryRun) {
    console.log(theme.heading(`\n  🔍 Dry Run: ${target.length} candidate(s) to validate\n`))
    for (const c of target) {
      console.log(`  ${theme.bold(c.name)}  (${c.id})`)
      console.log(`     Confidence: ${(c.confidence * 100).toFixed(0)}%  Sources: ${c.derivedFrom.length}`)
      console.log(`     Description: ${theme.dim(c.description.slice(0, 80))}`)
      console.log()
    }
    return
  }

  console.log(theme.heading(`\n  🧪 Validating ${target.length} skill candidate(s) against eval harness\n`))

  const result = await validator.batchValidate(target)

  console.log()
  console.log(
    `  ${theme.bold("Results:")}  ${theme.success(`${result.passed} passed`)}  ${theme.error(`${result.failed} failed`)}  ${theme.dim(`${result.total} total`)}`,
  )
  console.log(`  Avg score:  ${(result.summary.avgScore * 100).toFixed(1)}%`)
  console.log(`  Avg time:   ${result.summary.avgDurationMs.toFixed(0)}ms per candidate`)
  console.log()

  for (const r of result.results) {
    const icon = r.passed ? theme.success("✓") : theme.error("✗")
    const score = (r.compositeScore * 100).toFixed(0)
    const scoreLabel = r.passed ? theme.success(score) : theme.error(score)
    const recommendation =
      r.recommendation === "publish"
        ? theme.success("publish")
        : r.recommendation === "review"
          ? theme.warn("review")
          : theme.error("reject")

    console.log(`  ${icon} ${r.candidate.name.padEnd(32)} ${scoreLabel}%  ${recommendation}`)
    if (r.categoryFailures.length > 0) {
      console.log(`     ${theme.error(`Failing: ${r.categoryFailures.join(", ")}`)}`)
    }
    console.log(`     ${theme.dim(r.reason.slice(0, 90))}`)
    console.log()
  }

  if (result.summary.topCandidates.length > 0) {
    console.log(theme.heading("  🏆 Top Candidates\n"))
    for (const t of result.summary.topCandidates) {
      console.log(`  ${theme.success("✓")} ${t.candidate.name}  ${(t.compositeScore * 100).toFixed(1)}%`)
    }
    console.log()
  }
}

async function handleValidateList(_opts: { limit?: string }) {
  showBanner()
  const { EvalValidator } = await import("../../improve/eval-validator")
  const validator = new EvalValidator()
  const stats = validator.getStats()

  console.log(theme.heading(`\n  📋 Validation History\n`))
  console.log(`  Total validated:  ${theme.bold(String(stats.totalValidated))}`)
  console.log(`  Pass rate:        ${(stats.passRate * 100).toFixed(0)}%`)
  console.log(`  Avg score:        ${(stats.avgScore * 100).toFixed(1)}%`)
  console.log()
}

async function handleValidateStats() {
  showBanner()
  const { EvalValidator } = await import("../../improve/eval-validator")
  const validator = new EvalValidator()
  const stats = validator.getStats()

  console.log(theme.heading("\n  📊 Validation Statistics\n"))
  console.log(`  Candidates validated:  ${theme.bold(String(stats.totalValidated))}`)
  console.log(`  Overall pass rate:     ${(stats.passRate * 100).toFixed(0)}%`)
  console.log(`  Average score:         ${(stats.avgScore * 100).toFixed(1)}%`)
  console.log()
}

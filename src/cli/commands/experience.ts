import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerExperience(program: Command) {
  const exp = program
    .command("experience")
    .alias("exp")
    .description("Experience replay buffer — track agent trajectories for skill learning")

  exp
    .command("stats")
    .description("Show experience store statistics")
    .action(handleExpStats)

  exp
    .command("list")
    .description("List recent experiences")
    .option("-l, --limit <number>", "Number of experiences to show", "10")
    .option("--project <name>", "Filter by project")
    .action(handleExpList)

  exp
    .command("failures")
    .description("List recent failure experiences")
    .option("-l, --limit <number>", "Number to show", "10")
    .action(handleExpFailures)

  exp
    .command("cluster")
    .description("Analyze failure clusters and surface insights")
    .option("--min-size <number>", "Minimum cluster size", "2")
    .action(handleExpCluster)

  exp
    .command("candidates")
    .description("Find skill candidates from successful experiences")
    .option("--min-reps <number>", "Minimum repetitions for skill extraction", "3")
    .action(handleExpCandidates)

  exp
    .command("retry")
    .description("Auto-retry failed experiences with different strategies")
    .option("--max-retries <n>", "Maximum retry attempts per failure", "2")
    .option("--strategy <type>", "Retry strategy (same/different-model/more-context)", "same")
    .option("--dry-run", "Show what would be retried without executing")
    .action(handleExpRetry)

  exp
    .command("auto-extract")
    .description("Auto-extract skills from successful patterns")
    .option("--min-confidence <pct>", "Minimum confidence threshold", "70")
    .option("--min-reps <n>", "Minimum repetitions for skill extraction", "3")
    .option("--auto-apply", "Actually write the skill files (default: dry-run)")
    .option("--ratchet", "Also ratchet persistent failures into regression cases")
    .action(handleExpAutoExtract)
}

async function handleExpStats() {
  showBanner()
  const { experienceStore } = await import("../../experience/store")
  const stats = experienceStore.getStats()
  console.log(theme.heading("\n  📊 Experience Store Statistics\n"))
  console.log(`  Total experiences: ${theme.bold(String(stats.totalExperiences))}`)
  console.log(`  Successful:        ${theme.success(String(stats.successCount))}`)
  console.log(`  Failed:            ${theme.error(String(stats.failureCount))}`)
  console.log(`  Reverted:          ${theme.warn(String(stats.revertedCount))}`)
  console.log(`  Avg reward:        ${theme.text(String(stats.avgReward.toFixed(2)))}`)
  console.log(`  Total actions:     ${theme.text(String(stats.totalActions))}`)
  console.log()
}

async function handleExpList(opts: { limit?: string; project?: string }) {
  showBanner()
  const limit = parseInt(opts.limit ?? "10", 10) || 10
  const { experienceStore } = await import("../../experience/store")
  const experiences = experienceStore.listRecent(limit, opts.project)

  if (experiences.length === 0) {
    console.log(theme.dim("\n  No experiences recorded yet.\n"))
    return
  }

  console.log(theme.heading(`\n  📋 Recent Experiences (${experiences.length})\n`))
  for (const e of experiences) {
    const icon = e.outcome === "success" ? theme.success("✓") : e.outcome === "failed" ? theme.error("✗") : theme.warn("~")
    console.log(`  ${icon} ${e.goal.slice(0, 60)}`)
    console.log(`     ${theme.dim(`${e.startedAt.slice(0, 10)} · ${e.actionCount} actions · reward ${e.reward}`)}`)
  }
  console.log()
}

async function handleExpFailures(opts: { limit?: string }) {
  await showBanner()
  const limit = parseInt(opts.limit ?? "10", 10) || 10
  const { experienceStore } = await import("../../experience/store")
  const failures = experienceStore.getRecentFailures(limit)

  if (failures.length === 0) {
    console.log(theme.success("\n  ✅ No recent failures!\n"))
    return
  }

  console.log(theme.heading(`\n  🔴 Recent Failures (${failures.length})\n`))
  for (const f of failures) {
    console.log(`  ${theme.error("✗")} ${f.goal.slice(0, 60)}`)
    console.log(`     ${theme.dim(f.summary.slice(0, 100))}`)
  }
  console.log()
}

async function handleExpCluster(opts: { minSize?: string }) {
  showBanner()
  const minSize = parseInt(opts.minSize ?? "2", 10) || 2
  const { generateClusterReport, formatClusterReport } = await import("../../experience/cluster")
  const report = generateClusterReport(minSize)
  console.log(formatClusterReport(report))
}

async function handleExpCandidates(opts: { minReps?: string }) {
  await showBanner()
  const { experienceStore } = await import("../../experience/store")
  const candidates = experienceStore.findSkillCandidates(parseInt(opts.minReps ?? "3", 10) || 3)

  if (candidates.length === 0) {
    console.log(theme.dim("\n  No skill candidates found. Run more agent sessions first.\n"))
    return
  }

  console.log(theme.heading(`\n  🧠 Skill Candidates (${candidates.length})\n`))
  for (const c of candidates) {
    const bar = "█".repeat(Math.round(c.confidence / 10)) + "░".repeat(10 - Math.round(c.confidence / 10))
    console.log(`  ${theme.bold(c.name)}`)
    console.log(`     Confidence: ${theme.accent(`${c.confidence}%`)} ${bar}`)
    console.log(`     Steps:      ${theme.dim(c.steps.join(" → "))}`)
    console.log(`     Goal:       ${theme.dim(c.goal.slice(0, 80))}`)
    console.log()
  }
}

async function handleExpRetry(opts: { maxRetries?: string; strategy?: string; dryRun?: boolean }) {
  await showBanner()
  const { ExperienceReplay } = await import("../../experience/replay")
  const replay = new ExperienceReplay()

  console.log(theme.heading("\n  🔄 Experience Replay — Retry Failed\n"))

  const results = await replay.retryFailures({
    maxRetries: parseInt(opts.maxRetries ?? "2", 10) || 2,
    strategy: (opts.strategy ?? "same") as "same" | "different-model" | "more-context",
    dryRun: opts.dryRun ?? false,
  })

  const attempted = results.filter((r) => !r.skipped && !r.dryRun)
  const skipped = results.filter((r) => r.skipped)
  const dryRuns = results.filter((r) => r.dryRun)

  if (dryRuns.length > 0) {
    console.log(`  ${theme.warn("🔍 Dry Run — Would retry:")}\n`)
    for (const r of dryRuns) {
      console.log(`  ${theme.dim(`  ${r.originalExperienceId.slice(0, 8)}`)} ${r.goal.slice(0, 60)}`)
      console.log(`     Strategy: ${theme.accent(r.strategy)}`)
      console.log()
    }
  }

  console.log(`  Created ${theme.bold(String(attempted.length))} retry experiences`)
  console.log(`  Skipped (max retries reached): ${theme.dim(String(skipped.length))}`)
  console.log()

  if (attempted.length > 0) {
    console.log(theme.heading("  Retries Created:\n"))
    for (const r of attempted) {
      console.log(`  ${theme.warn("↻")} ${r.goal.slice(0, 60)}`)
      console.log(`     ${theme.dim(`${r.originalExperienceId.slice(0, 8)} → ${r.newExperienceId?.slice(0, 8)} [${r.strategy}]`)}`)
      console.log()
    }
  }
}

async function handleExpAutoExtract(opts: { minConfidence?: string; minReps?: string; autoApply?: boolean; ratchet?: boolean }) {
  await showBanner()
  const { ExperienceReplay } = await import("../../experience/replay")
  const replay = new ExperienceReplay()

  const minConfidence = parseInt(opts.minConfidence ?? "70", 10) || 70
  const minReps = parseInt(opts.minReps ?? "3", 10) || 3
  const autoApply = opts.autoApply ?? false
  const ratchet = opts.ratchet ?? false

  console.log(theme.heading("\n  🧠 Auto-Extract Skills\n"))

  const extractions = await replay.extractSkills({
    minConfidence,
    minRepetitions: minReps,
    dryRun: !autoApply,
    autoApply,
  })

  if (extractions.length === 0) {
    console.log(theme.dim("  No skill candidates meeting the threshold found.\n"))
    return
  }

  console.log(`  Found ${theme.bold(String(extractions.length))} skill candidates (≥${minConfidence}% confidence, ≥${minReps} reps)\n`)

  for (const s of extractions) {
    const bar = "█".repeat(Math.round(s.confidence / 10)) + "░".repeat(10 - Math.round(s.confidence / 10))
    const status = s.skillFilePath ? theme.success("✓ written") : theme.dim("dry-run")
    console.log(`  ${theme.bold(s.name)} ${theme.dim(`[${status}]`)}`)
    console.log(`     Confidence: ${theme.accent(`${s.confidence}%`)} ${bar}`)
    console.log(`     Steps:      ${theme.dim(s.steps.join(" → "))}`)
    console.log(`     Goal:       ${theme.dim(s.goal.slice(0, 80))}`)
    if (s.skillFilePath) {
      console.log(`     File:       ${theme.dim(s.skillFilePath)}`)
    }
    console.log()
  }

  if (ratchet) {
    console.log(theme.heading("  Ratcheting persistent failures...\n"))
    const { experienceReplay } = await import("../../experience/replay")
    const failures = await experienceReplay.retryFailures({ dryRun: true })
    const persistent = failures.filter((r) => r.skipped)
    if (persistent.length > 0) {
      console.log(`  ${theme.warn(`Found ${persistent.length} persistent failures ready for ratcheting`)}`)
      console.log(`  ${theme.dim("Run with --ratchet on a non-dry-run retry to ratchet them")}`)
    } else {
      console.log(`  ${theme.success("No persistent failures to ratchet")}`)
    }
    console.log()
  }
}

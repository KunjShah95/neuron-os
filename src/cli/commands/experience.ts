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

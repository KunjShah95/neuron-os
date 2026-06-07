/**
 * src/cli/commands/improve-monitor.ts
 *
 * aegis improve monitor — Track skill performance, detect degradation,
 * and show top/bottom performing skills.
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerImproveMonitor(program: Command) {
  const improve =
    program.commands.find((c) => c.name() === "improve") ??
    program.command("improve").description("Self-improving agents")

  const monitor = improve
    .command("monitor")
    .description("Monitor skill performance — track success rates, detect degradation, find top performers")

  monitor.command("status").description("Show skill monitoring overview and stats").action(handleMonitorStatus)

  monitor
    .command("list")
    .description("List all skills with performance summaries")
    .option("--sort <field>", "Sort by: name, success-rate, degradation, invocations", "degradation")
    .option("--limit <n>", "Number of skills to show", "20")
    .action(handleMonitorList)

  monitor
    .command("degrading")
    .description("Show skills that are degrading and need attention")
    .option("--threshold <n>", "Degradation threshold (0-1)", "0.1")
    .option("--limit <n>", "Number to show", "10")
    .action(handleMonitorDegrading)

  monitor
    .command("top")
    .description("Show top performing skills")
    .option("--limit <n>", "Number to show", "5")
    .action(handleMonitorTop)

  monitor
    .command("record <skillId>")
    .description("Manually record a skill usage outcome")
    .option("--name <name>", "Skill name")
    .option("--success <bool>", "Whether the skill succeeded (true/false)", "true")
    .option("--reward <n>", "Reward value (0-1)", "0.8")
    .option("--tokens <n>", "Token count", "1000")
    .option("--duration <ms>", "Duration in ms", "5000")
    .action(handleMonitorRecord)
}

// ── Handlers ──────────────────────────────────────────────────────

async function handleMonitorStatus() {
  showBanner()
  const { skillMonitor } = await import("../../improve/skill-monitor")

  const stats = skillMonitor.getStats()

  console.log(theme.heading("\n  📊 Skill Monitor — Overview\n"))
  console.log(`  Skills tracked:     ${theme.bold(String(stats.totalSkills))}`)
  console.log(`  Total records:      ${stats.totalRecords}`)
  console.log(`  Avg success rate:   ${(stats.avgSuccessRate * 100).toFixed(1)}%`)
  console.log(
    `  Degrading skills:   ${stats.degradingSkills > 0 ? theme.error(String(stats.degradingSkills)) : theme.success("0")}`,
  )
  console.log()

  if (stats.degradingSkills > 0) {
    const degrading = skillMonitor.getDegradingSkills()
    console.log(theme.heading("  ⚠ Skills Needing Attention\n"))
    for (const s of degrading.slice(0, 5)) {
      console.log(`  ${theme.error("!")} ${theme.bold(s.skillName)}`)
      console.log(
        `     Success rate: ${(s.currentSuccessRate * 100).toFixed(0)}%  (was ${(s.overallSuccessRate * 100).toFixed(0)}%)`,
      )
      console.log(`     Degradation:  ${(s.degradationScore * 100).toFixed(0)}%  Trend: ${s.trend}`)
      console.log()
    }
  }
}

async function handleMonitorList(opts: { sort?: string; limit?: string }) {
  showBanner()
  const { skillMonitor } = await import("../../improve/skill-monitor")

  const all = skillMonitor.listAll()
  const limit = parseInt(opts.limit ?? "20", 10) || 20

  if (all.length === 0) {
    console.log(theme.warn("\n  No skills tracked yet. Skills are recorded when used by agents.\n"))
    return
  }

  const sorted = [...all]
    .sort((a, b) => {
      switch (opts.sort) {
        case "success-rate":
          return b.currentSuccessRate - a.currentSuccessRate
        case "invocations":
          return b.totalInvocations - a.totalInvocations
        case "name":
          return a.skillName.localeCompare(b.skillName)
        default:
          return b.degradationScore - a.degradationScore
      }
    })
    .slice(0, limit)

  console.log(theme.heading(`\n  📋 Skills (${all.length} total, showing ${sorted.length})\n`))
  console.log(
    `  ${theme.bold("Skill".padEnd(28))} ${theme.bold("Success".padEnd(8))} ${theme.bold("Trend".padEnd(10))} ${theme.bold("Calls")}`,
  )
  console.log(`  ${theme.dim("─".repeat(60))}`)

  for (const s of sorted) {
    const rate = (s.currentSuccessRate * 100).toFixed(0) + "%"
    const rateLabel =
      s.currentSuccessRate >= 0.7
        ? theme.success(rate)
        : s.currentSuccessRate >= 0.4
          ? theme.warn(rate)
          : theme.error(rate)
    const trendIcon =
      s.trend === "improving" ? theme.success("↑") : s.trend === "degrading" ? theme.error("↓") : theme.dim("→")
    const trendLabel =
      s.trend === "improving"
        ? theme.success(s.trend)
        : s.trend === "degrading"
          ? theme.error(s.trend)
          : theme.dim(s.trend)
    console.log(
      `  ${theme.bold(s.skillName.padEnd(28))} ${rateLabel.padEnd(8)} ${trendIcon} ${trendLabel.padEnd(8)} ${String(s.totalInvocations).padEnd(6)}`,
    )
  }
  console.log()
}

async function handleMonitorDegrading(opts: { threshold?: string; limit?: string }) {
  showBanner()
  const { skillMonitor } = await import("../../improve/skill-monitor")

  const threshold = parseFloat(opts.threshold ?? "0.1") || 0.1
  const limit = parseInt(opts.limit ?? "10", 10) || 10
  const degrading = skillMonitor.getDegradingSkills(threshold).slice(0, limit)

  if (degrading.length === 0) {
    console.log(theme.success(`\n  ✅ No skills degrading above ${(threshold * 100).toFixed(0)}% threshold.\n`))
    return
  }

  console.log(theme.heading(`\n  ⚠ Degrading Skills (threshold: ${(threshold * 100).toFixed(0)}%)\n`))

  for (const s of degrading) {
    console.log(
      `  ${theme.error("↓")} ${theme.bold(s.skillName)}  (${(s.degradationScore * 100).toFixed(0)}% degraded)`,
    )
    console.log(
      `     Current: ${(s.currentSuccessRate * 100).toFixed(0)}%  |  Overall: ${(s.overallSuccessRate * 100).toFixed(0)}%  |  Calls: ${s.totalInvocations}`,
    )
    console.log(
      `     Trend slope: ${s.trendSlope.toFixed(3)}  |  Last seen: ${theme.dim(new Date(s.lastSeen).toLocaleString())}`,
    )
    if (s.improvementSuggestions.length > 0) {
      for (const sug of s.improvementSuggestions) {
        console.log(`     ${theme.warn("→")} ${sug}`)
      }
    }
    console.log()
  }
}

async function handleMonitorTop(opts: { limit?: string }) {
  showBanner()
  const { skillMonitor } = await import("../../improve/skill-monitor")

  const limit = parseInt(opts.limit ?? "5", 10) || 5
  const top = skillMonitor.getTopSkills(limit)

  if (top.length === 0) {
    console.log(theme.warn("\n  No skills with enough invocation data yet (minimum 3 calls).\n"))
    return
  }

  console.log(theme.heading(`\n  🏆 Top ${top.length} Performing Skills\n`))

  for (let i = 0; i < top.length; i++) {
    const s = top[i]!
    const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  "
    console.log(`  ${medal} ${theme.bold(s.skillName)}`)
    console.log(
      `     Success rate: ${theme.success(`${(s.currentSuccessRate * 100).toFixed(0)}%`)}  |  Calls: ${s.totalInvocations}  |  Reward: ${s.avgReward.toFixed(2)}`,
    )
    console.log()
  }
}

async function handleMonitorRecord(
  skillId: string,
  opts: {
    name?: string
    success?: string
    reward?: string
    tokens?: string
    duration?: string
  },
) {
  showBanner()
  const { skillMonitor } = await import("../../improve/skill-monitor")

  const success = opts.success !== "false"
  const reward = parseFloat(opts.reward ?? "0.8") || 0.8
  const tokens = parseInt(opts.tokens ?? "1000", 10) || 1000
  const duration = parseInt(opts.duration ?? "5000", 10) || 5000
  const name = opts.name ?? skillId

  skillMonitor.recordUsage(skillId, name, success, reward, tokens, duration)

  console.log(theme.success(`\n  ✓ Recorded usage for skill "${name}" (${skillId})\n`))
  console.log(`  Success:  ${success ? theme.success("yes") : theme.error("no")}`)
  console.log(`  Reward:   ${reward.toFixed(2)}`)
  console.log(`  Tokens:   ${tokens}`)
  console.log(`  Duration: ${duration}ms`)
  console.log()
}

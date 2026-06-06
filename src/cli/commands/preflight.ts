import type { Command } from "commander"
import { theme } from "../theme"

export function registerPreflight(program: Command) {
  const preflight = program
    .command("estimate")
    .description("Pre-flight cost estimation — estimate cost before spawning an agent")

  preflight
    .argument("<goal>", "The task goal to estimate cost for")
    .option("--type <agent-type>", "Agent type (build, read, etc.)", "build")
    .option("--tokens <n>", "Estimated token count", "3000")
    .option("--tier <tier>", "Preferred tier (cheap/balanced/premium)", "balanced")
    .option("--warn-at <usd>", "Warn threshold in USD", "0.50")
    .option("--block-at <usd>", "Block threshold in USD", "5.00")
    .option("--json", "Output as JSON")
    .action(handlePreflight)
}

async function handlePreflight(
  goal: string,
  opts: {
    type?: string
    tokens?: string
    tier?: string
    warnAt?: string
    blockAt?: string
    json?: boolean
  },
) {
  const { PreflightEstimator } = await import("../../economy/preflight")

  const estimate = PreflightEstimator.estimate({
    goal,
    agentType: opts.type,
    estimatedTokens: parseInt(opts.tokens ?? "3000", 10),
    preferredTier: (opts.tier ?? "balanced") as "cheap" | "balanced" | "premium",
  })

  const final = PreflightEstimator.checkThresholds(estimate, {
    warnAt: parseFloat(opts.warnAt ?? "0.50"),
    blockAt: parseFloat(opts.blockAt ?? "5.00"),
  })

  if (opts.json) {
    console.log(JSON.stringify(final, null, 2))
    return
  }

  const recIcon =
    final.recommendation === "proceed" ? "✅" : final.recommendation === "warn" ? "⚠️" : "🚫"

  console.log(theme.heading("\n  \u{1F4CB} Pre-flight Estimate\n"))
  console.log(`  Goal:      ${theme.bold(goal.slice(0, 80))}`)
  console.log(`  Agent:     ${theme.dim(opts.type ?? "build")}`)
  console.log()
  console.log(`  ${theme.bold("Cost")}`)
  console.log(`  Estimated: ${theme.accent(`$${final.estimatedCost.toFixed(4)}`)}`)
  console.log(`  Budget:    ${theme.text(`$${final.budgetLimit.toFixed(2)}`)}`)
  console.log(`  Spent:     ${theme.text(`$${final.totalSpent.toFixed(4)}`)}`)
  console.log(
    `  Remaining: ${
      final.remainingBudget > 0
        ? theme.success(`$${final.remainingBudget.toFixed(4)}`)
        : theme.error("$0.00")
    }`,
  )
  console.log()

  if (final.similarTasks.length > 0) {
    console.log(`  ${theme.bold("Similar Tasks")}`)
    for (const t of final.similarTasks.slice(0, 5)) {
      console.log(`    ${theme.dim(t.goal.slice(0, 60))}  ${t.outcome}  $${t.cost.toFixed(4)}`)
    }
    console.log()
  }

  console.log(`  ${recIcon} Recommendation: ${theme.bold(final.recommendation)}`)
  console.log(`  ${theme.dim(final.reasoning)}`)
  console.log()
}

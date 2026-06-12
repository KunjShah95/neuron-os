import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerCost(program: Command) {
  const cost = program
    .command("cost")
    .alias("spend")
    .description("Billing and cost tracking — monitor agent usage and budget")

  cost
    .command("estimate")
    .description("Estimate cost for a task with complexity scaling, model routing, and budget check")
    .option("-i, --input <tokens>", "Expected input tokens", "500")
    .option("-o, --output <tokens>", "Expected output tokens", "200")
    .option("--tools <names>", "Comma-separated tool names (e.g. web_search,bash,read)")
    .option("--calls <n>", "Expected number of tool calls", "5")
    .option("-c, --complexity <level>", "Task complexity: simple, moderate, or complex", "moderate")
    .option("-b, --budget <usd>", "Budget constraint in USD", "1.0")
    .action(handleEstimate)

  cost.command("total").description("Show total spend vs budget").action(handleTotal)

  cost.command("models").description("Show cost breakdown by model").action(handleModels)

  cost.command("sessions").description("Show cost by session").action(handleSessions)

  cost
    .command("history")
    .description("Show daily cost history")
    .option("-d, --days <number>", "Number of days of history", "7")
    .action(handleHistory)

  cost
    .command("budget")
    .description("Show or set budget limit")
    .argument("[usd]", "Budget limit in USD to set")
    .action(handleBudget)

  cost
    .command("dashboard")
    .description("Real-time cost dashboard with trends and sparklines")
    .option("-d, --days <number>", "Number of days of history", "14")
    .action(handleDashboard)

  cost.command("report").description("Full cost attribution report").action(handleReport)
}

async function handleEstimate(opts: {
  input?: string
  output?: string
  tools?: string
  calls?: string
  complexity?: string
  budget?: string
}) {
  showBanner()

  const input = parseInt(opts.input ?? "500", 10)
  const output = parseInt(opts.output ?? "200", 10)
  const toolNames = opts.tools
    ? opts.tools
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : []
  const toolCalls = parseInt(opts.calls ?? "5", 10)
  const complexity = (opts.complexity ?? "moderate") as "simple" | "moderate" | "complex"
  const budgetUsd = parseFloat(opts.budget ?? "1.0")

  const complexityLabel =
    complexity === "simple" ? "🟢 Simple" : complexity === "moderate" ? "🟡 Moderate" : "🔴 Complex"

  console.log(theme.heading("\n  💵 Cost Estimate\n"))
  console.log(`  ${theme.bold("Task Profile")}`)
  console.log(`    Input tokens:  ${theme.text(String(input))}`)
  console.log(`    Output tokens: ${theme.text(String(output))}`)
  console.log(`    Tools:         ${theme.dim(toolNames.length > 0 ? toolNames.join(", ") : "none")}`)
  console.log(`    Tool calls:    ${theme.dim(String(toolCalls))}`)
  console.log(`    Complexity:    ${theme.text(complexityLabel)}`)
  console.log(`    Budget:        ${theme.accent(`$${budgetUsd.toFixed(2)}`)}`)
  console.log()

  // ── predictCost() with complexity scaling ─────────────────────────
  const { predictCost } = await import("../../economy/predictor")
  const predicted = predictCost({
    inputTokens: input,
    outputTokens: output,
    tools: toolNames,
    toolCalls,
    complexity,
  })

  console.log(`  ${theme.bold("Tier Estimates (with complexity scaling)")}`)
  const cheapOk = predicted.cheap <= budgetUsd
  const balancedOk = predicted.balanced <= budgetUsd
  const premiumOk = predicted.premium <= budgetUsd

  console.log(
    `    ${cheapOk ? "✅" : "❌"} Cheap:     ${theme.accent(`$${predicted.cheap.toFixed(4)}`)}${
      cheapOk ? "" : theme.error(` (exceeds $${budgetUsd.toFixed(2)} budget)`)
    }`,
  )
  console.log(
    `    ${balancedOk ? "✅" : "❌"} Balanced: ${theme.accent(`$${predicted.balanced.toFixed(4)}`)}${
      balancedOk ? "" : theme.error(` (exceeds $${budgetUsd.toFixed(2)} budget)`)
    }`,
  )
  console.log(
    `    ${premiumOk ? "✅" : "❌"} Premium:  ${theme.accent(`$${predicted.premium.toFixed(4)}`)}${
      premiumOk ? "" : theme.error(` (exceeds $${budgetUsd.toFixed(2)} budget)`)
    }`,
  )
  console.log()

  // ── estimateCost() for model routing ──────────────────────────────
  const { estimateCost } = await import("../../economy/cost-router")
  try {
    const routed = estimateCost(
      { inputTokens: input, outputTokens: output, tools: toolNames, toolCalls },
      { budget: budgetUsd },
    )
    console.log(`  ${theme.bold("Model Route")}`)
    console.log(`    Selected:  ${theme.accent(routed.selected_model || routed.selected)}`)
    console.log(`    Reasoning: ${theme.dim(routed.reasoning)}`)
    console.log()
  } catch {
    // No viable provider for this budget — show the tiers anyway
  }

  // ── BudgetGuard status ────────────────────────────────────────────
  const { BudgetGuard } = await import("../../economy/budget-guard")
  const guard = new BudgetGuard(budgetUsd)

  // Record the predicted spend to get a realistic status
  guard.setEstimatedRemainingCost(predicted.balanced)

  const status = guard.status()
  const recEmoji = status.recommendation === "continue" ? "✅" : status.recommendation === "skip_optional" ? "⚠️" : "🚫"

  console.log(`  ${theme.bold("Budget Check")}`)
  console.log(`    Budget:      ${theme.accent(`$${status.budget_usd.toFixed(2)}`)}`)
  console.log(`    Estimated:   ${theme.text(`$${predicted.balanced.toFixed(4)}`)}`)
  console.log(
    `    Remaining:   ${status.over_budget ? theme.error("$0.00") : theme.success(`$${(status.budget_usd - predicted.balanced).toFixed(4)}`)}`,
  )
  console.log(`    ${recEmoji} Recommendation: ${theme.bold(status.recommendation)}`)
  console.log()

  // ── Real spend from billing tracker ───────────────────────────────
  const { billingTracker } = await import("../../billing/tracker")
  const totalSpend = billingTracker.getTotalSpend()
  const budgetLimit = billingTracker.getBudgetLimit()

  if (totalSpend > 0 || budgetLimit > 0) {
    console.log(`  ${theme.bold("Real Spend")}`)
    console.log(`    Lifetime spend:  ${theme.accent(`$${totalSpend.toFixed(4)}`)}`)
    console.log(`    Budget limit:    ${theme.text(`$${budgetLimit.toFixed(2)}`)}`)
    console.log(
      `    Remaining:       ${totalSpend >= budgetLimit ? theme.error("$0.00") : theme.success(`$${Math.max(0, budgetLimit - totalSpend).toFixed(4)}`)}`,
    )
    console.log()
  }

  console.log(theme.dim("  Run `aegis cost total` for full budget overview."))
  console.log()
}

async function handleTotal() {
  showBanner()
  const { billingTracker } = await import("../../billing/tracker")
  const total = billingTracker.getTotalSpend()
  const limit = billingTracker.getBudgetLimit()
  const exceeded = billingTracker.hasExceededBudget()
  const remaining = Math.max(0, limit - total)
  const pct = limit > 0 ? (total / limit) * 100 : 0
  const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10))

  console.log(theme.heading("\n  💰 Cost Overview\n"))
  console.log(`  Total spend:  ${theme.bold(`$${total.toFixed(4)}`)}`)
  console.log(`  Budget limit: ${theme.text(`$${limit.toFixed(2)}`)}`)
  console.log(`  Remaining:    ${exceeded ? theme.error("$0.00") : theme.success(`$${remaining.toFixed(4)}`)}`)
  console.log(`  Usage:        ${theme.dim(`${pct.toFixed(1)}%`)} ${bar}`)
  console.log(`  Status:       ${exceeded ? theme.error("⚠ Exceeded") : theme.success("✓ Within budget")}`)
  console.log()
}

async function handleModels() {
  showBanner()
  const { billingTracker } = await import("../../billing/tracker")
  const byModel = billingTracker.getCostByModel()

  if (byModel.length === 0) {
    console.log(theme.dim("\n  No usage data recorded yet.\n"))
    return
  }

  console.log(theme.heading(`\n  🤖 Cost by Model (${byModel.length})\n`))
  for (const m of byModel) {
    console.log(`  ${theme.bold(m.model)}`)
    console.log(`     Cost:      ${theme.accent(`$${m.totalCost.toFixed(4)}`)}`)
    console.log(`     Tokens:    ${theme.text(String(m.totalTokens))}`)
    console.log(`     Calls:     ${theme.dim(String(m.callCount))}`)
    console.log()
  }
}

async function handleSessions() {
  showBanner()
  const { billingTracker } = await import("../../billing/tracker")
  const bySession = billingTracker.getCostBySession()

  if (bySession.length === 0) {
    console.log(theme.dim("\n  No usage data recorded yet.\n"))
    return
  }

  console.log(theme.heading(`\n  📁 Cost by Session (${bySession.length})\n`))
  for (const s of bySession) {
    console.log(`  ${theme.bold(s.sessionId.slice(0, 36))}`)
    console.log(`     Model: ${theme.text(s.model)}`)
    console.log(`     Cost:  ${theme.accent(`$${s.totalCost.toFixed(4)}`)}`)
    console.log(`     Calls: ${theme.dim(String(s.callCount))}`)
    console.log()
  }
}

async function handleHistory(opts: { days?: string }) {
  showBanner()
  const days = parseInt(opts.days ?? "7", 10) || 7
  const { billingTracker } = await import("../../billing/tracker")
  const history = billingTracker.getCostHistory(days)

  if (history.length === 0) {
    console.log(theme.dim(`\n  No usage data in the last ${days} days.\n`))
    return
  }

  console.log(theme.heading(`\n  📈 Daily Cost History (${days}d)\n`))
  const maxCost = Math.max(...history.map((h) => h.totalCost), 0.0001)
  for (const h of history) {
    const barW = Math.round((h.totalCost / maxCost) * 20)
    const bar = "█".repeat(barW) + "░".repeat(20 - barW)
    console.log(`  ${theme.dim(h.date)}  ${theme.accent(`$${h.totalCost.toFixed(4)}`)} ${bar}`)
  }
  console.log()
}

async function handleBudget(usd?: string) {
  showBanner()
  const { billingTracker } = await import("../../billing/tracker")

  if (usd !== undefined) {
    const val = parseFloat(usd)
    if (isNaN(val) || val <= 0) {
      console.log(theme.error("\n  Please provide a valid positive number.\n"))
      return
    }
    billingTracker.setBudgetLimit(val)
    console.log(theme.success(`\n  ✓ Budget limit set to $${val.toFixed(2)}\n`))
    return
  }

  const limit = billingTracker.getBudgetLimit()
  console.log(theme.heading("\n  🎯 Budget Limit\n"))
  console.log(`  Current budget: ${theme.bold(`$${limit.toFixed(2)}`)}`)
  console.log(`  Set new:        ${theme.dim("aegis cost budget <usd>")}`)
  console.log()
}

const SPARKLINE_CHARS = ["\u2581", "\u2582", "\u2583", "\u2584", "\u2585", "\u2586", "\u2587", "\u2588"]

function sparkline(values: number[], width = 20): string {
  if (values.length === 0) return "".padEnd(width, "\u2581")
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 0.0001)
  const range = max - min
  if (range === 0) return "".padEnd(Math.min(values.length, width), "\u2584")

  const step = range / (SPARKLINE_CHARS.length - 1)
  const chars = values.map((v) => {
    const idx = Math.min(Math.floor((v - min) / step), SPARKLINE_CHARS.length - 1)
    return SPARKLINE_CHARS[idx] ?? "\u2581"
  })

  // Trim or pad to fit width
  if (chars.length <= width) return chars.join("")
  // Downsample: take evenly spaced samples (center-bucket to avoid trailing bias)
  const sampled: string[] = []
  for (let i = 0; i < width; i++) {
    const idx = Math.floor(((i + 0.5) / width) * chars.length)
    sampled.push(chars[idx] ?? "")
  }
  return sampled.join("")
}

async function handleDashboard(opts: { days?: string }) {
  showBanner()
  const days = parseInt(opts.days ?? "14", 10) || 14
  const { billingTracker } = await import("../../billing/tracker")

  const total = billingTracker.getTotalSpend()
  const limit = billingTracker.getBudgetLimit()
  const exceeded = billingTracker.hasExceededBudget()
  const remaining = Math.max(0, limit - total)
  const pct = limit > 0 ? (total / limit) * 100 : 0
  const byModel = billingTracker.getCostByModel()
  const history = billingTracker.getCostHistory(days)

  console.log(theme.heading("\n  \u{1F4CA} Cost Dashboard\n"))

  // ── Budget bar ──────────────────────────────────────────────────
  const barLen = 30
  const filled = Math.round((pct / 100) * barLen)
  const bar =
    theme.error("\u2588".repeat(Math.min(filled, barLen))) +
    theme.success("\u2588".repeat(Math.max(0, barLen - filled)))
  const statusIcon = exceeded ? "\u26A0\uFE0F" : "\u2705"
  const statusText = exceeded ? "Exceeded" : "Within budget"

  console.log(
    `  Budget:  ${bar}  ${theme.bold(`$${total.toFixed(4)}`)} / ${theme.text(`$${limit.toFixed(2)}`)} (${pct.toFixed(1)}%)`,
  )
  console.log(
    `  Status:  ${statusIcon} ${exceeded ? theme.error(statusText) : theme.success(statusText)}  ` +
      `Remaining: ${remaining > 0 ? theme.accent(`$${remaining.toFixed(4)}`) : theme.error("$0.00")}`,
  )
  console.log()

  // ── Sparkline ───────────────────────────────────────────────────
  if (history.length > 0) {
    const costs = history.map((h) => h.totalCost)
    const maxCost = Math.max(...costs, 0.0001)
    const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length

    console.log(`  ${theme.bold("Daily Cost Trend")}  (last ${days}d, ${history.length} days with data)`)
    console.log(
      `  ${theme.dim((history[0]?.date ?? "") + " ")}${theme.accent(sparkline(costs, 40))}${theme.dim(" " + (history.at(-1)?.date ?? ""))}`,
    )
    console.log(
      `  Low: ${theme.text(`$${Math.min(...costs).toFixed(4)}`)}  ` +
        `Avg: ${theme.accent(`$${avgCost.toFixed(4)}`)}  ` +
        `High: ${theme.text(`$${maxCost.toFixed(4)}`)}  ` +
        `Total: ${theme.bold(`$${costs.reduce((a, b) => a + b, 0).toFixed(4)}`)}`,
    )

    // Burn rate projection
    if (avgCost > 0 && limit > 0) {
      const daysRemaining = avgCost > 0.001 ? remaining / avgCost : Infinity
      const projection =
        daysRemaining === Infinity
          ? `${theme.dim("N/A — insufficient data")}`
          : daysRemaining > 365
            ? `${theme.bold(">1yr")}`
            : daysRemaining > 30
              ? `${theme.bold(`${(daysRemaining / 30).toFixed(1)}mo`)}`
              : `${theme.bold(`${Math.round(daysRemaining)}d`)}`
      console.log(
        `  Burn rate: ~${theme.accent(`$${avgCost.toFixed(4)}`)}/day  ` + `Budget lasts ~${projection} at current rate`,
      )
    }
    console.log()

    // Daily table (last 7 days compact)
    const shownDays = Math.min(history.length, 7)
    console.log(`  ${theme.bold("Recent Days")}  ${theme.dim(`(last ${shownDays} of ${history.length} days)`)}`)
    const recentDays = history.slice(-7)
    for (const h of recentDays) {
      const pctOfMax = h.totalCost / maxCost
      const miniBar = "\u2588".repeat(Math.round(pctOfMax * 10))
      console.log(`    ${theme.dim(h.date)}  ${theme.accent(`$${h.totalCost.toFixed(4)}`)} ${miniBar}`)
    }
    console.log()
  } else {
    console.log(`  ${theme.dim("No cost history data available yet.")}`)
    console.log()
  }

  // ── Top models ──────────────────────────────────────────────────
  if (byModel.length > 0) {
    console.log(`  ${theme.bold("Top Models by Cost")}`)
    const topModels = byModel.slice(0, 5)
    const maxModelCost = Math.max(...topModels.map((m) => m.totalCost), 0.0001)
    for (const m of topModels) {
      const miniBar = "\u2588".repeat(Math.round((m.totalCost / maxModelCost) * 15))
      console.log(
        `    ${theme.bold(m.model.padEnd(22))} ${theme.accent(`$${m.totalCost.toFixed(4)}`).padEnd(12)} ${miniBar}`,
      )
      console.log(
        `    ${theme.dim("").padEnd(22)} Calls: ${String(m.callCount).padEnd(6)} Tokens: ${String(m.totalTokens).padEnd(10)}`,
      )
    }
    console.log()
  }

  console.log(theme.dim("  Commands: aegis cost total | models | sessions | history | budget"))
  console.log()
}

async function handleReport() {
  showBanner()
  const { costBenchmark } = await import("../../telemetry/cost")
  const report = costBenchmark.generateReport()

  console.log(theme.heading("\n  📊 Cost Attribution Report\n"))
  console.log(`  Total spend:      ${theme.bold(`$${report.totalSpend.toFixed(4)}`)}`)
  console.log(`  Budget limit:     ${theme.text(`$${report.budgetLimit.toFixed(2)}`)}`)
  console.log(
    `  Remaining:        ${report.budgetExceeded ? theme.error("$0.00") : theme.success(`$${report.remainingBudget.toFixed(4)}`)}`,
  )
  console.log(`  Budget exceeded:  ${report.budgetExceeded ? theme.error("Yes") : theme.success("No")}`)
  console.log()

  if (report.byModel.length > 0) {
    console.log(theme.heading("  By Model\n"))
    for (const m of report.byModel) {
      console.log(`    ${theme.bold(m.model)}`)
      console.log(`      Cost:   ${theme.accent(`$${m.totalCost.toFixed(4)}`)}`)
      console.log(`      Calls:  ${theme.text(String(m.callCount))}`)
      console.log()
    }
  }

  if (report.history.length > 0) {
    console.log(theme.heading("  Daily History\n"))
    for (const h of report.history) {
      console.log(`    ${theme.dim(h.date)}  ${theme.accent(`$${h.totalCost.toFixed(4)}`)}`)
    }
    console.log()
  }
}

/**
 * predict — CLI command for the Predictive Agent System.
 *
 * Subcommands:
 *   predict risk <agent-type>   — Evaluate failure risk for an agent type
 *   predict forecast            — Show cost forecast and budget exhaustion projection
 *   predict status              — Show overall predictive system health
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerPredict(program: Command) {
  const predict = program
    .command("predict")
    .alias("pred")
    .description("Predictive Agent System — failure risk, cost forecast, and trend analysis")

  predict
    .command("risk")
    .description("Evaluate failure risk for an agent type")
    .argument("[agent-type]", "Agent type to evaluate (e.g. build, plan, read). Omits for all types")
    .option("-j, --json", "Output as JSON")
    .action(handleRisk)

  predict
    .command("forecast")
    .alias("fc")
    .description("Show cost forecast and budget exhaustion projection")
    .option("-d, --days <number>", "Lookback window in days", "14")
    .option("-j, --json", "Output as JSON")
    .action(handleForecast)

  predict
    .command("status")
    .description("Show overall predictive system health")
    .option("-j, --json", "Output as JSON")
    .action(handleStatus)
}

async function handleRisk(agentType?: string, opts?: { json?: boolean }) {
  const { FailurePredictor } = await import("../../economy/failure-predictor")
  await FailurePredictor.initialize()

  if (agentType) {
    const risk = FailurePredictor.evaluateSpawnRisk({ agentType })

    if (opts?.json) {
      console.log(JSON.stringify(risk, null, 2))
      return
    }

    showBanner()
    console.log(theme.heading(`\n  🔮 Failure Risk: "${agentType}"\n`))
    const levelColor =
      risk.level === "critical"
      ? theme.error
      : risk.level === "high"
        ? theme.warn
          : risk.level === "medium"
            ? theme.text
            : theme.success
    console.log(`  Risk level: ${levelColor(risk.level.toUpperCase())} (${risk.score}/100)`)
    console.log(`  Reason:     ${theme.dim(risk.reason)}`)
    console.log()

    if (risk.factors.length > 0) {
      console.log(`  ${theme.bold("Contributing Factors")}`)
      for (const f of risk.factors.sort((a, b) => b.contribution - a.contribution)) {
        const bar = "█".repeat(Math.round(f.contribution / 10))
        console.log(`    ${bar.padEnd(10)} ${f.detail}`)
      }
      console.log()
    }
  } else {
    // List all types
    const allRisks = FailurePredictor.getAllRiskLevels()

    if (opts?.json) {
      console.log(JSON.stringify(allRisks, null, 2))
      return
    }

    showBanner()
    console.log(theme.heading(`\n  🔮 Agent Failure Risk Overview\n`))

    if (allRisks.length === 0) {
      console.log(theme.dim("  No data yet. Run some agents first to build historical patterns."))
      console.log()
      console.log(theme.dim("  Tip: Every spawn and exit is recorded in the experience store."))
      console.log(theme.dim("  Once you have 5+ experiences per agent type, predictions become available."))
      console.log()
      return
    }

    console.log(`  ${theme.bold("Agent Type".padEnd(16))} ${theme.bold("Risk".padEnd(12))} ${theme.bold("Spawns".padEnd(8))} ${theme.bold("Failures".padEnd(10))} ${theme.bold("Recent")}`)
    console.log(`  ${theme.dim("─".repeat(54))}`)

    for (const r of allRisks) {
      const levelColor =
        r.level === "critical"
          ? theme.error
          : r.level === "high"
            ? theme.warn
            : r.level === "medium"
              ? theme.text
              : theme.success
      const scoreBadge = `${r.score}/100`.padEnd(10)
      console.log(
        `  ${r.agentType.padEnd(16)} ${levelColor(scoreBadge)} ${String(r.spawns).padEnd(8)} ${String(r.failures).padEnd(10)} ${"🔥".repeat(Math.min(r.recentFailures, 5))}`,
      )
    }
    console.log()
    console.log(theme.dim("  Run 'aegis predict risk <agent-type>' for detailed breakdown."))
    console.log()
  }
}

async function handleForecast(opts?: { days?: string; json?: boolean }) {
  const { CostForecaster } = await import("../../economy/cost-forecaster")
  const windowDays = parseInt(opts?.days ?? "14", 10) || 14
  const forecast = await CostForecaster.forecast(windowDays)

  if (opts?.json) {
    console.log(JSON.stringify(forecast, null, 2))
    return
  }

  showBanner()
  console.log(theme.heading(`\n  📈 Cost Forecast (${windowDays}d lookback)\n`))

  // Budget bar
  const barLen = 30
  const pct =
    forecast.budgetLimit > 0
      ? (forecast.totalSpend / forecast.budgetLimit) * 100
      : 0
  const filled = Math.min(Math.round((pct / 100) * barLen), barLen)
  const bar =
    theme.error("█".repeat(filled)) + theme.success("█".repeat(barLen - filled))

  console.log(
    `  Budget:  ${bar}  ${theme.bold(`$${forecast.totalSpend.toFixed(4)}`)} / ${theme.text(`$${forecast.budgetLimit.toFixed(2)}`)} (${pct.toFixed(1)}%)`,
  )
  console.log()

  // Key metrics
  console.log(`  ${theme.bold("Key Metrics")}`)
  console.log(`    Avg daily spend:  ${theme.accent(`$${forecast.avgDailySpend.toFixed(4)}`)}`)
  console.log(`    Trend:           ${forecast.trend === "increasing" ? theme.error("📈 Increasing") : forecast.trend === "decreasing" ? theme.success("📉 Decreasing") : theme.text("➡️ Stable")}`)
  console.log(`    Confidence:      ${forecast.confidence === "high" ? theme.success("High") : forecast.confidence === "medium" ? theme.text("Medium") : theme.warn("Low")}`)
  console.log()

  // Projections
  console.log(`  ${theme.bold("Projections")}`)
  console.log(`    Next 7 days:  ${theme.accent(`$${forecast.projected7Day.toFixed(4)}`)}`)
  console.log(`    Next 30 days: ${theme.accent(`$${forecast.projected30Day.toFixed(4)}`)}`)
  console.log(
    `    Budget ends:  ${forecast.daysUntilExhaustion > 0 && isFinite(forecast.daysUntilExhaustion) ? theme.warn(`~${Math.round(forecast.daysUntilExhaustion)} days (${forecast.estimatedExhaustionDate})`) : theme.success("Not projected")}`,
  )
  console.log()

  // Top cost drivers
  if (forecast.byAgentType.length > 0) {
    console.log(`  ${theme.bold("Top Cost Drivers")}`)
    const top5 = forecast.byAgentType.slice(0, 5)
    const maxCost = Math.max(...top5.map((t) => t.totalCost), 0.0001)
    for (const t of top5) {
      const miniBar = "█".repeat(Math.round((t.totalCost / maxCost) * 15))
      console.log(
        `    ${t.agentType.padEnd(16)} ${theme.accent(`$${t.totalCost.toFixed(4)}`).padEnd(14)} ${String(t.percentage).padStart(3)}%  ${miniBar}`,
      )
    }
    console.log()
  }

  // Insights
  if (forecast.insights.length > 0) {
    console.log(`  ${theme.bold("Insights")}`)
    for (const insight of forecast.insights) {
      console.log(`    ${insight}`)
    }
    console.log()
  }
}

async function handleStatus(_opts?: { json?: boolean }) {
  showBanner()
  console.log(theme.heading("\n  🔮 Predictive System Status\n"))

  const { FailurePredictor } = await import("../../economy/failure-predictor")
  await FailurePredictor.initialize()

  const allRisks = FailurePredictor.getAllRiskLevels()
  const highRiskCount = allRisks.filter(
    (r) => r.level === "high" || r.level === "critical",
  ).length
  const totalTypes = allRisks.length

  console.log(`  ${theme.bold("Failure Prediction")}`)
  console.log(`    Agent types tracked: ${theme.text(String(totalTypes))}`)
  console.log(`    High-risk types:     ${highRiskCount > 0 ? theme.error(String(highRiskCount)) : theme.success("0")}`)
  console.log()

  const { CostForecaster } = await import("../../economy/cost-forecaster")
  const forecast = await CostForecaster.forecast()

  console.log(`  ${theme.bold("Cost Forecast")}`)
  console.log(`    Budget remaining: ${theme.accent(`$${forecast.remainingBudget.toFixed(4)}`)}`)
  console.log(
    `    Days remaining:  ${forecast.daysUntilExhaustion > 0 && isFinite(forecast.daysUntilExhaustion) ? theme.text(`~${Math.round(forecast.daysUntilExhaustion)} days`) : theme.success("N/A (no limit)")}`,
  )
  console.log(`    Trend:           ${forecast.trend === "increasing" ? theme.error("↗ Increasing") : forecast.trend === "decreasing" ? theme.success("↘ Decreasing") : theme.text("→ Stable")}`)
  console.log(`    Confidence:      ${forecast.confidence === "high" ? theme.success("High") : forecast.confidence === "medium" ? theme.text("Medium") : theme.warn("Low")}`)
  console.log()

  if (forecast.insights.length > 0) {
    console.log(`  ${theme.bold("Alerts")}`)
    for (const insight of forecast.insights.slice(0, 3)) {
      console.log(`    ${insight}`)
    }
    console.log()
  }

  console.log(theme.dim("  Commands: aegis predict risk [type] | forecast | status"))
  console.log()
}

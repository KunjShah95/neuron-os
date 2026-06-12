/**
 * cost-forecaster — Predictive Agent System (v0.15.0+).
 *
 * Projects future spending based on historical cost patterns from the
 * billing tracker and experience store. Answers questions like:
 *   - "At this rate, when will I exceed my budget?"
 *   - "How much will I spend in the next 7/30 days?"
 *   - "Which agent types are driving my costs?"
 *
 * Usage:
 *   const forecast = CostForecaster.forecast()
 *   console.log(`Budget exhausted in ~${forecast.daysUntilExhaustion} days`)
 */

// Logger imported for future debug use
import { createLogger } from "../cli/logger"; void createLogger("cost-forecaster")

// ── Types ──────────────────────────────────────────────────────────────

export interface ForecastResult {
  /** Current total spend in USD */
  totalSpend: number
  /** Budget limit in USD */
  budgetLimit: number
  /** Remaining budget in USD */
  remainingBudget: number
  /** Average daily spend in USD (based on trailing window) */
  avgDailySpend: number
  /** Estimated days until budget is exhausted (-1 if no budget or negative) */
  daysUntilExhaustion: number
  /** Estimated exhaustion date (ISO string) or "never" */
  estimatedExhaustionDate: string
  /** Projected 7-day cost in USD */
  projected7Day: number
  /** Projected 30-day cost in USD */
  projected30Day: number
  /** Confidence level of the projection */
  confidence: "high" | "medium" | "low"
  /** Cost trend direction */
  trend: "increasing" | "stable" | "decreasing"
  /** Breakdown by agent type if available */
  byAgentType: Array<{
    agentType: string
    totalCost: number
    percentage: number
    avgCostPerSpawn: number
  }>
  /** Key insights generated from the data */
  insights: string[]
}

// ── CostForecaster ─────────────────────────────────────────────────────

export class CostForecaster {
  /**
   * Generate a cost forecast based on historical data.
   * Requires minimum 3 days of data for meaningful projections.
   */
  static async forecast(days?: number): Promise<ForecastResult> {
    const windowDays = days ?? 14
    const insights: string[] = []

    // ── Load data ─────────────────────────────────────────────────────
    let history: Array<{ date: string; totalCost: number }> = []
    let totalSpend = 0
    let budgetLimit = 50

    try {
      const { billingTracker } = await import("../billing/tracker")
      history = billingTracker.getCostHistory(windowDays)
      totalSpend = billingTracker.getTotalSpend()
      budgetLimit = billingTracker.getBudgetLimit()
    } catch {
      // Billing tracker not available — use defaults
    }

    const remainingBudget = Math.max(0, budgetLimit - totalSpend)

    // ── Compute averages and trends ───────────────────────────────────
    const daysWithData = history.length
    const recentDays = history.slice(-7)
    const olderDays = history.slice(0, Math.max(0, history.length - 7))

    const avgDailySpend =
      daysWithData > 0
        ? history.reduce((sum, h) => sum + h.totalCost, 0) / daysWithData
        : 0

    // Trend: compare recent 7-day avg to older period
    const recentAvg =
      recentDays.length > 0
        ? recentDays.reduce((sum, h) => sum + h.totalCost, 0) / recentDays.length
        : 0
    const olderAvg =
      olderDays.length > 0
        ? olderDays.reduce((sum, h) => sum + h.totalCost, 0) / olderDays.length
        : recentAvg // If no older data, assume stable

    let trend: "increasing" | "stable" | "decreasing"
    if (recentAvg > olderAvg * 1.15) {
      trend = "increasing"
    } else if (recentAvg < olderAvg * 0.85) {
      trend = "decreasing"
    } else {
      trend = "stable"
    }

    // ── Projections ───────────────────────────────────────────────────
    // Use the MORE CONSERVATIVE of recent avg or overall avg for projection
    const projectionAvg = Math.max(recentAvg, avgDailySpend)
    const projected7Day = projectionAvg * 7
    const projected30Day = projectionAvg * 30

    // Days until exhaustion
    let daysUntilExhaustion = -1
    let estimatedExhaustionDate = "never"

    if (budgetLimit > 0 && projectionAvg > 0) {
      daysUntilExhaustion = remainingBudget / projectionAvg
      if (daysUntilExhaustion > 0 && isFinite(daysUntilExhaustion)) {
        const exhaustionDate = new Date(
          Date.now() + daysUntilExhaustion * 24 * 60 * 60 * 1000,
        )
        estimatedExhaustionDate = exhaustionDate.toISOString().slice(0, 10)
      }
    }

    // Confidence
    let confidence: "high" | "medium" | "low"
    if (daysWithData >= 14) {
      confidence = "high"
    } else if (daysWithData >= 7) {
      confidence = "medium"
    } else {
      confidence = "low"
    }

    // ── Agent type breakdown ──────────────────────────────────────────
    const byAgentType: ForecastResult["byAgentType"] = []
    try {
      const { experienceStore } = await import("../experience/store")
      const recent = experienceStore.listRecent(200)
      const typeCosts = new Map<string, { cost: number; count: number }>()

      for (const exp of recent) {
        let cost = 0
        try {
          const metrics = JSON.parse(exp.metrics || "{}")
          cost = metrics.cost_usd ?? metrics.cost ?? 0
        } catch {
          // noop
        }
        const existing = typeCosts.get(exp.agentType) ?? { cost: 0, count: 0 }
        existing.cost += cost
        existing.count++
        typeCosts.set(exp.agentType, existing)
      }

      const totalKnownCost = Array.from(typeCosts.values()).reduce(
        (sum, t) => sum + t.cost,
        0,
      )

      for (const [agentType, data] of typeCosts) {
        byAgentType.push({
          agentType,
          totalCost: data.cost,
          percentage:
            totalKnownCost > 0
              ? Math.round((data.cost / totalKnownCost) * 100)
              : 0,
          avgCostPerSpawn: data.count > 0 ? data.cost / data.count : 0,
        })
      }
      byAgentType.sort((a, b) => b.totalCost - a.totalCost)
    } catch {
      // Experience store not available
    }

    // ── Generate insights ─────────────────────────────────────────────
    if (daysUntilExhaustion > 0 && daysUntilExhaustion <= 7) {
      insights.push(
        `⚠️ Budget will be exhausted in ~${Math.round(daysUntilExhaustion)} days (${estimatedExhaustionDate}). Consider reducing provider tier or increasing budget.`,
      )
    } else if (daysUntilExhaustion > 0 && daysUntilExhaustion <= 30) {
      insights.push(
        `📊 Budget will be exhausted in ~${Math.round(daysUntilExhaustion)} days (${estimatedExhaustionDate}). Current burn rate: $${avgDailySpend.toFixed(4)}/day.`,
      )
    } else if (daysUntilExhaustion > 30) {
      insights.push(
        `✅ Budget should last ~${Math.round(daysUntilExhaustion)} days at current burn rate.`,
      )
    }

    if (trend === "increasing") {
      insights.push(
        `📈 Spend is trending upward (recent avg: $${recentAvg.toFixed(4)}/day vs older: $${olderAvg.toFixed(4)}/day).`,
      )
    } else if (trend === "decreasing") {
      insights.push(
        `📉 Spend is trending downward — good sign!`,
      )
    }

    if (byAgentType.length > 0) {
      const topCost = byAgentType[0] as (typeof byAgentType)[0]
      if (topCost.percentage > 50) {
        insights.push(
          `🎯 Agent type "${topCost.agentType}" accounts for ${topCost.percentage}% of total cost.`,
        )
      }
    }

    if (confidence === "low") {
      insights.push(
        `📋 Forecast has low confidence (only ${daysWithData} days of data). More data improves accuracy.`,
      )
    }

    return {
      totalSpend,
      budgetLimit,
      remainingBudget,
      avgDailySpend,
      daysUntilExhaustion,
      estimatedExhaustionDate,
      projected7Day,
      projected30Day,
      confidence,
      trend,
      byAgentType,
      insights,
    }
  }

  /** Quick check: are we on track to exhaust budget within N days? */
  static async willExhaustWithin(days: number): Promise<boolean> {
    try {
      const forecast = await CostForecaster.forecast()
      return (
        forecast.daysUntilExhaustion > 0 &&
        forecast.daysUntilExhaustion <= days
      )
    } catch {
      return false
    }
  }
}

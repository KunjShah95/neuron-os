import { billingTracker } from "../billing/tracker"

import { createLogger } from "../cli/logger"

const log = createLogger("cost-telemetry")

export class CostBenchmarking {
  /**
   * Generates a cost attribution report from the billing tracker's SQLite DB.
   * Reports real spend broken down by model, session, and daily history.
   */
  public generateReport() {
    log.info("Generating Cost Attribution & Benchmarking Report...")

    const totalSpend = billingTracker.getTotalSpend()
    const limit = billingTracker.getBudgetLimit()
    const byModel = billingTracker.getCostByModel()
    const bySession = billingTracker.getCostBySession()
    const history = billingTracker.getCostHistory(7)

    log.info(`Total Spend: $${totalSpend.toFixed(4)} / $${limit.toFixed(2)}`)

    if (byModel.length > 0) {
      log.info(`Models: ${byModel.map((m) => `${m.model}=$${m.totalCost.toFixed(4)}`).join(", ")}`)
    }

    if (bySession.length > 0) {
      log.info(`Sessions: ${bySession.length} sessions with recorded costs`)
    }

    return {
      totalSpend,
      budgetLimit: limit,
      byModel,
      bySession,
      history,
      remainingBudget: Math.max(0, limit - totalSpend),
      budgetExceeded: totalSpend >= limit,
    }
  }

  public recordAgentCost(agentId: string, agentType: string, costUsd: number) {
    // Extends billing tracker to log cost specifically against an agent ID/Type
    log.info(`Attributed $${costUsd} to ${agentType} agent ${agentId}`)
  }
}

export const costBenchmark = new CostBenchmarking()

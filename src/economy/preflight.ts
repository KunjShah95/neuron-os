import { experienceStore } from "../experience/store"
import { billingTracker } from "../billing/tracker"
import { predictCost, type TaskProfile } from "./predictor"

export interface PreflightRequest {
  goal: string
  agentType?: string
  estimatedTokens?: number
  preferredTier?: "cheap" | "balanced" | "premium"
}

export interface PreflightEstimate {
  estimatedCost: number
  budgetLimit: number
  totalSpent: number
  remainingBudget: number
  wouldExceedBudget: boolean
  similarTasks: Array<{
    goal: string
    outcome: string
    cost: number
  }>
  recommendation: "proceed" | "warn" | "block"
  reasoning: string
}

const AGENT_TYPE_COMPLEXITY: Record<string, TaskProfile["complexity"]> = {
  read: "simple",
  build: "complex",
}

export class PreflightEstimator {
  static estimate(request: PreflightRequest): PreflightEstimate {
    const { goal, agentType = "build", estimatedTokens = 3000, preferredTier = "balanced" } = request

    const similar = experienceStore.searchByGoalSimilarity(goal, 10)

    const similarTasks: Array<{ goal: string; outcome: string; cost: number }> = []
    let avgHistoricalCost = 0

    for (const exp of similar) {
      let cost = 0
      try {
        const metrics = JSON.parse(exp.metrics)
        cost = metrics.cost_usd ?? metrics.cost ?? 0
      } catch {
        // No cost data in metrics
      }
      similarTasks.push({ goal: exp.goal, outcome: exp.outcome, cost })
      avgHistoricalCost += cost
    }

    if (similarTasks.length > 0) {
      avgHistoricalCost /= similarTasks.length
    }

    const complexity = AGENT_TYPE_COMPLEXITY[agentType] ?? "moderate"

    const costEstimate = predictCost({
      inputTokens: Math.round(estimatedTokens * 0.6),
      outputTokens: Math.round(estimatedTokens * 0.4),
      tools: [],
      toolCalls: 0,
      complexity,
    })

    const freshCost = costEstimate[preferredTier]

    const estimatedCost = similarTasks.length > 0 ? freshCost * 0.6 + avgHistoricalCost * 0.4 : freshCost

    const totalSpent = billingTracker.getTotalSpend()
    const budgetLimit = billingTracker.getBudgetLimit()
    const remainingBudget = Math.max(0, budgetLimit - totalSpent)
    const wouldExceedBudget = estimatedCost > remainingBudget

    const result: PreflightEstimate = {
      estimatedCost,
      budgetLimit,
      totalSpent,
      remainingBudget,
      wouldExceedBudget,
      similarTasks,
      recommendation: "proceed",
      reasoning: "",
    }

    return PreflightEstimator.checkThresholds(result)
  }

  static checkThresholds(
    estimate: PreflightEstimate,
    thresholds?: {
      warnAt?: number
      blockAt?: number
    },
  ): PreflightEstimate {
    const warnAt = thresholds?.warnAt ?? 0.5
    const blockAt = thresholds?.blockAt ?? 5.0

    if (estimate.wouldExceedBudget) {
      return {
        ...estimate,
        recommendation: "block",
        reasoning: `Estimated cost $${estimate.estimatedCost.toFixed(4)} exceeds remaining budget $${estimate.remainingBudget.toFixed(4)}`,
      }
    }

    if (estimate.estimatedCost > blockAt) {
      return {
        ...estimate,
        recommendation: "block",
        reasoning: `Estimated cost $${estimate.estimatedCost.toFixed(4)} exceeds block threshold of $${blockAt.toFixed(2)}`,
      }
    }

    if (estimate.estimatedCost > warnAt) {
      return {
        ...estimate,
        recommendation: "warn",
        reasoning: `Estimated cost $${estimate.estimatedCost.toFixed(4)} exceeds warn threshold of $${warnAt.toFixed(2)}`,
      }
    }

    return {
      ...estimate,
      recommendation: "proceed",
      reasoning: `Estimated cost $${estimate.estimatedCost.toFixed(4)} is within all thresholds`,
    }
  }
}

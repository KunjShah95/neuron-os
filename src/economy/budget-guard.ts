import type { BudgetStatus } from "./types"

export class BudgetGuard {
  private budgetUsd: number
  private spentUsd: number
  private estimatedRemainingCost: number

  constructor(budgetUsd: number) {
    this.budgetUsd = budgetUsd
    this.spentUsd = 0
    this.estimatedRemainingCost = 0
  }

  get remaining(): number {
    return Math.max(0, this.budgetUsd - this.spentUsd)
  }

  get spent(): number {
    return this.spentUsd
  }

  recordSpend(amount: number): void {
    this.spentUsd += amount
  }

  setEstimatedRemainingCost(cost: number): void {
    this.estimatedRemainingCost = cost
  }

  status(): BudgetStatus {
    const remaining = this.remaining
    const overBudget = remaining <= 0

    let recommendation: "continue" | "skip_optional" | "abort"
    if (overBudget) {
      recommendation = "abort"
    } else if (this.spentUsd > 0 && this.estimatedRemainingCost > remaining) {
      recommendation = "skip_optional"
    } else if (remaining / this.budgetUsd < 0.2) {
      recommendation = "skip_optional"
    } else {
      recommendation = "continue"
    }

    return {
      budget_usd: this.budgetUsd,
      spent_usd: this.spentUsd,
      remaining_usd: remaining,
      estimated_remaining_cost_usd: this.estimatedRemainingCost,
      over_budget: overBudget,
      recommendation,
    }
  }

  reset(newBudget?: number): void {
    if (newBudget !== undefined) this.budgetUsd = newBudget
    this.spentUsd = 0
    this.estimatedRemainingCost = 0
  }
}

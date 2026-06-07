import type { BudgetConfig, BudgetStatus, BudgetTier, TestCase } from "./types"

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BudgetExceededError"
  }
}

export interface BudgetControllerConfig extends BudgetConfig {
  /** Tiered models to try (cheapest first) */
  tieredModels?: BudgetTier[]
}

export class BudgetController {
  private spent: number = 0
  private config: BudgetControllerConfig

  constructor(config: Partial<BudgetControllerConfig> = {}) {
    this.config = {
      maxCostUsd: config.maxCostUsd ?? 5.0,
      maxCostPerTest: config.maxCostPerTest ?? 0.5,
      warnAtPercent: config.warnAtPercent ?? 0.8,
      tieredModels: config.tieredModels ?? [
        { model: "deepseek-v3", maxCostUsd: 0.5, weight: 1, fallbackOnFailure: true },
        { model: "gpt-4o-mini", maxCostUsd: 1.0, weight: 2, fallbackOnFailure: true },
        { model: "claude-sonnet-4-6", maxCostUsd: 3.0, weight: 3 },
      ],
    }
  }

  /**
   * Execute a function with budget tracking. Throws BudgetExceededError if budget exhausted.
   * The costFn is called after execution to report the actual cost incurred.
   */
  async runWithBudget<T>(
    label: string,
    estimatedCost: number,
    fn: () => Promise<T>,
    costFn?: () => number,
  ): Promise<{ result: T; cost: number }> {
    if (this.spent + estimatedCost > this.config.maxCostUsd) {
      throw new BudgetExceededError(
        `Budget exhausted for "${label}": $${this.spent.toFixed(2)} used >= $${this.config.maxCostUsd.toFixed(2)} limit`,
      )
    }

    const result = await fn()
    const actualCost = costFn ? costFn() : 0
    this.recordCost(actualCost)

    if (actualCost > this.config.maxCostPerTest) {
      console.warn(
        `[BUDGET] Test "${label}" exceeded per-test budget: $${actualCost.toFixed(2)} > $${this.config.maxCostPerTest.toFixed(2)}`,
      )
    }

    return { result, cost: actualCost }
  }

  /**
   * Select the best affordable model for a test given remaining budget.
   */
  selectModelForTest(test: TestCase, budgetRemaining: number): string {
    const preferred = test.model
    if (preferred) return preferred

    const affordable = (this.config.tieredModels ?? [])
      .filter(t => t.maxCostUsd <= budgetRemaining)
      .sort((a, b) => a.maxCostUsd - b.maxCostUsd)

    return affordable[0]?.model ?? this.config.tieredModels?.[this.config.tieredModels.length - 1]?.model ?? "claude-sonnet-4-6"
  }

  /**
   * Record actual cost spent (call this after a test completes).
   */
  recordCost(cost: number): void {
    this.spent += cost
    const percent = this.spent / this.config.maxCostUsd
    if (percent >= this.config.warnAtPercent) {
      console.warn(
        `[BUDGET] ${(percent * 100).toFixed(0)}% of budget used: $${this.spent.toFixed(2)} / $${this.config.maxCostUsd.toFixed(2)}`,
      )
    }
  }

  getBudgetStatus(): BudgetStatus {
    return {
      spent: this.spent,
      remaining: this.config.maxCostUsd - this.spent,
      percentUsed: this.spent / this.config.maxCostUsd,
    }
  }

  reset(): void {
    this.spent = 0
  }
}

import { describe, it, expect } from "bun:test"
import { PreflightEstimator, type PreflightEstimate } from "./preflight"

function makeEstimate(overrides: Partial<PreflightEstimate> = {}): PreflightEstimate {
  return {
    estimatedCost: 1,
    budgetLimit: 50,
    totalSpent: 0,
    remainingBudget: 50,
    wouldExceedBudget: false,
    similarTasks: [],
    recommendation: "proceed",
    reasoning: "",
    ...overrides,
  }
}

describe("PreflightEstimator.checkThresholds", () => {
  it("does not hard block a task that fits inside the remaining budget", () => {
    const result = PreflightEstimator.checkThresholds(makeEstimate({ estimatedCost: 6 }))

    expect(result.recommendation).toBe("warn")
    expect(result.recommendation).not.toBe("block")
  })

  it("scales the warn threshold to the remaining budget", () => {
    const result = PreflightEstimator.checkThresholds(makeEstimate({ estimatedCost: 6 }))

    expect(result.reasoning).toContain("$5.00")
  })

  it("scales the block threshold to the remaining budget", () => {
    const result = PreflightEstimator.checkThresholds(makeEstimate({ estimatedCost: 30 }))

    expect(result.recommendation).toBe("block")
    expect(result.reasoning).toContain("$25.00")
  })

  it("uses the remaining budget rather than the full limit", () => {
    const result = PreflightEstimator.checkThresholds(
      makeEstimate({ estimatedCost: 3, budgetLimit: 50, totalSpent: 45, remainingBudget: 5 }),
    )

    expect(result.recommendation).toBe("block")
    expect(result.reasoning).toContain("$2.50")
  })

  it("keeps working with explicit absolute thresholds", () => {
    const warned = PreflightEstimator.checkThresholds(makeEstimate({ estimatedCost: 1 }), { warnAt: 0.5, blockAt: 5 })
    expect(warned.recommendation).toBe("warn")

    const blocked = PreflightEstimator.checkThresholds(makeEstimate({ estimatedCost: 10 }), { warnAt: 0.5, blockAt: 5 })
    expect(blocked.recommendation).toBe("block")
  })

  it("still blocks when the estimate exceeds the remaining budget", () => {
    const result = PreflightEstimator.checkThresholds(
      makeEstimate({
        estimatedCost: 0.3,
        budgetLimit: 10,
        totalSpent: 9.9,
        remainingBudget: 0.1,
        wouldExceedBudget: true,
      }),
    )

    expect(result.recommendation).toBe("block")
    expect(result.reasoning).toContain("remaining budget")
  })

  it("proceeds for a cheap task", () => {
    const result = PreflightEstimator.checkThresholds(makeEstimate({ estimatedCost: 0.01 }))

    expect(result.recommendation).toBe("proceed")
  })
})

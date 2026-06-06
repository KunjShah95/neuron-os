import { describe, it, expect } from "bun:test"
import { PreflightEstimator } from "./preflight"

describe("PreflightEstimator", () => {
  it("returns proceed for cheap task within budget", () => {
    const result = PreflightEstimator.estimate({
      goal: "fix a simple typo in a comment",
      agentType: "read",
      estimatedTokens: 100,
    })
    expect(result.recommendation).toBe("proceed")
    expect(result.estimatedCost).toBeGreaterThan(0)
    expect(result.wouldExceedBudget).toBe(false)
  })

  it("returns warn for costly task above warn threshold", () => {
    const result = PreflightEstimator.checkThresholds(
      {
        estimatedCost: 1.0,
        budgetLimit: 50,
        totalSpent: 0,
        remainingBudget: 50,
        wouldExceedBudget: false,
        similarTasks: [],
        recommendation: "proceed",
        reasoning: "",
      },
      { warnAt: 0.5, blockAt: 5.0 },
    )
    expect(result.recommendation).toBe("warn")
  })

  it("blocks when estimated cost exceeds block threshold", () => {
    const result = PreflightEstimator.checkThresholds(
      {
        estimatedCost: 10.0,
        budgetLimit: 50,
        totalSpent: 0,
        remainingBudget: 50,
        wouldExceedBudget: false,
        similarTasks: [],
        recommendation: "proceed",
        reasoning: "",
      },
      { warnAt: 0.5, blockAt: 5.0 },
    )
    expect(result.recommendation).toBe("block")
  })

  it("blocks when would exceed budget even if under thresholds", () => {
    const result = PreflightEstimator.checkThresholds(
      {
        estimatedCost: 0.3,
        budgetLimit: 10,
        totalSpent: 9.9,
        remainingBudget: 0.1,
        wouldExceedBudget: true,
        similarTasks: [],
        recommendation: "proceed",
        reasoning: "",
      },
      { warnAt: 0.5, blockAt: 5.0 },
    )
    expect(result.recommendation).toBe("block")
  })

  it("searches experience store for similar tasks", () => {
    const result = PreflightEstimator.estimate({
      goal: "implement a new feature",
      agentType: "build",
    })
    expect(Array.isArray(result.similarTasks)).toBe(true)
    expect(result.estimatedCost).toBeGreaterThan(0)
  })
})

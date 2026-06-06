import { describe, it, expect } from "bun:test"
import { BudgetGuard } from "./budget-guard"

describe("BudgetGuard", () => {
  it("starts with full budget", () => {
    const g = new BudgetGuard(1.0)
    expect(g.remaining).toBe(1.0)
    expect(g.spent).toBe(0)
  })

  it("tracks spend correctly", () => {
    const g = new BudgetGuard(1.0)
    g.recordSpend(0.3)
    g.recordSpend(0.2)
    expect(g.spent).toBe(0.5)
    expect(g.remaining).toBeCloseTo(0.5, 10)
  })

  it("recommends abort when over budget", () => {
    const g = new BudgetGuard(1.0)
    g.recordSpend(1.5)
    expect(g.status().recommendation).toBe("abort")
    expect(g.status().over_budget).toBe(true)
  })

  it("recommends skip_optional when under 20% remaining", () => {
    const g = new BudgetGuard(1.0)
    g.recordSpend(0.85)
    expect(g.status().recommendation).toBe("skip_optional")
  })

  it("recommends skip_optional when estimated remaining exceeds budget", () => {
    const g = new BudgetGuard(1.0)
    g.recordSpend(0.3)
    g.setEstimatedRemainingCost(1.0)
    expect(g.status().recommendation).toBe("skip_optional")
  })

  it("resets correctly", () => {
    const g = new BudgetGuard(1.0)
    g.recordSpend(0.5)
    g.reset(2.0)
    expect(g.spent).toBe(0)
    expect(g.remaining).toBe(2.0)
  })
})

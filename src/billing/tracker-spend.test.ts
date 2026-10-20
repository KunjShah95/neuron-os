import { describe, it, expect, beforeEach } from "bun:test"
import { BillingTracker } from "./tracker"

describe("BillingTracker total spend", () => {
  let tracker: BillingTracker

  beforeEach(() => {
    tracker = new BillingTracker({ dbPath: ":memory:" })
  })

  it("counts tool spend in the total spend", () => {
    tracker.recordUsage("session-1", "gpt-4o", 1000, 500)
    tracker.recordToolUsage("session-1", "web_search", 0.25, "agent-1")

    expect(tracker.getToolSpend()).toBeCloseTo(0.25, 6)
    expect(tracker.getTotalSpend()).toBeCloseTo(tracker.getModelSpend() + 0.25, 6)
    expect(tracker.getTotalSpend()).toBeGreaterThan(0.25)
  })

  it("returns the tool spend when there is no model usage", () => {
    tracker.recordToolUsage("session-1", "web_fetch", 1.5, "agent-1")

    expect(tracker.getModelSpend()).toBe(0)
    expect(tracker.getTotalSpend()).toBeCloseTo(1.5, 6)
  })

  it("counts tool spend against the budget limit", () => {
    tracker.recordToolUsage("session-1", "execute_code", 2.0, "agent-1")
    tracker.setBudgetLimit(1.0)

    expect(tracker.hasExceededBudget()).toBe(true)

    tracker.setBudgetLimit(10.0)
    expect(tracker.hasExceededBudget()).toBe(false)
  })

  it("includes tool spend in the daily cost history", () => {
    tracker.recordUsage("session-1", "gpt-4o", 1000, 500)
    tracker.recordToolUsage("session-1", "web_search", 0.75, "agent-1")

    const history = tracker.getCostHistory(7)
    const total = history.reduce((sum, row) => sum + row.totalCost, 0)

    expect(history.length).toBeGreaterThan(0)
    expect(total).toBeCloseTo(tracker.getTotalSpend(), 6)
  })
})

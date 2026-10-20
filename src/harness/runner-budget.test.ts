import { describe, it, expect } from "bun:test"
import { withBudgetController, countRunTokens } from "./runner"
import { BudgetController } from "./budget-controller"
import type { ToolTrace } from "./types"

describe("withBudgetController", () => {
  it("keeps the suite budget controller for every attempt", () => {
    const controller = new BudgetController({ maxCostUsd: 10 })

    const attempt = withBudgetController(undefined, controller)
    const retry = withBudgetController(attempt, controller)

    expect(attempt.budgetController).toBe(controller)
    expect(retry.budgetController).toBe(controller)
  })

  it("preserves the other runner configuration", () => {
    const controller = new BudgetController({ maxCostUsd: 10 })

    const attempt = withBudgetController({ runnerConfig: { timeout: 5000 } }, controller)

    expect(attempt.runnerConfig?.timeout).toBe(5000)
    expect(attempt.budgetController).toBe(controller)
  })
})

describe("countRunTokens", () => {
  it("counts the tokens of the agent output", () => {
    expect(countRunTokens("hello world", [])).toBe(3)
  })

  it("adds the token cost carried by the tool traces", () => {
    const traces: ToolTrace[] = [
      { name: "bash", params: {}, result: "ok", durationMs: 1, tokenCost: 40 },
      { name: "read", params: {}, result: "ok", durationMs: 1, tokenCost: 60 },
    ]

    expect(countRunTokens("hello world", traces)).toBe(103)
  })
})

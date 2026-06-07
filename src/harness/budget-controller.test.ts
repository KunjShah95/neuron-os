import { describe, it, expect, beforeEach, spyOn } from "bun:test"
import { BudgetController, BudgetExceededError } from "./budget-controller"
import type { TestCase } from "./types"

const baseTest: TestCase = {
  id: "test-1",
  name: "Test 1",
  prompt: "do something",
  tags: [],
  timeout: 30000,
}

describe("BudgetController", () => {
  let controller: BudgetController

  beforeEach(() => {
    controller = new BudgetController({
      maxCostUsd: 10.0,
      maxCostPerTest: 2.0,
      warnAtPercent: 0.8,
      tieredModels: [
        { model: "cheap-model", maxCostUsd: 0.5, weight: 1 },
        { model: "mid-model", maxCostUsd: 1.5, weight: 2 },
        { model: "expensive-model", maxCostUsd: 5.0, weight: 3 },
      ],
    })
  })

  // ── Default Config ──────────────────────────────────────────

  it("should use sensible defaults when no config provided", () => {
    const c = new BudgetController()
    const status = c.getBudgetStatus()
    // Default maxCostUsd = 5.0
    expect(status.remaining).toBe(5.0)
    expect(status.spent).toBe(0)
  })

  // ── runWithBudget ───────────────────────────────────────────

  it("should run a function and track its cost via costFn", async () => {
    const { result, cost } = await controller.runWithBudget(
      "test-op",
      0.1,
      () => Promise.resolve("done"),
      () => 0.05,
    )

    expect(result).toBe("done")
    expect(cost).toBe(0.05)

    const status = controller.getBudgetStatus()
    expect(status.spent).toBe(0.05)
  })

  it("should record zero cost when costFn is not provided", async () => {
    const { result, cost } = await controller.runWithBudget(
      "zero-cost",
      0.1,
      () => Promise.resolve("ok"),
    )

    expect(result).toBe("ok")
    expect(cost).toBe(0)
  })

  it("should throw BudgetExceededError when budget is exhausted", async () => {
    // Spend all but $0.05
    controller.recordCost(9.95)

    expect(
      controller.runWithBudget("over-budget", 0.1, () => Promise.resolve("nope")),
    ).rejects.toThrow(BudgetExceededError)
  })

  it("should warn when per-test cost exceeds maxCostPerTest", async () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    await controller.runWithBudget("expensive-test", 0.1, () => Promise.resolve("x"), () => 3.0)

    expect(warnSpy).toHaveBeenCalled()
    expect(warnSpy.mock.calls[0][0]).toContain("exceeded per-test budget")

    warnSpy.mockRestore()
  })

  // ── selectModelForTest ──────────────────────────────────────

  it("should return the test's preferred model if set", () => {
    const test = { ...baseTest, model: "preferred-model" }
    const model = controller.selectModelForTest(test, 10.0)
    expect(model).toBe("preferred-model")
  })

  it("should select the cheapest affordable model when no preference", () => {
    const model = controller.selectModelForTest(baseTest, 1.0)
    // cheap-model costs 0.5 and is within 1.0 budget
    expect(model).toBe("cheap-model")
  })

  it("should fall back to the most expensive model when none is affordable", () => {
    // All tiers have maxCostUsd > 0, so this tests budget remaining > tier cost
    const model = controller.selectModelForTest(baseTest, 0)
    // None affordable (all cost > 0), should return last tier
    expect(model).toBe("expensive-model")
  })

  it("should select mid-tier model when cheap is unaffordable", () => {
    // Create controller with higher cheap model cost
    const c = new BudgetController({
      maxCostUsd: 10,
      tieredModels: [
        { model: "cheap", maxCostUsd: 3.0, weight: 1 },
        { model: "mid", maxCostUsd: 1.0, weight: 2 },
      ],
    })
    // With remaining budget of 1.5, cheap (3.0) is too expensive, mid (1.0) is affordable
    const model = c.selectModelForTest(baseTest, 1.5)
    expect(model).toBe("mid")
  })

  // ── recordCost ──────────────────────────────────────────────

  it("should increment spent when recording cost", () => {
    controller.recordCost(1.0)
    expect(controller.getBudgetStatus().spent).toBe(1.0)

    controller.recordCost(2.5)
    expect(controller.getBudgetStatus().spent).toBe(3.5)
  })

  it("should warn when spending passes the warn threshold", () => {
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    // Spend 8.0 of 10.0 = 80% → exactly at threshold
    controller.recordCost(8.0)
    expect(warnSpy).toHaveBeenCalled()
    expect(warnSpy.mock.calls[0][0]).toContain("80%")

    warnSpy.mockRestore()
  })

  // ── getBudgetStatus ─────────────────────────────────────────

  it("should return correct budget status", () => {
    controller.recordCost(3.0)
    const status = controller.getBudgetStatus()

    expect(status.spent).toBe(3.0)
    expect(status.remaining).toBe(7.0)
    expect(status.percentUsed).toBe(0.3)
  })

  // ── reset ───────────────────────────────────────────────────

  it("should reset spent to zero", () => {
    controller.recordCost(8.0)
    expect(controller.getBudgetStatus().spent).toBe(8.0)

    controller.reset()
    expect(controller.getBudgetStatus().spent).toBe(0)
  })
})

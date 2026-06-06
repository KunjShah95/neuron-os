import { describe, it, expect } from "bun:test"
import { route, estimateModelCost, NoViableProviderError, estimateCost } from "./cost-router"

describe("cost-router", () => {
  it("routes to cheapest model within budget", () => {
    const result = route({
      inputTokens: 500,
      outputTokens: 200,
      budget: 0.50,
    })
    expect(result.selected).toBeDefined()
    expect(result.selected_model).toBeDefined()
    expect(result.cheap).toBeLessThan(result.premium)
  })

  it("throws when no provider meets quality + budget", () => {
    expect(() => route({
      inputTokens: 100_000,
      outputTokens: 50_000,
      budget: 0.001,
      minQuality: 0.95,
    })).toThrow(NoViableProviderError)
  })

  it("prefers preferred tier when specified", () => {
    const result = route({
      inputTokens: 500,
      outputTokens: 200,
      budget: 1.0,
      preferredTier: "premium",
    })
    expect(result.selected).toBe("premium")
  })

  it("estimates cost for a task", () => {
    const result = estimateCost({
      inputTokens: 1000,
      outputTokens: 500,
      tools: ["web_search"],
      toolCalls: 3,
    })
    expect(result.cheap).toBeGreaterThan(0)
    expect(result.premium).toBeGreaterThan(result.cheap)
  })

  it("estimateModelCost returns finite values", () => {
    const cost = estimateModelCost("claude-sonnet-4-6", 1000, 500)
    expect(cost).toBeGreaterThan(0)
    expect(cost).toBeLessThan(100)
  })

  it("estimateModelCost returns Infinity for unknown model", () => {
    const cost = estimateModelCost("nonexistent", 1000, 500)
    expect(cost).toBe(Infinity)
  })
})

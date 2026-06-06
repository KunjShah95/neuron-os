import { describe, it, expect } from "bun:test"
import { predictCost } from "./predictor"

describe("predictor", () => {
  it("predicts cost for a simple task", () => {
    const result = predictCost({
      inputTokens: 500,
      outputTokens: 200,
      tools: [],
      toolCalls: 0,
      complexity: "simple",
    })
    expect(result.cheap).toBeGreaterThan(0)
    expect(result.balanced).toBeGreaterThan(result.cheap)
    expect(result.premium).toBeGreaterThan(result.balanced)
  })

  it("scales with complexity", () => {
    const simple = predictCost({
      inputTokens: 500, outputTokens: 200, tools: [], toolCalls: 0, complexity: "simple",
    })
    const complex = predictCost({
      inputTokens: 500, outputTokens: 200, tools: [], toolCalls: 0, complexity: "complex",
    })
    expect(complex.cheap).toBeGreaterThan(simple.cheap)
  })
})

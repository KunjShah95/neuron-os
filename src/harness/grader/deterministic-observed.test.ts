import { describe, it, expect } from "bun:test"
import {
  exitCodeGrader,
  tokenBudgetGrader,
  readRunObservation,
  countToolSteps,
  RUN_OBSERVATION_TRACE,
} from "./deterministic"
import type { GraderContext } from "./types"

function observedContext(params: Record<string, unknown>, extraTrace: GraderContext["trace"] = []): GraderContext {
  return {
    testId: "test-1",
    testName: "Test 1",
    trace: [
      { name: "bash", params: {}, result: "hello" },
      { name: RUN_OBSERVATION_TRACE, params, result: "" },
      ...(extraTrace ?? []),
    ],
  }
}

describe("exitCodeGrader with observed data", () => {
  it("passes when the observed exit code matches", () => {
    const context = observedContext({ exitCode: 0, totalTokens: 100 })
    const result = exitCodeGrader({ expected: 0 }, context)

    expect(result.score).toBe(1.0)
    expect(result.details).toContain("matched")
  })

  it("fails when the observed exit code does not match", () => {
    const context = observedContext({ exitCode: 1, totalTokens: 100 })
    const result = exitCodeGrader({ expected: 0 }, context)

    expect(result.score).toBe(0.0)
    expect(result.details).toContain("did not match")
  })

  it("stays neutral when no exit code was observed", () => {
    const result = exitCodeGrader({ expected: 0 })

    expect(result.score).toBe(0.5)
    expect(result.details).toContain("NOT VERIFIED")
  })

  it("runs the configured command when no exit code was observed", () => {
    const result = exitCodeGrader({ expected: 0, command: `${process.execPath} -e "process.exit(0)"` })

    expect(result.score).toBe(1.0)
  })

  it("reports a non-zero command exit code as a failure", () => {
    const result = exitCodeGrader({ expected: 0, command: `${process.execPath} -e "process.exit(3)"` })

    expect(result.score).toBe(0.0)
    expect(result.details).toContain("3")
  })
})

describe("tokenBudgetGrader with observed data", () => {
  it("scores high when the observed token count is within the budget", () => {
    const context = observedContext({ totalTokens: 100 })
    const result = tokenBudgetGrader({ maxTokens: 1000 }, context)

    expect(result.score).toBeGreaterThan(0.9)
    expect(result.details).toContain("100 tokens")
  })

  it("fails when the observed token count exceeds the budget", () => {
    const context = observedContext({ totalTokens: 5000 })
    const result = tokenBudgetGrader({ maxTokens: 1000 }, context)

    expect(result.score).toBe(0.3)
    expect(result.details).toContain("exceeded limit")
  })

  it("stays neutral when no token count was observed", () => {
    const result = tokenBudgetGrader({ maxTokens: 1000 })

    expect(result.score).toBe(0.5)
    expect(result.details).toContain("NOT VERIFIED")
  })

  it("sums token costs carried by the trace", () => {
    const context: GraderContext = {
      testId: "test-1",
      testName: "Test 1",
      trace: [
        { name: "bash", params: {}, result: "ok", tokenCost: 120 } as never,
        { name: "read", params: {}, result: "ok", tokenCost: 80 } as never,
      ],
    }

    const result = tokenBudgetGrader({ maxTokens: 1000 }, context)

    expect(result.score).toBeGreaterThan(0.9)
    expect(result.details).toContain("200 tokens")
  })
})

describe("run observation helpers", () => {
  it("reads the observed exit code and token count", () => {
    const observation = readRunObservation(observedContext({ exitCode: 2, totalTokens: 42 }))

    expect(observation.exitCode).toBe(2)
    expect(observation.totalTokens).toBe(42)
  })

  it("does not count the observation entry as a tool step", () => {
    const context = observedContext({ totalTokens: 10 })

    expect(countToolSteps(context)).toBe(1)
  })
})

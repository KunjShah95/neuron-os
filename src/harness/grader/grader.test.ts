/**
 * Integration tests for GraderSuite
 */
import { describe, it, expect } from "bun:test"
import { GraderSuite, getGraderSuite, DEFAULT_GRADER_SUITE_CONFIG } from "./index"
import type { EvalResult } from "../types"

function makeEvalResult(overrides: Partial<EvalResult> = {}): EvalResult {
  return {
    test: {
      id: "test-1",
      name: "Test 1",
      prompt: "Do something",
      tags: ["test"],
      timeout: 60000,
      expected: { pattern: "expected" },
    },
    passed: false,
    score: 0,
    grades: [],
    output: "this is the expected output",
    // Traces that do NOT contain "expected" pattern to avoid false positives
    trace: [{ name: "bash", params: {}, result: "some irrelevant result data here", durationMs: 100 }],
    steps: 1,
    totalTokens: 100,
    totalCost: 0.001,
    durationMs: 1000,
    model: "test-model",
    agentType: "harness",
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides,
  }
}

describe("GraderSuite", () => {
  describe("constructor", () => {
    it("creates with default config", () => {
      const suite = new GraderSuite()
      expect(suite.getConfig().enabledGraders).toEqual(["deterministic", "llm", "code"])
    })

    it("merges custom config with defaults", () => {
      const suite = new GraderSuite({ skipLLM: true })
      expect(suite.getConfig().skipLLM).toBe(true)
      expect(suite.getConfig().enabledGraders).toEqual(["deterministic", "llm", "code"])
    })
  })

  describe("grade", () => {
    it("adds deterministic grades from expected pattern", async () => {
      const suite = new GraderSuite({ skipLLM: true, enabledGraders: ["deterministic"] })
      const result = await suite.grade(makeEvalResult())
      expect(result.grades.length).toBeGreaterThan(0)
      expect(result.grades.some(g => g.grader === "deterministic")).toBe(true)
    })

    it("computes composite score", async () => {
      const suite = new GraderSuite({ skipLLM: true, enabledGraders: ["deterministic"] })
      const result = await suite.grade(makeEvalResult())
      expect(result.score).toBeGreaterThanOrEqual(0)
      expect(result.score).toBeLessThanOrEqual(1)
    })

    it("sets passed=true when pattern found in output", async () => {
      const suite = new GraderSuite({ skipLLM: true, enabledGraders: ["deterministic"] })
      const result = await suite.grade(makeEvalResult())
      // Pattern "expected" is in output "this is the expected output" → 1.0
      expect(result.passed).toBe(true)
    })

    it("sets passed=false when pattern not in output or traces", async () => {
      const suite = new GraderSuite({ skipLLM: true, enabledGraders: ["deterministic"] })
      const result = await suite.grade(makeEvalResult({
        output: "completely wrong output here",
        trace: [{ name: "bash", params: {}, result: "also wrong", durationMs: 100 }],
      }))
      expect(result.passed).toBe(false)
    })

    it("handles empty output gracefully as failure", async () => {
      const suite = new GraderSuite({ skipLLM: true, enabledGraders: ["deterministic"] })
      const result = await suite.grade(makeEvalResult({
        output: "",
        trace: [{ name: "bash", params: {}, result: "some output", durationMs: 100 }],
      }))
      expect(result.passed).toBe(false)
    })

    it("handles no expected pattern gracefully", async () => {
      const suite = new GraderSuite({ skipLLM: true, enabledGraders: ["deterministic"] })
      const result = await suite.grade(makeEvalResult({
        test: {
          id: "test-2",
          name: "Test 2",
          prompt: "Do something",
          tags: ["test"],
          timeout: 60000,
        },
        output: "any output",
        trace: [],
      }))
      // No expected pattern → no deterministic config → no grades → neutral 0.5 → not passing
      expect(result.passed).toBe(false)
    })
  })

  describe("gradeOutput", () => {
    it("returns grades for raw output with expected pattern", async () => {
      const suite = new GraderSuite({ skipLLM: true })
      const result = await suite.gradeOutput(
        "hello world",
        { testId: "t1", testName: "Test 1", expected: { pattern: "world" } },
      )
      expect(result.grades.length).toBeGreaterThan(0)
      expect(result.score).toBeGreaterThan(0)
    })
  })

  describe("updateConfig", () => {
    it("updates config at runtime", () => {
      const suite = new GraderSuite()
      suite.updateConfig({ skipLLM: true })
      expect(suite.getConfig().skipLLM).toBe(true)
    })
  })
})

describe("getGraderSuite", () => {
  it("returns same instance on repeated calls without config", () => {
    const a = getGraderSuite()
    const b = getGraderSuite()
    expect(a).toBe(b)
  })

  it("returns new instance when config provided", () => {
    const a = getGraderSuite({ skipLLM: true })
    const b = getGraderSuite()
    expect(a).not.toBe(b)
  })
})

describe("DEFAULT_GRADER_SUITE_CONFIG", () => {
  it("has expected structure", () => {
    expect(DEFAULT_GRADER_SUITE_CONFIG.enabledGraders).toContain("deterministic")
    expect(DEFAULT_GRADER_SUITE_CONFIG.skipLLM).toBe(false)
    expect(DEFAULT_GRADER_SUITE_CONFIG.defaultWeights).toBeDefined()
  })
})

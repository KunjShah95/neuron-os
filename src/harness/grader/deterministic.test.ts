/**
 * Tests for deterministic graders
 */
import { describe, it, expect } from "bun:test"
import {
  stringMatchGrader,
  fileCheckGrader,
  exitCodeGrader,
  stepCountGrader,
  tokenBudgetGrader,
  diffGrader,
} from "./deterministic"
import type { GraderContext } from "./types"

describe("stringMatchGrader", () => {
  it("returns 1.0 when pattern is found (contains mode)", () => {
    const result = stringMatchGrader(
      "Hello world",
      { pattern: "world", mode: "contains" },
    )
    expect(result.score).toBe(1.0)
    expect(result.grader).toBe("deterministic")
  })

  it("returns 0.0 when pattern is not found", () => {
    const result = stringMatchGrader(
      "Hello world",
      { pattern: "goodbye", mode: "contains" },
    )
    expect(result.score).toBe(0.0)
  })

  it("returns 1.0 for exact match", () => {
    const result = stringMatchGrader(
      "Hello world",
      { pattern: "Hello world", mode: "exact" },
    )
    expect(result.score).toBe(1.0)
  })

  it("returns 0.0 for exact mismatch", () => {
    const result = stringMatchGrader(
      "Hello world!",
      { pattern: "Hello world", mode: "exact" },
    )
    expect(result.score).toBe(0.0)
  })

  it("returns 1.0 for regex match", () => {
    const result = stringMatchGrader(
      "Error: something failed at line 42",
      { pattern: "Error.*line \\d+", mode: "regex" },
    )
    expect(result.score).toBe(1.0)
  })

  it("is case-insensitive by default", () => {
    const result = stringMatchGrader(
      "HELLO WORLD",
      { pattern: "hello", mode: "contains" },
    )
    expect(result.score).toBe(1.0)
  })

  it("uses context expected pattern when no config pattern", () => {
    const context: GraderContext = {
      testId: "test-1",
      testName: "Test 1",
      expected: { pattern: "expected_output" },
    }
    const result = stringMatchGrader(
      "this is the expected_output here",
      {},
      context,
    )
    expect(result.score).toBe(1.0)
  })

  it("checks traces for pattern", () => {
    const context: GraderContext = {
      testId: "test-1",
      testName: "Test 1",
      trace: [{ name: "bash", params: {}, result: "hidden result" }],
    }
    const result = stringMatchGrader(
      "visible output",
      { pattern: "hidden", mode: "contains" },
      context,
    )
    expect(result.score).toBe(1.0)
  })

  it("returns 1.0 when no pattern specified", () => {
    const result = stringMatchGrader("anything", {})
    expect(result.score).toBe(1.0)
  })

  it("returns 0.0 when pattern not found even in traces", () => {
    const context: GraderContext = {
      testId: "test-1",
      testName: "Test 1",
      trace: [{ name: "bash", params: {}, result: "irrelevant output" }],
    }
    const result = stringMatchGrader(
      "wrong output here",
      { pattern: "missing_pattern", mode: "contains" },
      context,
    )
    expect(result.score).toBe(0.0)
  })
})

describe("fileCheckGrader", () => {
  it("returns 1.0 when all expected files exist", () => {
    const context: GraderContext = {
      testId: "test-1",
      testName: "Test 1",
      sandboxSnapshot: {
        before: [],
        after: ["src/index.ts", "package.json"],
        created: ["src/index.ts", "package.json"],
        modified: [],
        deleted: [],
      },
    }
    const result = fileCheckGrader(
      { filesExist: ["src/index.ts"] },
      context,
    )
    expect(result.score).toBe(1.0)
  })

  it("returns 0.0 when expected file is missing", () => {
    const context: GraderContext = {
      testId: "test-1",
      testName: "Test 1",
      sandboxSnapshot: {
        before: [],
        after: ["src/index.ts"],
        created: ["src/index.ts"],
        modified: [],
        deleted: [],
      },
    }
    const result = fileCheckGrader(
      { filesExist: ["missing-file.ts"] },
      context,
    )
    expect(result.score).toBe(0.0)
  })

  it("returns 0.5 when no snapshot available", () => {
    const result = fileCheckGrader({ filesExist: ["test.ts"] })
    expect(result.score).toBe(0.5)
  })
})

describe("exitCodeGrader", () => {
  it("always returns 1.0 (pass-through)", () => {
    const result = exitCodeGrader({ expected: 0 })
    expect(result.score).toBe(1.0)
  })
})

describe("stepCountGrader", () => {
  it("returns 1.0 when no step budget set", () => {
    const result = stepCountGrader({})
    expect(result.score).toBe(1.0)
  })

  it("returns high score when steps within budget", () => {
    const context: GraderContext = {
      testId: "test-1",
      testName: "Test 1",
      trace: [{ name: "a", params: {}, result: "ok" }],
    }
    const result = stepCountGrader(
      { maxSteps: 10 },
      context,
    )
    expect(result.score).toBeGreaterThan(0.5)
  })

  it("returns low score when steps exceed budget", () => {
    const context: GraderContext = {
      testId: "test-1",
      testName: "Test 1",
      trace: Array(20).fill({ name: "bash", params: {}, result: "ok" }),
    }
    const result = stepCountGrader(
      { maxSteps: 5 },
      context,
    )
    expect(result.score).toBe(0.3)
  })
})

describe("tokenBudgetGrader", () => {
  it("returns 1.0 when no token budget", () => {
    const result = tokenBudgetGrader({})
    expect(result.score).toBe(1.0)
  })

  it("returns 1.0 when token budget specified (pass-through)", () => {
    const result = tokenBudgetGrader({ maxTokens: 5000 })
    expect(result.score).toBe(1.0)
  })
})

describe("diffGrader", () => {
  it("returns 0.5 when no sandbox snapshot (config exists but no context)", () => {
    // config is {} (not null/undefined), so it passes !config check
    // but context is undefined, so snapshot is undefined → returns 0.5
    const result = diffGrader({}, undefined)
    expect(result.score).toBe(0.5)
  })

  it("returns 1.0 when no config at all", () => {
    const result = diffGrader(undefined as any, undefined)
    expect(result.score).toBe(1.0)
  })

  it("returns 1.0 when changes within limit", () => {
    const context: GraderContext = {
      testId: "test-1",
      testName: "Test 1",
      sandboxSnapshot: {
        before: [],
        after: ["a.ts"],
        created: ["a.ts"],
        modified: [],
        deleted: [],
      },
    }
    const result = diffGrader(
      { maxLinesChanged: 10 },
      context,
    )
    expect(result.score).toBe(1.0)
  })
})

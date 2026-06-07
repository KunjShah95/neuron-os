/**
 * Tests for composite scoring module
 */
import { describe, it, expect } from "bun:test"
import { computeCompositeScore, isPassing, normalizeWeights, DEFAULT_COMPOSITE_CONFIG } from "./composite"
import type { GradeResult } from "../types"

function makeGrade(overrides: Partial<GradeResult> = {}): GradeResult {
  return {
    name: "test",
    grader: "deterministic",
    score: 1.0,
    weight: 0.5,
    ...overrides,
  }
}

describe("computeCompositeScore", () => {
  it("returns neutral score (0.5) for empty grades", () => {
    expect(computeCompositeScore([])).toBe(0.5)
  })

  it("computes weighted average correctly", () => {
    const grades: GradeResult[] = [
      makeGrade({ name: "a", grader: "deterministic", score: 1.0, weight: 0.3 }),
      makeGrade({ name: "b", grader: "deterministic", score: 0.5, weight: 0.3 }),
    ]
    // (1.0 * 0.3 + 0.5 * 0.3) / 0.6 = 0.45 / 0.6 = 0.75
    expect(computeCompositeScore(grades)).toBeCloseTo(0.75, 5)
  })

  it("uses min strategy correctly", () => {
    const grades: GradeResult[] = [
      makeGrade({ name: "a", grader: "deterministic", score: 1.0, weight: 0.5 }),
      makeGrade({ name: "b", grader: "deterministic", score: 0.3, weight: 0.5 }),
    ]
    const score = computeCompositeScore(grades, {
      ...DEFAULT_COMPOSITE_CONFIG,
      strategy: "min",
    })
    expect(score).toBeCloseTo(0.3, 5)
  })

  it("uses geometric mean strategy correctly", () => {
    const grades: GradeResult[] = [
      makeGrade({ name: "a", grader: "deterministic", score: 1.0, weight: 0.5 }),
      makeGrade({ name: "b", grader: "deterministic", score: 0.5, weight: 0.5 }),
    ]
    const score = computeCompositeScore(grades, {
      ...DEFAULT_COMPOSITE_CONFIG,
      strategy: "geometric_mean",
    })
    // geometric mean of 1.0 and 0.5 = sqrt(1.0 * 0.5) = sqrt(0.5) ≈ 0.707
    expect(score).toBeCloseTo(0.7071, 3)
  })

  it("caps score at 0.4 when a type is below threshold", () => {
    const grades: GradeResult[] = [makeGrade({ name: "a", grader: "deterministic", score: 0.1, weight: 1.0 })]
    const score = computeCompositeScore(grades, {
      ...DEFAULT_COMPOSITE_CONFIG,
      thresholds: { deterministic: 0.5, llm: 0.3, code: 0.3 },
    })
    expect(score).toBeLessThanOrEqual(0.4)
  })

  it("handles mixed grader types", () => {
    const grades: GradeResult[] = [
      makeGrade({ name: "a", grader: "deterministic", score: 1.0, weight: 0.5 }),
      makeGrade({ name: "b", grader: "llm", score: 0.8, weight: 0.5 }),
      makeGrade({ name: "c", grader: "code", score: 0.9, weight: 0.5 }),
    ]
    const score = computeCompositeScore(grades)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(1)
  })
})

describe("isPassing", () => {
  it("returns true for scores above threshold", () => {
    expect(isPassing(0.8)).toBe(true)
  })
  it("returns false for scores below threshold", () => {
    expect(isPassing(0.3)).toBe(false)
  })
  it("respects custom threshold", () => {
    expect(isPassing(0.7, 0.9)).toBe(false)
    expect(isPassing(0.95, 0.9)).toBe(true)
  })
})

describe("normalizeWeights", () => {
  it("normalizes weights to sum to 1.0", () => {
    const grades: GradeResult[] = [
      makeGrade({ name: "a", grader: "deterministic", score: 1.0, weight: 3 }),
      makeGrade({ name: "b", grader: "deterministic", score: 0.5, weight: 1 }),
    ]
    const normalized = normalizeWeights(grades)
    const totalWeight = normalized.reduce((s, g) => s + g.weight, 0)
    expect(totalWeight).toBeCloseTo(1.0, 5)
  })

  it("preserves score values", () => {
    const grades: GradeResult[] = [makeGrade({ name: "a", grader: "deterministic", score: 0.7, weight: 2 })]
    const normalized = normalizeWeights(grades)
    expect(normalized[0].score).toBe(0.7)
  })
})

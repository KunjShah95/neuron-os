import { describe, it, expect } from "bun:test"
import { computeCompositeScore, computeTypeWeights } from "./composite"
import type { GradeResult } from "../types"

function makeGrade(overrides: Partial<GradeResult>): GradeResult {
  return {
    name: "grade",
    grader: "deterministic",
    score: 1.0,
    weight: 0.5,
    ...overrides,
  }
}

const NO_THRESHOLDS = { deterministic: 0, llm: 0, code: 0 }

describe("computeCompositeScore weights", () => {
  it("honours the configured default weights per grader type", () => {
    const grades: GradeResult[] = [
      makeGrade({ name: "det", grader: "deterministic", score: 1.0, weight: 0.1 }),
      makeGrade({ name: "llm", grader: "llm", score: 0.0, weight: 0.9 }),
    ]

    const score = computeCompositeScore(grades, {
      defaultWeights: { deterministic: 0.9, llm: 0.1, code: 0.2 },
      thresholds: NO_THRESHOLDS,
    })

    expect(score).toBeCloseTo(0.9, 5)
  })

  it("ignores the hardcoded per-grade weights when a type weight is configured", () => {
    const grades: GradeResult[] = [
      makeGrade({ name: "det", grader: "deterministic", score: 1.0, weight: 0.01 }),
      makeGrade({ name: "llm", grader: "llm", score: 0.0, weight: 0.99 }),
    ]

    const withDefaults = computeCompositeScore(grades, {
      defaultWeights: { deterministic: 0.3, llm: 0.5, code: 0.2 },
      thresholds: NO_THRESHOLDS,
    })
    const swapped = computeCompositeScore(grades, {
      defaultWeights: { deterministic: 0.5, llm: 0.3, code: 0.2 },
      thresholds: NO_THRESHOLDS,
    })

    expect(withDefaults).toBeCloseTo(0.375, 5)
    expect(swapped).toBeCloseTo(0.625, 5)
  })

  it("uses the documented default weights when no config is supplied", () => {
    const grades: GradeResult[] = [
      makeGrade({ name: "det", grader: "deterministic", score: 1.0, weight: 0.5 }),
      makeGrade({ name: "llm", grader: "llm", score: 0.0, weight: 0.5 }),
      makeGrade({ name: "code", grader: "code", score: 1.0, weight: 0.5 }),
    ]

    const score = computeCompositeScore(grades, { thresholds: NO_THRESHOLDS })

    expect(score).toBeCloseTo(0.5, 5)
  })

  it("distributes a type weight across the grades of that type", () => {
    const grades: GradeResult[] = [
      makeGrade({ name: "det-a", grader: "deterministic", score: 1.0, weight: 0.9 }),
      makeGrade({ name: "det-b", grader: "deterministic", score: 0.0, weight: 0.1 }),
    ]

    const score = computeCompositeScore(grades, { thresholds: NO_THRESHOLDS })

    expect(score).toBeCloseTo(0.5, 5)
  })

  it("normalises over the grader types that are present", () => {
    const grades: GradeResult[] = [makeGrade({ name: "det", grader: "deterministic", score: 1.0, weight: 0.2 })]

    const score = computeCompositeScore(grades, { thresholds: NO_THRESHOLDS })

    expect(score).toBeCloseTo(1.0, 5)
  })
})

describe("computeTypeWeights", () => {
  it("returns the configured weight for each present type", () => {
    const grades: GradeResult[] = [
      makeGrade({ name: "det", grader: "deterministic", score: 1.0, weight: 0.2 }),
      makeGrade({ name: "llm", grader: "llm", score: 1.0, weight: 0.8 }),
    ]

    const weights = computeTypeWeights(grades, { deterministic: 0.3, llm: 0.5, code: 0.2 })

    expect(weights.deterministic).toBe(0.3)
    expect(weights.llm).toBe(0.5)
    expect(weights.code).toBeUndefined()
  })

  it("falls back to the own weights for types without a configured weight", () => {
    const grades: GradeResult[] = [makeGrade({ name: "human", grader: "human", score: 1.0, weight: 0.4 })]

    const weights = computeTypeWeights(grades, { deterministic: 0.3, llm: 0.5, code: 0.2 })

    expect(weights.human).toBeCloseTo(0.4, 6)
  })
})

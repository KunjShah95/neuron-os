/**
 * src/improve/eval-validator.test.ts
 *
 * Tests for the EvalValidator that validates skill candidates
 * against the eval harness.
 */

import { describe, it, expect, beforeEach } from "bun:test"
import { EvalValidator } from "./eval-validator"
import type { SkillCandidate } from "./types"

// ── Helpers ──────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<SkillCandidate> = {}): SkillCandidate {
  return {
    id: `candidate-${Date.now().toString(36)}`,
    name: "test-skill",
    description: "A test skill that does something useful",
    sourcePattern: "test-*.ts",
    confidence: 0.85,
    derivedFrom: ["session-abc", "session-def"],
    avgReward: 0.75,
    invocationCount: 10,
    successRate: 0.8,
    createdAt: new Date().toISOString(),
    status: "candidate",
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe("EvalValidator", () => {
  let validator: EvalValidator

  beforeEach(() => {
    validator = new EvalValidator({
      minPassScore: 0.7,
      useLLMJudge: false, // Skip LLM calls in tests
      useCodeGraders: false,
      testTimeout: 5000,
    })
  })

  describe("constructor", () => {
    it("creates with default config", () => {
      const v = new EvalValidator()
      expect(v).toBeInstanceOf(EvalValidator)
    })

    it("accepts custom config overrides", () => {
      const v = new EvalValidator({ minPassScore: 0.5, testTimeout: 10000 })
      // Verify by checking validation behavior
      expect(v).toBeInstanceOf(EvalValidator)
    })
  })

  describe("validate", () => {
    it("returns a validation result for a candidate", async () => {
      const candidate = makeCandidate()
      const result = await validator.validate(candidate)

      // Should complete without throwing
      expect(result).toBeDefined()
      expect(result.candidate.id).toBe(candidate.id)
      expect(result.candidate.name).toBe("test-skill")
      expect(["publish", "reject", "review"]).toContain(result.recommendation)
    })

    it("handles invalid candidates gracefully", async () => {
      const candidate = makeCandidate({ description: "" })
      const result = await validator.validate(candidate)

      expect(result).toBeDefined()
      expect(result.passed).toBe(false)
    })
  })

  describe("batchValidate", () => {
    it("validates multiple candidates in parallel", async () => {
      const candidates = [
        makeCandidate({ id: "batch-1", name: "skill-a" }),
        makeCandidate({ id: "batch-2", name: "skill-b" }),
        makeCandidate({ id: "batch-3", name: "skill-c" }),
      ]

      const batch = await validator.batchValidate(candidates)

      expect(batch.total).toBe(3)
      expect(batch.results).toHaveLength(3)
      expect(batch.summary).toBeDefined()
      expect(typeof batch.summary.avgScore).toBe("number")
    })

    it("returns empty batch for empty input", async () => {
      const batch = await validator.batchValidate([])

      expect(batch.total).toBe(0)
      expect(batch.passed).toBe(0)
      expect(batch.failed).toBe(0)
      expect(batch.results).toHaveLength(0)
    })
  })

  describe("getHistory", () => {
    it("returns empty array for unknown candidate", () => {
      const history = validator.getHistory("nonexistent")
      expect(history).toEqual([])
    })

    it("returns validation history after validation", async () => {
      const candidate = makeCandidate()
      await validator.validate(candidate)

      const history = validator.getHistory(candidate.id)
      expect(history).toHaveLength(1)
      expect(history[0]!.candidate.id).toBe(candidate.id)
    })

    it("accumulates multiple validations for same candidate", async () => {
      const candidate = makeCandidate()
      await validator.validate(candidate)
      await validator.validate(candidate)

      const history = validator.getHistory(candidate.id)
      expect(history).toHaveLength(2)
    })
  })

  describe("getStats", () => {
    it("returns zeros for fresh validator", () => {
      const stats = validator.getStats()
      expect(stats.totalValidated).toBe(0)
      expect(stats.passRate).toBe(0)
      expect(stats.avgScore).toBe(0)
    })

    it("returns correct stats after validations", async () => {
      await validator.validate(makeCandidate({ id: "s1" }))
      await validator.validate(makeCandidate({ id: "s2" }))

      const stats = validator.getStats()
      expect(stats.totalValidated).toBeGreaterThanOrEqual(2)
      expect(stats.passRate).toBeGreaterThanOrEqual(0)
      expect(stats.avgScore).toBeGreaterThanOrEqual(0)
    })
  })
})

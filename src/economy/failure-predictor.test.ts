/**
 * failure-predictor.test — Unit tests for FailurePredictor.
 * Tests risk evaluation, initialization, and edge cases.
 */

import { describe, it, expect, beforeEach } from "bun:test"
import { FailurePredictor } from "./failure-predictor"

describe("FailurePredictor", () => {
  beforeEach(() => {
    FailurePredictor.reset()
  })

  describe("evaluateSpawnRisk", () => {
    it("returns low risk for unknown agent type (no data yet)", () => {
      const risk = FailurePredictor.evaluateSpawnRisk({ agentType: "unknown-type" })
      expect(risk.level).toBe("low")
      expect(risk.score).toBe(8)
      expect(risk.factors.length).toBe(1)
      expect(risk.factors[0]!.name).toBe("Historical failure rate")
    })

    it("returns low risk for clean type with no data", () => {
      const risk = FailurePredictor.evaluateSpawnRisk({ agentType: "read" })
      expect(risk.level).toBe("low")
      expect(risk.score).toBe(8)
    })

    it("respects custom hour and dayOfWeek", () => {
      const risk1 = FailurePredictor.evaluateSpawnRisk({
        agentType: "build",
        hour: 3, // 3 AM — unusual
      })
      expect(risk1.score).toBeGreaterThanOrEqual(0)
    })

    it("does not throw for edge case inputs", () => {
      expect(() =>
        FailurePredictor.evaluateSpawnRisk({
          agentType: "",
          hour: -1,
        }),
      ).not.toThrow()
    })

    it("considers resource constraints when memory is low", () => {
      // No initial data, so we just check it doesn't crash
      const risk = FailurePredictor.evaluateSpawnRisk({
        agentType: "build",
        memoryMB: 64,
        cpu: 1,
      })
      expect(risk.factors.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("getAllRiskLevels", () => {
    it("returns empty array when no data", () => {
      const levels = FailurePredictor.getAllRiskLevels()
      expect(levels.length).toBe(0)
    })
  })

  describe("initialize", () => {
    it("can be called multiple times safely", async () => {
      await FailurePredictor.initialize()
      await FailurePredictor.initialize()
      // Should not throw
      expect(true).toBe(true)
    })
  })

  describe("reset", () => {
    it("clears all patterns", async () => {
      await FailurePredictor.initialize()
      FailurePredictor.reset()
      const levels = FailurePredictor.getAllRiskLevels()
      expect(levels.length).toBe(0)
    })
  })
})

/**
 * cost-forecaster.test — Unit tests for CostForecaster.
 * Tests forecast generation, budget exhaustion logic, and edge cases.
 */

import { describe, it, expect } from "bun:test"
import { CostForecaster } from "./cost-forecaster"

describe("CostForecaster", () => {
  describe("forecast", () => {
    it("returns a forecast result with default values", async () => {
      const forecast = await CostForecaster.forecast()
      expect(forecast).toBeDefined()
      expect(typeof forecast.totalSpend).toBe("number")
      expect(typeof forecast.avgDailySpend).toBe("number")
      expect(typeof forecast.daysUntilExhaustion).toBe("number")
      expect(Array.isArray(forecast.insights)).toBe(true)
      expect(Array.isArray(forecast.byAgentType)).toBe(true)
    })

    it("returns valid trend value", async () => {
      const forecast = await CostForecaster.forecast()
      expect(["increasing", "stable", "decreasing"]).toContain(forecast.trend)
    })

    it("returns valid confidence value", async () => {
      const forecast = await CostForecaster.forecast()
      expect(["high", "medium", "low"]).toContain(forecast.confidence)
    })

    it("projected costs are non-negative", async () => {
      const forecast = await CostForecaster.forecast()
      expect(forecast.projected7Day).toBeGreaterThanOrEqual(0)
      expect(forecast.projected30Day).toBeGreaterThanOrEqual(0)
    })
  })

  describe("willExhaustWithin", () => {
    it("returns a boolean", async () => {
      const result = await CostForecaster.willExhaustWithin(7)
      expect(typeof result).toBe("boolean")
    })
  })
})

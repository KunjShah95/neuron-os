import { describe, it, expect } from "bun:test"
import { averageDailySpend } from "./cost-forecaster"

describe("averageDailySpend", () => {
  it("divides by the days in the window rather than the days with data", () => {
    const history = [
      { date: "2026-10-18", totalCost: 1 },
      { date: "2026-10-19", totalCost: 1 },
    ]

    expect(averageDailySpend(history, 14)).toBeCloseTo(2 / 14, 8)
  })

  it("matches the simple average when every day has data", () => {
    const history = Array.from({ length: 7 }, (_, i) => ({ date: `2026-10-${i + 1}`, totalCost: 2 }))

    expect(averageDailySpend(history, 7)).toBeCloseTo(2, 8)
  })

  it("returns zero for an empty history", () => {
    expect(averageDailySpend([], 14)).toBe(0)
  })

  it("never divides by zero", () => {
    expect(averageDailySpend([{ date: "2026-10-18", totalCost: 5 }], 0)).toBeCloseTo(5, 8)
  })
})

import { describe, expect, it } from "bun:test"
import { calculateBackoffDelay } from "./recovery"
import { DEFAULT_RECOVERY, now } from "./state"

describe("calculateBackoffDelay", () => {
  it("returns backoffMs on first attempt (attempt=0)", () => {
    expect(calculateBackoffDelay(DEFAULT_RECOVERY, 0)).toBe(1_000)
  })

  it("doubles on each attempt with default multiplier of 2", () => {
    expect(calculateBackoffDelay(DEFAULT_RECOVERY, 1)).toBe(2_000)
    expect(calculateBackoffDelay(DEFAULT_RECOVERY, 2)).toBe(4_000)
    expect(calculateBackoffDelay(DEFAULT_RECOVERY, 3)).toBe(8_000)
  })

  it("caps at backoffMax", () => {
    // attempt 7 → 1000 * 2^7 = 128_000 > 60_000 → should cap at 60_000
    expect(calculateBackoffDelay(DEFAULT_RECOVERY, 7)).toBe(60_000)
  })

  it("respects custom multiplier", () => {
    const cfg = { ...DEFAULT_RECOVERY, backoffMs: 500, backoffMultiplier: 3 }
    expect(calculateBackoffDelay(cfg, 0)).toBe(500)
    expect(calculateBackoffDelay(cfg, 1)).toBe(1_500)
    expect(calculateBackoffDelay(cfg, 2)).toBe(4_500)
  })

  it("respects custom backoffMax", () => {
    const cfg = { ...DEFAULT_RECOVERY, backoffMax: 5_000 }
    expect(calculateBackoffDelay(cfg, 5)).toBe(5_000)
  })
})

describe("DEFAULT_RECOVERY", () => {
  it("has sensible defaults", () => {
    expect(DEFAULT_RECOVERY.maxRetries).toBe(5)
    expect(DEFAULT_RECOVERY.backoffMs).toBe(1_000)
    expect(DEFAULT_RECOVERY.backoffMultiplier).toBe(2)
    expect(DEFAULT_RECOVERY.backoffMax).toBe(60_000)
  })
})

describe("now()", () => {
  it("returns a numeric timestamp close to Date.now()", () => {
    const before = Date.now()
    const result = now()
    const after = Date.now()
    expect(result).toBeGreaterThanOrEqual(before)
    expect(result).toBeLessThanOrEqual(after)
  })
})

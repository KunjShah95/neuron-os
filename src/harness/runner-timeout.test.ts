import { describe, it, expect } from "bun:test"
import { withTimeout, resolveTestTimeout, HarnessTimeoutError } from "./runner"

describe("withTimeout", () => {
  it("resolves when the promise settles in time", async () => {
    const result = await withTimeout(Promise.resolve("done"), 1000, "fast")
    expect(result).toBe("done")
  })

  it("rejects with a timeout error when the promise is too slow", async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 5000))

    await expect(withTimeout(slow, 20, "slow-test")).rejects.toThrow(HarnessTimeoutError)
  })

  it("reports the label and duration in the timeout message", async () => {
    const slow = new Promise<string>((resolve) => setTimeout(() => resolve("late"), 5000))

    await expect(withTimeout(slow, 20, "slow-test")).rejects.toThrow(/slow-test.*20ms/)
  })

  it("propagates the original rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000, "failing")).rejects.toThrow("boom")
  })
})

describe("resolveTestTimeout", () => {
  it("uses the test timeout when no runner timeout is configured", () => {
    expect(resolveTestTimeout(30000, undefined)).toBe(30000)
  })

  it("uses the runner timeout when the test has none", () => {
    expect(resolveTestTimeout(undefined, 45000)).toBe(45000)
  })

  it("caps the test timeout with the runner timeout", () => {
    expect(resolveTestTimeout(300000, 60000)).toBe(60000)
  })

  it("keeps the shorter test timeout", () => {
    expect(resolveTestTimeout(30000, 60000)).toBe(30000)
  })

  it("falls back to the default timeout", () => {
    expect(resolveTestTimeout(0, undefined)).toBe(120000)
    expect(resolveTestTimeout(undefined, undefined)).toBe(120000)
  })
})

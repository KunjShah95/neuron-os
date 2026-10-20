/**
 * The registry's "top capabilities" ranking must reflect real matches, not an
 * alphabetical order with a hardcoded zero counter.
 */

import { describe, it, expect } from "bun:test"
import { CapabilityRegistry } from "./capability-registry"

describe("CapabilityRegistry.getStats", () => {
  it("ranks capabilities by their real match count", () => {
    const registry = new CapabilityRegistry()

    registry.findBestMatch("write a new feature")
    registry.findBestMatch("write a new feature")
    registry.findBestMatch("refactor the module")

    const stats = registry.getStats()
    const top = stats.topCapabilities

    expect(top.length).toBeGreaterThan(0)
    expect(top[0]?.id).toBe("code.write")
    expect(top[0]?.matchedCount).toBe(2)

    const counts = top.map((c) => c.matchedCount)
    const sorted = [...counts].sort((a, b) => b - a)
    expect(counts).toEqual(sorted)
  })

  it("reports zero for capabilities that never matched", () => {
    const registry = new CapabilityRegistry()
    const stats = registry.getStats()
    expect(stats.topCapabilities.every((c) => c.matchedCount === 0)).toBe(true)
  })

  it("counts matches across repeated routing calls", () => {
    const registry = new CapabilityRegistry()

    registry.findBestMatch("fix the bug")
    registry.findBestMatch("fix the bug")
    registry.findBestMatch("fix the bug")

    const stats = registry.getStats()
    const edit = stats.topCapabilities.find((c) => c.id === "code.edit")
    expect(edit?.matchedCount).toBe(3)
  })
})

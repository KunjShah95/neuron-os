import { describe, it, expect } from "bun:test"
import { buildInsightContext, promoteInsights } from "./insight-injector"
import type { DreamInsight } from "./types"

function makeInsight(overrides: Partial<DreamInsight> = {}): DreamInsight {
  return {
    id: "ins-" + Math.random().toString(36).slice(2),
    dreamId: "dream-1",
    type: "pattern",
    title: "Test insight",
    description: "desc",
    confidence: 0.9,
    sourceCount: 4,
    actionable: true,
    applied: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  }
}

describe("buildInsightContext", () => {
  it("returns empty string when no insights and no persisted", () => {
    expect(buildInsightContext([], [])).toBe("")
  })

  it("includes fresh actionable insights", () => {
    const i = makeInsight({ title: "Retry improves success" })
    const ctx = buildInsightContext([i], [])
    expect(ctx).toContain("Retry improves success")
    expect(ctx).toContain("[pattern]")
    expect(ctx).toContain("0.90")
  })

  it("excludes applied insights", () => {
    const i = makeInsight({ applied: true })
    expect(buildInsightContext([i], [])).toBe("")
  })

  it("excludes non-actionable insights", () => {
    const i = makeInsight({ actionable: false })
    expect(buildInsightContext([i], [])).toBe("")
  })

  it("respects maxFresh limit", () => {
    const insights = Array.from({ length: 10 }, (_, k) =>
      makeInsight({ title: `Insight ${k}`, confidence: 0.9 - k * 0.01 }),
    )
    const ctx = buildInsightContext(insights, [], { maxFresh: 3 })
    const matches = ctx.match(/- \[pattern\]/g)
    expect(matches?.length).toBe(3)
  })

  it("sorts by confidence descending", () => {
    const low = makeInsight({ title: "Low", confidence: 0.5 })
    const high = makeInsight({ title: "High", confidence: 0.95 })
    const ctx = buildInsightContext([low, high], [])
    expect(ctx.indexOf("High")).toBeLessThan(ctx.indexOf("Low"))
  })

  it("includes persisted insights section", () => {
    const ctx = buildInsightContext([], ["[pattern] Old learning"])
    expect(ctx).toContain("Learned Behaviors")
    expect(ctx).toContain("Old learning")
  })

  it("shows both sections when both present", () => {
    const i = makeInsight()
    const ctx = buildInsightContext([i], ["[pattern] Persisted"])
    expect(ctx).toContain("Learned Behaviors")
    expect(ctx).toContain("Agent Learnings")
  })
})

describe("promoteInsights", () => {
  it("does not throw when no candidates meet threshold", () => {
    const i = makeInsight({ confidence: 0.5, sourceCount: 1 })
    expect(() => promoteInsights([i])).not.toThrow()
  })

  it("does not promote non-actionable insights", () => {
    const i = makeInsight({ confidence: 0.9, sourceCount: 5, actionable: false })
    expect(() => promoteInsights([i])).not.toThrow()
  })
})

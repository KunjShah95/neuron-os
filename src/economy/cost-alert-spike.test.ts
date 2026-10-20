import { describe, it, expect, beforeEach } from "bun:test"
import { CostAlertEngine } from "./cost-alert"

describe("CostAlertEngine spike detection", () => {
  beforeEach(() => {
    CostAlertEngine.resetInstance()
  })

  it("fires for a flat series with a single outlier", () => {
    const engine = CostAlertEngine.getInstance({ minSamples: 3, spikeMultiplier: 3, windowDays: 30 })
    const baseline = Date.now() - 6 * 86_400_000

    for (let i = 0; i < 5; i++) engine.recordCost("flat", 0.01, baseline + i * 86_400_000)
    engine.recordCost("flat", 5.0, baseline + 5 * 86_400_000)

    const alerts = engine.evaluate()
    const spike = alerts.find((a) => a.title.includes("Cost spike"))

    expect(spike).toBeDefined()
    expect(spike!.currentValue).toBe(5.0)
    expect(spike!.label).toBe("flat")
  })

  it("does not fire for a stable series without an outlier", () => {
    const engine = CostAlertEngine.getInstance({ minSamples: 3, spikeMultiplier: 3, windowDays: 30 })
    const baseline = Date.now() - 6 * 86_400_000

    for (let i = 0; i < 6; i++) engine.recordCost("stable", 0.01, baseline + i * 86_400_000)

    const alerts = engine.evaluate()

    expect(alerts.filter((a) => a.title.includes("Cost spike"))).toHaveLength(0)
  })

  it("excludes the candidate sample from the baseline", () => {
    const engine = CostAlertEngine.getInstance({ minSamples: 3, spikeMultiplier: 3, windowDays: 30 })
    const baseline = Date.now() - 6 * 86_400_000

    for (let i = 0; i < 5; i++) engine.recordCost("flat", 0.01, baseline + i * 86_400_000)
    engine.recordCost("flat", 5.0, baseline + 5 * 86_400_000)

    const spike = engine.evaluate().find((a) => a.title.includes("Cost spike"))

    expect(spike).toBeDefined()
    expect(spike!.threshold).toBeLessThan(5.0)
    expect(spike!.threshold).toBeGreaterThan(0.01)
  })

  it("uses the newest sample by timestamp rather than insertion order", () => {
    const engine = CostAlertEngine.getInstance({ minSamples: 3, spikeMultiplier: 3, windowDays: 30 })
    const baseline = Date.now() - 6 * 86_400_000

    for (let i = 0; i < 5; i++) engine.recordCost("ordered", 0.01, baseline + (i + 1) * 86_400_000)
    engine.recordCost("ordered", 5.0, baseline)

    const spike = engine.evaluate().find((a) => a.title.includes("Cost spike"))

    expect(spike).toBeUndefined()
  })
})

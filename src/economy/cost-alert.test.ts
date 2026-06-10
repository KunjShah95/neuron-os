/**
 * cost-alert.test — Unit tests for CostAlertEngine.
 * Tests spike detection, drift detection, burn-rate alerts, and config management.
 */

import { describe, it, expect, beforeEach } from "bun:test"
import { CostAlertEngine, DEFAULT_COST_ALERT_CONFIG } from "./cost-alert"

describe("CostAlertEngine", () => {
  beforeEach(() => {
    CostAlertEngine.resetInstance()
  })

  describe("config", () => {
    it("creates with default config", () => {
      const engine = CostAlertEngine.getInstance()
      expect(engine.getConfig().enabled).toBe(true)
      expect(engine.getConfig().spikeMultiplier).toBe(DEFAULT_COST_ALERT_CONFIG.spikeMultiplier)
    })

    it("accepts partial config overrides", () => {
      const engine = CostAlertEngine.getInstance({ spikeMultiplier: 5 })
      expect(engine.getConfig().spikeMultiplier).toBe(5)
      expect(engine.getConfig().driftDays).toBe(DEFAULT_COST_ALERT_CONFIG.driftDays)
    })

    it("updateConfig merges overrides", () => {
      const engine = CostAlertEngine.getInstance()
      engine.updateConfig({ enabled: false })
      expect(engine.getConfig().enabled).toBe(false)
    })
  })

  describe("recordCost", () => {
    it("records samples", () => {
      const engine = CostAlertEngine.getInstance()
      engine.recordCost("gpt-4o", 0.01)
      expect(engine.getSamples().length).toBe(1)
      expect(engine.getSamples()[0]!.label).toBe("gpt-4o")
      expect(engine.getSamples()[0]!.costUsd).toBe(0.01)
    })

    it("auto-generates date from timestamp", () => {
      const engine = CostAlertEngine.getInstance()
      const ts = new Date("2026-06-01T12:00:00Z").getTime()
      engine.recordCost("test", 0.01, ts)
      expect(engine.getSamples()[0]!.date).toBe("2026-06-01")
    })
  })

  describe("clear / prune", () => {
    it("clear removes all samples and alerts", () => {
      const engine = CostAlertEngine.getInstance()
      engine.recordCost("test", 0.01)
      // Trigger evaluate() to generate a spike alert, then clear
      const baseline = new Date("2026-06-01T00:00:00Z").getTime()
      for (let i = 0; i < 5; i++) engine.recordCost("test", 0.01, baseline + i * 86_400_000)
      engine.recordCost("test", 10.0, Date.now()) // spike
      engine.evaluate()
      expect(engine.getSamples().length).toBeGreaterThan(0)
      expect(engine.getAlerts().length).toBeGreaterThan(0)
      engine.clear()
      expect(engine.getSamples().length).toBe(0)
      expect(engine.getAlerts().length).toBe(0)
    })

    it("pruneAcknowledgedAlerts removes acknowledged alerts", () => {
      const engine = CostAlertEngine.getInstance()
      const baseline = new Date("2026-06-01T00:00:00Z").getTime()
      for (let i = 0; i < 5; i++) engine.recordCost("test", 0.01, baseline + i * 86_400_000)
      engine.recordCost("test", 10.0, Date.now())
      engine.evaluate()
      expect(engine.getAlerts().length).toBeGreaterThan(0)
      // Acknowledge all alerts
      for (const a of engine.getAlerts()) engine.acknowledgeAlert(a.id)
      engine.pruneAcknowledgedAlerts()
      expect(engine.getAlerts().length).toBe(0)
    })
  })

  describe("evaluate — spike detection", () => {
    it("returns empty when samples are below minSamples", () => {
      const engine = CostAlertEngine.getInstance()
      engine.recordCost("gpt-4o", 0.01)
      const alerts = engine.evaluate()
      expect(alerts.length).toBe(0)
    })

    it("returns empty when engine is disabled", () => {
      const engine = CostAlertEngine.getInstance({ enabled: false, minSamples: 1 })
      engine.recordCost("gpt-4o", 0.01)
      const alerts = engine.evaluate()
      expect(alerts.length).toBe(0)
    })

    it("detects a cost spike using MAD", () => {
      const engine = CostAlertEngine.getInstance({
        minSamples: 3,
        spikeMultiplier: 1.5,
        windowDays: 30,
      })

      // Record 5 varied low-cost samples (MAD > 0 required for spike detection)
      const baseline = new Date("2026-06-01T00:00:00Z").getTime()
      engine.recordCost("gpt-4o", 0.008, baseline)
      engine.recordCost("gpt-4o", 0.012, baseline + 86_400_000)
      engine.recordCost("gpt-4o", 0.010, baseline + 2 * 86_400_000)
      engine.recordCost("gpt-4o", 0.011, baseline + 3 * 86_400_000)
      engine.recordCost("gpt-4o", 0.009, baseline + 4 * 86_400_000)

      // Record a spike (10x the median ~0.010)
      engine.recordCost("gpt-4o", 0.1, baseline + 5 * 86_400_000)

      const alerts = engine.evaluate()
      expect(alerts.length).toBeGreaterThanOrEqual(1)
      expect(alerts[0]!.title).toContain("Cost spike")
      expect(alerts[0]!.severity).toBe("critical")
    })

    it("deduplicates spike alerts within the same minute", () => {
      const engine = CostAlertEngine.getInstance({
        minSamples: 3,
        spikeMultiplier: 1.5,
        windowDays: 30,
      })

      const baseline = new Date("2026-06-01T00:00:00Z").getTime()
      engine.recordCost("gpt-4o", 0.008, baseline)
      engine.recordCost("gpt-4o", 0.012, baseline + 86_400_000)
      engine.recordCost("gpt-4o", 0.010, baseline + 2 * 86_400_000)
      engine.recordCost("gpt-4o", 0.011, baseline + 3 * 86_400_000)
      engine.recordCost("gpt-4o", 0.009, baseline + 4 * 86_400_000)

      // Trigger evaluate twice with a spike
      engine.recordCost("gpt-4o", 0.1, baseline + 5 * 86_400_000)
      const first = engine.evaluate()
      const second = engine.evaluate()

      // Second call should not create a new alert (dedup within 60s)
      expect(first.length).toBe(1)
      expect(second.length).toBe(0)
    })
  })

  describe("evaluate — drift detection", () => {
    it("detects consecutive daily increases", () => {
      const engine = CostAlertEngine.getInstance({
        minSamples: 1,
        driftDays: 3,
        driftPercent: 10,
        windowDays: 30,
      })

      const baseline = new Date("2026-06-01T00:00:00Z").getTime()
      // 4 consecutive days with >10% increase (gives 3 transitions → driftDays=3 satisfied)
      engine.recordCost("test-label", 1.0, baseline)
      engine.recordCost("test-label", 1.2, baseline + 86_400_000)
      engine.recordCost("test-label", 1.5, baseline + 2 * 86_400_000)
      engine.recordCost("test-label", 2.0, baseline + 3 * 86_400_000)

      const alerts = engine.evaluate()
      expect(alerts.some((a) => a.title.includes("drift"))).toBe(true)
    })
  })

  describe("evaluate — burn rate", () => {
    it("detects high burn rate", () => {
      const engine = CostAlertEngine.getInstance({
        minSamples: 1,
        monthlyInfoThreshold: 0.01, // Very low threshold for testing
        windowDays: 30,
      })

      const baseline = new Date("2026-06-01T00:00:00Z").getTime()
      // Record 5 high-cost samples across a few days
      for (let i = 0; i < 5; i++) {
        engine.recordCost("gpt-4o", 1.0, baseline + i * 86_400_000)
      }

      const alerts = engine.evaluate()
      expect(alerts.some((a) => a.title.includes("burn"))).toBe(true)
    })
  })

  describe("getPendingAlerts / acknowledgeAlert", () => {
    it("lists unacknowledged alerts only", () => {
      const engine = CostAlertEngine.getInstance()
      const baseline = new Date("2026-06-01T00:00:00Z").getTime()
      for (let i = 0; i < 5; i++) engine.recordCost("test", 0.01, baseline + i * 86_400_000)
      engine.recordCost("test", 10.0, Date.now())
      engine.evaluate()
      expect(engine.getPendingAlerts().length).toBe(engine.getAlerts().length)
      // Acknowledge all alerts
      for (const a of engine.getAlerts()) engine.acknowledgeAlert(a.id)
      expect(engine.getPendingAlerts().length).toBe(0)
    })

    it("acknowledgeAlert marks an alert as acknowledged", () => {
      const engine = CostAlertEngine.getInstance()
      const baseline = new Date("2026-06-01T00:00:00Z").getTime()
      for (let i = 0; i < 5; i++) engine.recordCost("test", 0.01, baseline + i * 86_400_000)
      engine.recordCost("test", 10.0, Date.now())
      const alerts = engine.evaluate()
      expect(alerts.length).toBeGreaterThan(0)
      engine.acknowledgeAlert(alerts[0]!.id)
      expect(engine.getPendingAlerts().length).toBe(alerts.length - 1)
    })
  })
})

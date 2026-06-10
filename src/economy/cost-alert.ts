/**
 * cost-alert — Cost spike and drift detection for Tool-Level Economy (v0.15.0).
 *
 * Monitors rolling-window spend, detects anomalous cost spikes using
 * median absolute deviation (MAD), and issues typed alerts that can
 * be forwarded to Slack, Discord, email, or the event bus.
 *
 * Usage:
 *   const alertEngine = CostAlertEngine.getInstance()
 *   alertEngine.recordCost("claude-sonnet-4-6", 0.03)
 *   const alerts = alertEngine.evaluate()
 *   for (const a of alerts) console.log(a.message)
 */

import { createLogger } from "../cli/logger"

const log = createLogger("cost-alert")

// ── Types ──────────────────────────────────────────────────────────────

export interface CostSample {
  /** ISO date string (yyyy-mm-dd) */
  date: string
  /** Model or tool name */
  label: string
  /** Cost in USD */
  costUsd: number
  /** Unix timestamp */
  timestamp: number
}

export type AlertSeverity = "info" | "warn" | "critical"

export interface CostAlert {
  id: string
  severity: AlertSeverity
  title: string
  message: string
  currentValue: number
  threshold: number
  label: string
  triggeredAt: number
  acknowledged: boolean
}

export interface CostAlertConfig {
  /** Multiplier over rolling-window median to trigger a spike alert (default 3) */
  spikeMultiplier: number
  /** Minimum consecutive days of increase to trigger a drift alert (default 3) */
  driftDays: number
  /** Percentage increase over the window average to trigger a drift alert (default 50%) */
  driftPercent: number
  /** Rolling window size in days (default 7) */
  windowDays: number
  /** Minimum samples needed before evaluating (default 5) */
  minSamples: number
  /** Whether alerting is enabled (default true) */
  enabled: boolean
  /** Monthly spend threshold in USD for burn-rate info alert (default 1.0) */
  monthlyInfoThreshold: number
  /** Monthly spend threshold in USD for burn-rate critical alert (default 10.0) */
  monthlyCriticalThreshold: number
}

export const DEFAULT_COST_ALERT_CONFIG: CostAlertConfig = {
  spikeMultiplier: 3,
  driftDays: 3,
  driftPercent: 50,
  windowDays: 7,
  minSamples: 5,
  enabled: true,
  monthlyInfoThreshold: 1.0,
  monthlyCriticalThreshold: 10.0,
}

// ── Alert Engine ───────────────────────────────────────────────────────

export class CostAlertEngine {
  private static instance: CostAlertEngine

  private samples: CostSample[] = []
  private alerts: CostAlert[] = []
  private config: CostAlertConfig

  private constructor(config: Partial<CostAlertConfig> = {}) {
    this.config = { ...DEFAULT_COST_ALERT_CONFIG, ...config }
  }

  /** Get the singleton instance. */
  static getInstance(config?: Partial<CostAlertConfig>): CostAlertEngine {
    if (!CostAlertEngine.instance) {
      CostAlertEngine.instance = new CostAlertEngine(config)
    }
    return CostAlertEngine.instance
  }

  /** Get the current config. */
  getConfig(): Readonly<CostAlertConfig> {
    return this.config
  }

  /** Reset to initial state (useful for testing). */
  static resetInstance(): void {
    CostAlertEngine.instance = null as unknown as CostAlertEngine
  }

  /** Update runtime config. */
  updateConfig(overrides: Partial<CostAlertConfig>): void {
    this.config = { ...this.config, ...overrides }
  }

  /** Record a cost sample. */
  recordCost(label: string, costUsd: number, timestamp?: number): void {
    const ts = timestamp ?? Date.now()
    const date = new Date(ts).toISOString().slice(0, 10)
    this.samples.push({ date, label, costUsd, timestamp: ts })
    log.debug(`Recorded cost: ${label} $${costUsd.toFixed(6)} on ${date}`)
  }

  /** Get all recorded samples. */
  getSamples(): readonly CostSample[] {
    return this.samples
  }

  /** Get all generated alerts. */
  getAlerts(): readonly CostAlert[] {
    return this.alerts
  }

  /** Acknowledge an alert by ID. */
  acknowledgeAlert(id: string): void {
    const alert = this.alerts.find((a) => a.id === id)
    if (alert) alert.acknowledged = true
  }

  /**
   * Evaluate the current sample window and return any new alerts.
   * Call this periodically (e.g. after every N cost records, or on a timer).
   */
  evaluate(): CostAlert[] {
    if (!this.config.enabled) return []
    if (this.samples.length < this.config.minSamples) return []

    const newAlerts: CostAlert[] = []
    const alertsFromSpikes = this.detectSpikes()
    const alertsFromDrift = this.detectDrift()
    const alertsFromBurnRate = this.detectBurnRate()

    for (const alert of [...alertsFromSpikes, ...alertsFromDrift, ...alertsFromBurnRate]) {
      this.alerts.push(alert)
      newAlerts.push(alert)
      if (alert.severity === "critical" || alert.severity === "warn") {
        log.warn(alert.message)
      } else {
        log.info(alert.message)
      }
    }

    return newAlerts
  }

  /** Get a summary of pending (unacknowledged) alerts. */
  getPendingAlerts(): CostAlert[] {
    return this.alerts.filter((a) => !a.acknowledged)
  }

  /** Remove all acknowledged alerts from the history. */
  pruneAcknowledgedAlerts(): void {
    this.alerts = this.alerts.filter((a) => !a.acknowledged)
  }

  /** Clear all samples and alerts. */
  clear(): void {
    this.samples = []
    this.alerts = []
  }

  // ── Private detection methods ──────────────────────────────────────

  /**
   * Detect cost spikes per label using Median Absolute Deviation (MAD).
   * A spike is when the latest sample exceeds median + spikeMultiplier * MAD.
   */
  private detectSpikes(): CostAlert[] {
    const newAlerts: CostAlert[] = []
    const now = Date.now()

    const byLabel = new Map<string, number[]>()
    for (const s of this.samples) {
      const existing = byLabel.get(s.label)
      if (existing) {
        existing.push(s.costUsd)
      } else {
        byLabel.set(s.label, [s.costUsd])
      }
    }

    for (const [label] of byLabel) {
      const cutoff = now - this.config.windowDays * 24 * 60 * 60 * 1000
      const windowSamples = this.samples.filter(
        (s) => s.label === label && s.timestamp >= cutoff,
      )
      if (windowSamples.length < this.config.minSamples) continue

      const windowCosts = windowSamples.map((s) => s.costUsd)
      const median = medianValue(windowCosts)
      const mad = madValue(windowCosts, median)
      const threshold = median + this.config.spikeMultiplier * mad
      const latest = windowSamples[windowSamples.length - 1]
      if (!latest) continue

      if (latest.costUsd <= threshold || mad <= 0) continue

      const recentDuplicate = this.alerts.some(
        (a) =>
          a.title.includes(label) &&
          a.title.includes("spike") &&
          now - a.triggeredAt < 60_000,
      )
      if (recentDuplicate) continue

      const severity: AlertSeverity =
        latest.costUsd > threshold * 2 ? "critical" : "warn"

      newAlerts.push({
        id: `spike-${label}-${now}`,
        severity,
        title: `Cost spike: ${label}`,
        message:
          `${label} cost $${latest.costUsd.toFixed(6)} ` +
          `exceeds median+${this.config.spikeMultiplier}×MAD ` +
          `threshold of $${threshold.toFixed(6)} ` +
          `(median: $${median.toFixed(6)}, MAD: $${mad.toFixed(6)})`,
        currentValue: latest.costUsd,
        threshold,
        label,
        triggeredAt: now,
        acknowledged: false,
      })
    }

    return newAlerts
  }

  /**
   * Detect cost drift: consecutive daily increases exceeding driftPercent.
   */
  private detectDrift(): CostAlert[] {
    const newAlerts: CostAlert[] = []
    const now = Date.now()

    const dailyTotals = new Map<string, number>()
    for (const s of this.samples) {
      dailyTotals.set(s.date, (dailyTotals.get(s.date) ?? 0) + s.costUsd)
    }

    const sortedDays = Array.from(dailyTotals.entries()).sort(
      ([a], [b]) => a.localeCompare(b),
    )
    if (sortedDays.length < this.config.driftDays) return newAlerts

    let consecutiveIncreases = 0
    for (let i = 1; i < sortedDays.length; i++) {
      const prevEntry = sortedDays[i - 1]
      const currEntry = sortedDays[i]
      if (!prevEntry || !currEntry) continue
      const prev = prevEntry[1]
      const curr = currEntry[1]
      consecutiveIncreases = curr > prev ? consecutiveIncreases + 1 : 0

      if (
        consecutiveIncreases >= this.config.driftDays &&
        curr > prev * (1 + this.config.driftPercent / 100)
      ) {
        const recentDuplicate = this.alerts.some(
          (a) => a.title.includes("drift") && now - a.triggeredAt < 300_000,
        )
        if (!recentDuplicate) {
          newAlerts.push({
            id: `drift-${now}`,
            severity: "warn",
            title: "Cost drift detected",
            message:
              `Daily cost has increased for ${consecutiveIncreases} consecutive days. ` +
              `Latest: $${curr.toFixed(4)} vs ${this.config.driftDays} days ago: $${prev.toFixed(4)}.`,
            currentValue: curr,
            threshold: prev * (1 + this.config.driftPercent / 100),
            label: "total",
            triggeredAt: now,
            acknowledged: false,
          })
        }
        break
      }
    }

    return newAlerts
  }

  /**
   * Detect burn-rate anomalies. Projects the monthly spend based on
   * average daily cost and alerts if it exceeds thresholds.
   */
  private detectBurnRate(): CostAlert[] {
    const newAlerts: CostAlert[] = []
    const now = Date.now()

    const dailyTotals = new Map<string, number>()
    for (const s of this.samples) {
      dailyTotals.set(s.date, (dailyTotals.get(s.date) ?? 0) + s.costUsd)
    }

    const sortedDays = Array.from(dailyTotals.entries()).sort(
      ([a], [b]) => a.localeCompare(b),
    )
    if (sortedDays.length < 3) return newAlerts

    const recentWindow = sortedDays.slice(-this.config.windowDays)
    const avgDaily =
      recentWindow.reduce((sum, [, cost]) => sum + cost, 0) /
      recentWindow.length

    const totalSpend = this.samples.reduce((sum, s) => sum + s.costUsd, 0)
    const daysElapsed = Math.max(
      1,
      (now - (this.samples[0]?.timestamp ?? now)) / (1000 * 60 * 60 * 24),
    )
    const projectedMonthly = (totalSpend / daysElapsed) * 30

    if (projectedMonthly <= this.config.monthlyInfoThreshold) return newAlerts

    const recentDuplicate = this.alerts.some(
      (a) => a.title.includes("burn") && now - a.triggeredAt < 3600_000,
    )
    if (recentDuplicate) return newAlerts

    const severity: AlertSeverity =
      projectedMonthly > this.config.monthlyCriticalThreshold
        ? "critical"
        : "info"

    newAlerts.push({
      id: `burnrate-${now}`,
      severity,
      title: `Monthly burn rate: $${projectedMonthly.toFixed(2)}`,
      message:
        `Projected monthly spend is $${projectedMonthly.toFixed(2)} ` +
        `($${avgDaily.toFixed(4)}/day avg over ${recentWindow.length}d). ` +
        (severity === "critical"
          ? `This exceeds the $${this.config.monthlyCriticalThreshold}/mo threshold — consider reviewing provider selection.`
          : `Within the $${this.config.monthlyCriticalThreshold}/mo threshold.`),
      currentValue: projectedMonthly,
      threshold: this.config.monthlyCriticalThreshold,
      label: "burn-rate",
      triggeredAt: now,
      acknowledged: false,
    })

    return newAlerts
  }
}

// ── Stats helpers ──────────────────────────────────────────────────────

function medianValue(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? (sorted[mid] ?? 0)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

function madValue(values: number[], median: number): number {
  if (values.length === 0) return 0
  const deviations = values.map((v) => Math.abs(v - median))
  return medianValue(deviations)
}

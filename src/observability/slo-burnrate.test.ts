import { describe, it, expect, afterAll } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Database } from "bun:sqlite"

import { SLOManager } from "./slo"

const tmp = mkdtempSync(join(tmpdir(), "slo-burnrate-"))

afterAll(() => {
  try {
    rmSync(tmp, { recursive: true, force: true })
  } catch {}
})

describe("SLO burn rate", () => {
  it("exceeds 1 when an error-rate metric doubles", () => {
    const slo = new SLOManager({ dbPath: join(tmp, "error-rate.db") })
    slo.register({
      name: "errors-base",
      description: "error rate",
      target: 0.01,
      windowDays: 30,
      metric: "error_rate",
    })
    slo.register({
      name: "errors-double",
      description: "error rate",
      target: 0.01,
      windowDays: 30,
      metric: "error_rate",
    })

    slo.recordMetric("errors-base", 0.01)
    slo.recordMetric("errors-base", 0.01)
    const atBudget = slo.getBurnRate("errors-base")
    expect(atBudget).not.toBeNull()
    expect(atBudget!.rate).toBeCloseTo(1, 5)

    slo.recordMetric("errors-double", 0.02)
    slo.recordMetric("errors-double", 0.02)
    const doubled = slo.getBurnRate("errors-double")
    expect(doubled).not.toBeNull()
    expect(doubled!.rate).toBeGreaterThan(1)
    expect(doubled!.rate).toBeCloseTo(2, 5)
  })

  it("exceeds 1 for a success-rate SLO whose success rate drops below budget", () => {
    const slo = new SLOManager({ dbPath: join(tmp, "success-rate.db") })
    slo.register({
      name: "availability-base",
      description: "availability",
      target: 0.99,
      windowDays: 30,
      metric: "success_rate",
    })
    slo.register({
      name: "availability-degraded",
      description: "availability",
      target: 0.99,
      windowDays: 30,
      metric: "success_rate",
    })

    slo.recordMetric("availability-base", 0.99)
    slo.recordMetric("availability-base", 0.99)
    const atBudget = slo.getBurnRate("availability-base")
    expect(atBudget).not.toBeNull()
    expect(atBudget!.rate).toBeCloseTo(1, 5)

    slo.recordMetric("availability-degraded", 0.98)
    slo.recordMetric("availability-degraded", 0.98)
    const degraded = slo.getBurnRate("availability-degraded")
    expect(degraded).not.toBeNull()
    expect(degraded!.rate).toBeGreaterThan(1)
    expect(degraded!.rate).toBeCloseTo(2, 5)
  })

  it("reports remaining time derived from the elapsed window fraction", () => {
    const slo = new SLOManager({ dbPath: join(tmp, "remaining.db") })
    slo.register({
      name: "timed",
      description: "timed",
      target: 0.01,
      windowDays: 30,
      metric: "error_rate",
    })

    slo.recordMetric("timed", 0.02)
    slo.recordMetric("timed", 0.02)

    const burn = slo.getBurnRate("timed")
    expect(burn).not.toBeNull()
    expect(burn!.rate).toBeCloseTo(2, 5)
    expect(burn!.timeRemaining).toMatch(/d|h|m/)
    expect(burn!.timeRemaining).not.toBe("infinite")
  })

  it("returns null for metrics without an error budget", () => {
    const slo = new SLOManager({ dbPath: join(tmp, "latency.db") })
    slo.register({
      name: "latency",
      description: "latency",
      target: 500,
      windowDays: 30,
      metric: "latency_p95",
      threshold: 500,
    })
    slo.recordMetric("latency", 100)
    slo.recordMetric("latency", 120)
    expect(slo.getBurnRate("latency")).toBeNull()
  })
})

describe("SLO metric retention", () => {
  it("prunes metrics older than the retention window on write", () => {
    const dbPath = join(tmp, "retention.db")
    const slo = new SLOManager({ dbPath, retentionDays: 1 })
    slo.register({
      name: "pruned",
      description: "pruned",
      target: 0.01,
      windowDays: 30,
      metric: "error_rate",
    })

    const seeder = new Database(dbPath)
    seeder
      .prepare("INSERT INTO slo_metrics (name, timestamp, value) VALUES (?, ?, ?)")
      .run("pruned", Date.now() - 10 * 86400000, 0.5)
    seeder.close()

    const checker = new Database(dbPath)
    const before = checker.prepare("SELECT COUNT(*) AS c FROM slo_metrics").get() as { c: number }
    expect(before.c).toBe(1)
    checker.close()

    slo.recordMetric("pruned", 0.5)

    const after = new Database(dbPath)
    const rows = after.prepare("SELECT COUNT(*) AS c FROM slo_metrics").get() as { c: number }
    after.close()
    expect(rows.c).toBe(1)
  })

  it("defaults to a 90 day retention window", () => {
    const slo = new SLOManager({ dbPath: join(tmp, "default-retention.db") })
    expect(slo.getRetentionDays()).toBe(90)
  })
})

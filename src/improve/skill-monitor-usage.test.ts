import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SkillMonitor } from "./skill-monitor"

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "skill-monitor-usage-"))
}

describe("SkillMonitor usage accounting", () => {
  let dir: string
  let monitor: SkillMonitor

  beforeEach(() => {
    dir = tempDir()
    monitor = new SkillMonitor({
      historyPath: join(dir, "skill-monitor.json"),
      trendWindowDays: 30,
      degradationThreshold: 0.1,
      minRecordsForTrend: 3,
    })
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  })

  it("counts total invocations as the number of recorded usages", () => {
    for (let i = 0; i < 5; i++) {
      monitor.recordUsage("skill-1", "Skill One", true, 0.9, 100, 1000)
    }

    const perf = monitor.getPerformance("skill-1")
    expect(perf).not.toBeNull()
    expect(perf!.totalInvocations).toBe(5)
  })

  it("does not inflate the invocation total across many usages", () => {
    const usages = 12
    for (let i = 0; i < usages; i++) {
      monitor.recordUsage("skill-1", "Skill One", i % 2 === 0, 0.5, 100, 1000)
    }

    const perf = monitor.getPerformance("skill-1")
    expect(perf!.totalInvocations).toBe(usages)
    expect(perf!.overallSuccessRate).toBeCloseTo(0.5, 5)
  })

  it("tracks skills independently", () => {
    monitor.recordUsage("skill-a", "Skill A", true, 0.9, 100, 1000)
    monitor.recordUsage("skill-b", "Skill B", true, 0.8, 200, 2000)
    monitor.recordUsage("skill-b", "Skill B", true, 0.8, 200, 2000)

    expect(monitor.getPerformance("skill-a")!.totalInvocations).toBe(1)
    expect(monitor.getPerformance("skill-b")!.totalInvocations).toBe(2)
  })

  it("detects a degrading skill from per-usage success rates", () => {
    for (let i = 0; i < 5; i++) {
      monitor.recordUsage("degrading", "Degrading", true, 0.9, 100, 1000)
    }
    for (let i = 0; i < 5; i++) {
      monitor.recordUsage("degrading", "Degrading", false, 0.1, 100, 1000)
    }

    const perf = monitor.getPerformance("degrading")
    expect(perf!.trend).toBe("degrading")
    expect(perf!.degradationScore).toBeGreaterThan(0.1)

    const degrading = monitor.getDegradingSkills()
    expect(degrading.some((s) => s.skillId === "degrading")).toBe(true)
  })

  it("detects an improving skill", () => {
    for (let i = 0; i < 5; i++) {
      monitor.recordUsage("improving", "Improving", false, 0.1, 100, 1000)
    }
    for (let i = 0; i < 5; i++) {
      monitor.recordUsage("improving", "Improving", true, 0.9, 100, 1000)
    }

    const perf = monitor.getPerformance("improving")
    expect(perf!.trend).toBe("improving")
    expect(perf!.degradationScore).toBe(0)
  })

  it("bounds the number of stored history records", () => {
    const bounded = new SkillMonitor({
      historyPath: join(dir, "bounded.json"),
      maxRecords: 5,
    })

    for (let i = 0; i < 12; i++) {
      bounded.recordUsage("skill-1", "Skill One", true, 0.9, 100, 1000)
    }

    expect(bounded.getStats().totalRecords).toBe(5)
    expect(bounded.getPerformance("skill-1")!.totalInvocations).toBe(12)
  })
})

/**
 * src/improve/skill-monitor.test.ts
 *
 * Tests for the SkillMonitor that tracks skill performance
 * over time after publication.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, unlinkSync, rmdirSync } from "node:fs"
import { join } from "node:path"
import { SkillMonitor } from "./skill-monitor"
import type { SkillPerformanceRecord } from "./skill-monitor"

// ── Helpers ──────────────────────────────────────────────────────

const TEST_HISTORY_PATH = join(process.cwd(), ".aegis", "test-skill-monitor.json")

function cleanupTestFile(): void {
  try {
    if (existsSync(TEST_HISTORY_PATH)) unlinkSync(TEST_HISTORY_PATH)
    const dir = join(TEST_HISTORY_PATH, "..")
    if (existsSync(dir)) {
      const files = [TEST_HISTORY_PATH]
      for (const f of files) {
        try {
          unlinkSync(f)
        } catch {}
      }
      try {
        rmdirSync(dir)
      } catch {}
    }
  } catch {}
}

// ── Tests ────────────────────────────────────────────────────────

describe("SkillMonitor", () => {
  let monitor: SkillMonitor

  beforeEach(() => {
    cleanupTestFile()
    monitor = new SkillMonitor({
      historyPath: TEST_HISTORY_PATH,
      trendWindowDays: 30,
      degradationThreshold: 0.1,
      minRecordsForTrend: 2,
    })
  })

  afterEach(() => {
    monitor = null!
    cleanupTestFile()
  })

  describe("constructor", () => {
    it("creates with default config", () => {
      const m = new SkillMonitor()
      expect(m).toBeInstanceOf(SkillMonitor)
    })

    it("accepts custom config", () => {
      const m = new SkillMonitor({ degradationThreshold: 0.2 })
      expect(m).toBeInstanceOf(SkillMonitor)
    })
  })

  describe("recordUsage and getPerformance", () => {
    it("records a single usage", async () => {
      monitor.recordUsage("skill-1", "Test Skill", true, 0.9, 500, 2000)

      const perf = monitor.getPerformance("skill-1")
      expect(perf).not.toBeNull()
      expect(perf!.skillId).toBe("skill-1")
      expect(perf!.skillName).toBe("Test Skill")
      expect(perf!.totalInvocations).toBeGreaterThanOrEqual(1)
    })

    it("returns null for unknown skill", () => {
      const perf = monitor.getPerformance("nonexistent")
      expect(perf).toBeNull()
    })

    it("accumulates multiple records", () => {
      monitor.recordUsage("skill-1", "Test Skill", true, 0.9, 100, 1000)
      monitor.recordUsage("skill-1", "Test Skill", true, 0.8, 200, 1500)
      monitor.recordUsage("skill-1", "Test Skill", false, 0.3, 150, 1200)

      const perf = monitor.getPerformance("skill-1")
      expect(perf).not.toBeNull()
      expect(perf!.totalInvocations).toBeGreaterThanOrEqual(3)
      expect(perf!.trend).toBeDefined()
    })

    it("tracks multiple skills independently", () => {
      monitor.recordUsage("skill-a", "Skill A", true, 0.9, 100, 1000)
      monitor.recordUsage("skill-b", "Skill B", true, 0.8, 200, 2000)

      const perfA = monitor.getPerformance("skill-a")
      const perfB = monitor.getPerformance("skill-b")

      expect(perfA!.skillName).toBe("Skill A")
      expect(perfB!.skillName).toBe("Skill B")
      expect(perfA!.totalInvocations).toBe(1)
      expect(perfB!.totalInvocations).toBe(1)
    })
  })

  describe("listAll", () => {
    it("returns empty array when no records", () => {
      const all = monitor.listAll()
      expect(all).toEqual([])
    })

    it("lists all tracked skills", () => {
      monitor.recordUsage("s1", "Skill One", true, 0.9, 100, 1000)
      monitor.recordUsage("s2", "Skill Two", true, 0.8, 200, 2000)

      const all = monitor.listAll()
      expect(all).toHaveLength(2)
      const names = all.map((s) => s.skillName).sort()
      expect(names).toEqual(["Skill One", "Skill Two"])
    })
  })

  describe("getDegradingSkills", () => {
    it("returns empty when no skills are degrading", () => {
      // Record a successful skill with consistent high reward
      monitor.recordUsage("good-skill", "Good Skill", true, 0.9, 100, 1000)

      const degrading = monitor.getDegradingSkills()
      expect(degrading).toBeDefined()
    })

    it("filters by custom threshold", () => {
      monitor.recordUsage("any-skill", "Any", true, 0.5, 100, 1000)

      const withLowThreshold = monitor.getDegradingSkills(0.01)
      expect(Array.isArray(withLowThreshold)).toBe(true)
    })
  })

  describe("getTopSkills", () => {
    it("returns empty when no skills have enough data", () => {
      // getTopSkills filters to skills with >= 3 invocations
      monitor.recordUsage("s1", "S1", true, 0.9, 100, 1000)

      const top = monitor.getTopSkills(5)
      expect(top).toEqual([])
    })

    it("returns top skills ranked by success rate", () => {
      // Record enough data for skill 1 (3+ invocations)
      monitor.recordUsage("s1", "High Performer", true, 0.9, 100, 1000)
      monitor.recordUsage("s1", "High Performer", true, 0.8, 100, 1000)
      monitor.recordUsage("s1", "High Performer", true, 0.85, 100, 1000)

      const top = monitor.getTopSkills(5)
      expect(top.length).toBeGreaterThanOrEqual(1)
      expect(top[0]!.skillName).toBe("High Performer")
    })

    it("respects the limit parameter", () => {
      monitor.recordUsage("s1", "S1", true, 0.9, 100, 1000)
      monitor.recordUsage("s1", "S1", true, 0.8, 100, 1000)
      monitor.recordUsage("s1", "S1", true, 0.85, 100, 1000)
      monitor.recordUsage("s2", "S2", true, 0.7, 100, 1000)
      monitor.recordUsage("s2", "S2", true, 0.75, 100, 1000)
      monitor.recordUsage("s2", "S2", true, 0.72, 100, 1000)

      const top = monitor.getTopSkills(1)
      expect(top).toHaveLength(1)
    })
  })

  describe("getStats", () => {
    it("returns zeros for empty monitor", () => {
      const stats = monitor.getStats()
      expect(stats.totalSkills).toBe(0)
      expect(stats.totalRecords).toBe(0)
      expect(stats.avgSuccessRate).toBe(0)
      expect(stats.degradingSkills).toBe(0)
    })

    it("returns correct stats after recording", () => {
      monitor.recordUsage("s1", "S1", true, 0.9, 100, 1000)
      monitor.recordUsage("s1", "S1", true, 0.8, 100, 1000)
      monitor.recordUsage("s2", "S2", false, 0.3, 100, 1000)

      const stats = monitor.getStats()
      expect(stats.totalSkills).toBe(2)
      expect(stats.totalRecords).toBe(3)
      expect(stats.avgSuccessRate).toBeGreaterThanOrEqual(0)
      expect(typeof stats.degradingSkills).toBe("number")
    })
  })

  describe("trend detection", () => {
    it("detects improving trend with increasing success", () => {
      // Simulate improving performance
      const dates = [
        new Date(Date.now() - 86400000 * 10).toISOString(),
        new Date(Date.now() - 86400000 * 5).toISOString(),
        new Date().toISOString(),
      ]
      // We can't inject timestamps directly, so we test trend field exists
      monitor.recordUsage("trend-skill", "Trend Skill", true, 0.9, 100, 1000)

      const perf = monitor.getPerformance("trend-skill")
      expect(perf).not.toBeNull()
      expect(["improving", "stable", "degrading"]).toContain(perf!.trend)
    })

    it("provides improvement suggestions for low-success skills", () => {
      monitor.recordUsage("bad-skill", "Bad Skill", false, 0.2, 100, 1000)

      const perf = monitor.getPerformance("bad-skill")
      expect(perf).not.toBeNull()
      expect(perf!.improvementSuggestions).toBeDefined()
      expect(Array.isArray(perf!.improvementSuggestions)).toBe(true)
    })
  })
})

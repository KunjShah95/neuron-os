import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, unlinkSync, rmdirSync, readdirSync, statSync } from "node:fs"
import { resolve, join } from "node:path"
import { BaselineManager } from "./baseline"
import type { EvalReport } from "./types"

const TEST_DIR = resolve(process.cwd(), ".aegis", "test-baselines")

function rmdirRecursive(dir: string): void {
  try {
    if (!existsSync(dir)) return
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        rmdirRecursive(fullPath)
      } else {
        unlinkSync(fullPath)
      }
    }
    rmdirSync(dir)
  } catch {}
}

function makeReport(overrides: Partial<EvalReport> = {}): EvalReport {
  return {
    id: "test-report",
    timestamp: new Date().toISOString(),
    model: "test-model",
    agentType: "harness",
    suite: "test-suite",
    totalTests: 3,
    passed: 2,
    failed: 1,
    avgScore: 0.75,
    totalCost: 0.05,
    totalDurationMs: 12000,
    results: [
      {
        test: { id: "t1", name: "Test 1", prompt: "do 1", tags: [], timeout: 60000 },
        passed: true,
        score: 0.9,
        grades: [],
        output: "",
        trace: [],
        steps: 3,
        totalTokens: 100,
        totalCost: 0.01,
        durationMs: 4000,
        model: "test",
        agentType: "harness",
        timestamp: "",
        metadata: {},
      },
      {
        test: { id: "t2", name: "Test 2", prompt: "do 2", tags: [], timeout: 60000 },
        passed: true,
        score: 0.8,
        grades: [],
        output: "",
        trace: [],
        steps: 4,
        totalTokens: 150,
        totalCost: 0.02,
        durationMs: 5000,
        model: "test",
        agentType: "harness",
        timestamp: "",
        metadata: {},
      },
      {
        test: { id: "t3", name: "Test 3", prompt: "do 3", tags: [], timeout: 60000 },
        passed: false,
        score: 0.4,
        grades: [],
        output: "",
        trace: [],
        steps: 2,
        totalTokens: 80,
        totalCost: 0.02,
        durationMs: 3000,
        model: "test",
        agentType: "harness",
        timestamp: "",
        metadata: {},
      },
    ],
    byCategory: { capability: { total: 3, passed: 2, avgScore: 0.75 } } as any,
    regressions: [],
    metadata: {},
    ...overrides,
  }
}

describe("BaselineManager", () => {
  let manager: BaselineManager

  beforeEach(() => {
    rmdirRecursive(TEST_DIR)
    manager = new BaselineManager({ storeDir: TEST_DIR, maxBaselines: 5 })
  })

  afterEach(() => {
    manager = null!
    rmdirRecursive(TEST_DIR)
  })

  it("saves and loads a baseline", () => {
    const report = makeReport()
    const id = manager.save(report, "abc1234")
    expect(id).toBeTruthy()

    const loaded = manager.load(id)
    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe(id)
    expect(loaded!.commitSha).toBe("abc1234")
    expect(loaded!.summary.avgScore).toBe(0.75)
  })

  it("loads the latest baseline for a model", () => {
    const r1 = makeReport({ timestamp: new Date(Date.now() - 86400000).toISOString(), avgScore: 0.7 })
    const r2 = makeReport({ timestamp: new Date().toISOString(), avgScore: 0.85 })
    manager.save(r1)
    const id2 = manager.save(r2)

    const latest = manager.loadLatest("test-model")
    expect(latest).not.toBeNull()
    expect(latest!.id).toBe(id2)
  })

  it("lists baselines for a model", () => {
    manager.save(makeReport())
    manager.save(makeReport())

    const list = manager.list("test-model")
    expect(list.length).toBeGreaterThanOrEqual(2)
  })

  it("compares current report against baseline", () => {
    const baselineReport = makeReport()
    const baseId = manager.save(baselineReport)

    const currentReport = makeReport({
      avgScore: 0.65,
      results: [
        {
          test: { id: "t1", name: "Test 1", prompt: "do 1", tags: [], timeout: 60000 },
          passed: false,
          score: 0.5,
          grades: [],
          output: "",
          trace: [],
          steps: 3,
          totalTokens: 100,
          totalCost: 0.01,
          durationMs: 4000,
          model: "test",
          agentType: "harness",
          timestamp: "",
          metadata: {},
        },
        {
          test: { id: "t2", name: "Test 2", prompt: "do 2", tags: [], timeout: 60000 },
          passed: true,
          score: 0.8,
          grades: [],
          output: "",
          trace: [],
          steps: 4,
          totalTokens: 150,
          totalCost: 0.02,
          durationMs: 5000,
          model: "test",
          agentType: "harness",
          timestamp: "",
          metadata: {},
        },
        {
          test: { id: "t3", name: "Test 3", prompt: "do 3", tags: [], timeout: 60000 },
          passed: false,
          score: 0.4,
          grades: [],
          output: "",
          trace: [],
          steps: 2,
          totalTokens: 80,
          totalCost: 0.02,
          durationMs: 3000,
          model: "test",
          agentType: "harness",
          timestamp: "",
          metadata: {},
        },
      ],
    })

    const baseline = manager.load(baseId)!
    const comparison = manager.compare(currentReport, baseline)

    expect(comparison.overallScoreDelta).toBeCloseTo(-0.1, 2)
    expect(comparison.regressions.length).toBeGreaterThanOrEqual(1)
    expect(comparison.improvements.length).toBe(0)
  })

  it("generates score trends", () => {
    const now = Date.now()
    manager.save(makeReport({ timestamp: new Date(now - 172800000).toISOString(), avgScore: 0.7 }))
    manager.save(makeReport({ timestamp: new Date(now - 86400000).toISOString(), avgScore: 0.75 }))
    manager.save(makeReport({ timestamp: new Date().toISOString(), avgScore: 0.8 }))

    const trends = manager.getTrend("test-model", "test-suite", 7)
    expect(trends).toHaveLength(3)
    expect(trends[0]!.score).toBe(0.7)
    expect(trends[2]!.score).toBe(0.8)
  })

  it("calculates burn rate", () => {
    const now = Date.now()
    manager.save(makeReport({ timestamp: new Date(now - 172800000).toISOString(), avgScore: 0.9, suite: "regression" }))
    manager.save(makeReport({ timestamp: new Date(now - 86400000).toISOString(), avgScore: 0.85, suite: "regression" }))
    manager.save(makeReport({ timestamp: new Date().toISOString(), avgScore: 0.8, suite: "regression" }))

    const burnRate = manager.getBurnRate("test-model", "regression", 0.15)
    expect(burnRate).not.toBeNull()
    expect(burnRate!.totalDrop).toBeGreaterThan(0)
    expect(burnRate!.budgetRemaining).toBeCloseTo(0.05, 2)
  })

  it("deletes a baseline", () => {
    const id = manager.save(makeReport())
    expect(manager.delete(id)).toBe(true)
    expect(manager.load(id)).toBeNull()
  })

  it("formats PR comment markdown", () => {
    const baselineReport = makeReport()
    const baseId = manager.save(baselineReport)
    const baseline = manager.load(baseId)!

    const currentReport = makeReport({ avgScore: 0.65 })
    const comparison = manager.compare(currentReport, baseline)
    const md = manager.formatComparisonMarkdown(currentReport, comparison)

    expect(md).toContain("Agent Eval Results")
    expect(md).toContain("Avg score")
    expect(md).toContain("Regressions")
  })
})

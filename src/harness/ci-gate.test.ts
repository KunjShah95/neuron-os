import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { CIGate, DEFAULT_CI_CONFIG } from "./ci-gate"
import { BaselineManager } from "./baseline"
import { resolve } from "node:path"
import { existsSync, readdirSync, unlinkSync } from "node:fs"
import type { EvalReport } from "./types"

const TEST_DIR = resolve(process.cwd(), ".aegis", "test-ci-gate")

function makeReport(overrides: Partial<EvalReport> = {}): EvalReport {
  return {
    id: "test-report",
    timestamp: new Date().toISOString(),
    model: "test-model",
    agentType: "harness",
    suite: "regression",
    totalTests: 3,
    passed: 3,
    failed: 0,
    avgScore: 0.92,
    totalCost: 0.05,
    totalDurationMs: 12000,
    results: [
      {
        test: { id: "t1", name: "Test 1", prompt: "do 1", tags: [], timeout: 60000 },
        passed: true,
        score: 0.95,
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
        score: 0.9,
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
        passed: true,
        score: 0.88,
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
    byCategory: { regression: { total: 3, passed: 3, avgScore: 0.92 } } as any,
    regressions: [],
    metadata: {},
    ...overrides,
  }
}

describe("CIGate", () => {
  let baselineManager: BaselineManager

  beforeEach(() => {
    baselineManager = new BaselineManager({ storeDir: TEST_DIR, maxBaselines: 5 })
  })

  afterEach(() => {
    try {
      if (existsSync(TEST_DIR)) {
        const files = readdirSync(TEST_DIR)
        for (const f of files) unlinkSync(resolve(TEST_DIR, f))
      }
    } catch {}
  })

  it("passes when scores are above thresholds", async () => {
    const gate = new CIGate(baselineManager, { ...DEFAULT_CI_CONFIG, regressionThreshold: 0.1, minPassRate: 0.8 })
    const report = makeReport()
    const result = await gate.evaluate([report])
    expect(result.passed).toBe(true)
    expect(result.passRate).toBe(1.0)
    expect(result.regressionsFound).toBe(0)
  })

  it("fails when pass rate is below threshold", async () => {
    const gate = new CIGate(baselineManager, { ...DEFAULT_CI_CONFIG, minPassRate: 0.95 })
    const report = makeReport({ totalTests: 10, passed: 8, failed: 2, avgScore: 0.7 })
    const result = await gate.evaluate([report])
    expect(result.passed).toBe(false)
  })

  it("fails with regressions exceeding threshold", async () => {
    // Create baseline with high-scoring results
    const baselineReport = makeReport({
      avgScore: 0.9,
      results: [
        {
          test: { id: "t1", name: "Test 1", prompt: "do 1", tags: [], timeout: 60000 },
          passed: true,
          score: 0.95,
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
          score: 0.9,
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
          passed: true,
          score: 0.85,
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
    baselineManager.save(baselineReport)
    const latestBaseline = baselineManager.loadLatest("test-model", "regression")!

    const gate = new CIGate(baselineManager, { ...DEFAULT_CI_CONFIG, regressionThreshold: 0.02 })
    // Current report has regressed scores
    const currentReport = makeReport({
      avgScore: 0.65,
      results: [
        {
          test: { id: "t1", name: "Test 1", prompt: "do 1", tags: [], timeout: 60000 },
          passed: false,
          score: 0.55,
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
          passed: false,
          score: 0.6,
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
          score: 0.8,
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
    const result = await gate.evaluate([currentReport], latestBaseline.id)
    expect(result.passed).toBe(false)
    expect(result.regressionsFound).toBeGreaterThan(0)
  })

  it("aggregates multiple runs with pass@k", async () => {
    const gate = new CIGate(baselineManager, { ...DEFAULT_CI_CONFIG, warmupCount: 0 })
    const r1 = makeReport({ id: "run-1", avgScore: 0.85 })
    const r2 = makeReport({ id: "run-2", avgScore: 0.92 })
    const result = await gate.evaluate([r1, r2])
    expect(result.aggregatedScore).toBeGreaterThanOrEqual(0.9)
  })

  it("generates PR comment when annotatePR is enabled", async () => {
    const baselineReport = makeReport()
    const baseId = baselineManager.save(baselineReport)
    const baseline = baselineManager.load(baseId)!

    const gate = new CIGate(baselineManager, { ...DEFAULT_CI_CONFIG, annotatePR: true })
    const currentReport = makeReport({ avgScore: 0.92 })
    const result = await gate.evaluate([currentReport], baseline.id)
    expect(result.prComment).toBeTruthy()
    expect(result.prComment).toContain("Agent Eval Results")
  })

  it("handles empty reports gracefully", async () => {
    const gate = new CIGate(baselineManager)
    expect(gate.evaluate([])).rejects.toThrow()
  })
})

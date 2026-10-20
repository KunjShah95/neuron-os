import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, rmSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { CIGate } from "./ci-gate"
import { BaselineManager } from "./baseline"
import type { EvalReport } from "./types"

const TEST_DIR = resolve(process.cwd(), ".aegis", "test-ci-gate-score-direction")

function makeReport(avgScore: number, timestamp: string): EvalReport {
  const score = avgScore
  return {
    id: `report-${timestamp}`,
    timestamp,
    model: "test-model",
    agentType: "harness",
    suite: "regression",
    totalTests: 2,
    passed: 2,
    failed: 0,
    avgScore,
    totalCost: 0.01,
    totalDurationMs: 1000,
    results: [
      {
        test: { id: "t1", name: "Test 1", prompt: "do 1", tags: [], timeout: 60000 },
        passed: true,
        score,
        grades: [],
        output: "",
        trace: [],
        steps: 1,
        totalTokens: 10,
        totalCost: 0.005,
        durationMs: 100,
        model: "test-model",
        agentType: "harness",
        timestamp,
        metadata: {},
      },
      {
        test: { id: "t2", name: "Test 2", prompt: "do 2", tags: [], timeout: 60000 },
        passed: true,
        score,
        grades: [],
        output: "",
        trace: [],
        steps: 1,
        totalTokens: 10,
        totalCost: 0.005,
        durationMs: 100,
        model: "test-model",
        agentType: "harness",
        timestamp,
        metadata: {},
      },
    ],
    byCategory: { regression: { total: 2, passed: 2, avgScore } } as never,
    regressions: [],
    metadata: {},
  }
}

describe("CIGate score direction", () => {
  let baselineManager: BaselineManager

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(TEST_DIR, { recursive: true })
    baselineManager = new BaselineManager({ storeDir: resolve(TEST_DIR, "baselines"), maxBaselines: 5 })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it("passes when the score improves beyond the regression threshold", async () => {
    const now = new Date().toISOString()
    baselineManager.save(makeReport(0.8, now), "base")

    const gate = new CIGate(baselineManager, {
      baselineModel: "test-model",
      suite: "regression",
      regressionThreshold: 0.05,
      minPassRate: 0.8,
      criticalFailThreshold: 1,
      reportPath: resolve(TEST_DIR, "report.json"),
    })

    const result = await gate.evaluate([makeReport(0.92, new Date().toISOString())])

    expect(result.comparison?.overallScoreDelta).toBeCloseTo(0.12, 5)
    expect(result.passed).toBe(true)
    expect(result.summary).toContain("PASSED")
    expect(result.summary).not.toContain("Score drop")
  })

  it("fails when the score regresses past the regression threshold", async () => {
    const now = new Date().toISOString()
    baselineManager.save(makeReport(0.9, now), "base")

    const gate = new CIGate(baselineManager, {
      baselineModel: "test-model",
      suite: "regression",
      regressionThreshold: 0.05,
      minPassRate: 0.8,
      criticalFailThreshold: 1,
      reportPath: resolve(TEST_DIR, "report.json"),
    })

    const result = await gate.evaluate([makeReport(0.8, new Date().toISOString())])

    expect(result.comparison?.overallScoreDelta).toBeCloseTo(-0.1, 5)
    expect(result.passed).toBe(false)
    expect(result.summary).toContain("Score drop 0.100")
  })

  it("passes when the score regresses but stays inside the threshold", async () => {
    const now = new Date().toISOString()
    baselineManager.save(makeReport(0.9, now), "base")

    const gate = new CIGate(baselineManager, {
      baselineModel: "test-model",
      suite: "regression",
      regressionThreshold: 0.05,
      minPassRate: 0.8,
      criticalFailThreshold: 1,
      reportPath: resolve(TEST_DIR, "report.json"),
    })

    const result = await gate.evaluate([makeReport(0.88, new Date().toISOString())])

    expect(result.comparison?.overallScoreDelta).toBeCloseTo(-0.02, 5)
    expect(result.passed).toBe(true)
  })

  it("writes the gate report to the configured path", async () => {
    const gate = new CIGate(baselineManager, {
      reportPath: resolve(TEST_DIR, "report.json"),
    })

    await gate.evaluate([makeReport(0.9, new Date().toISOString())])

    expect(existsSync(resolve(TEST_DIR, "report.json"))).toBe(true)
  })
})

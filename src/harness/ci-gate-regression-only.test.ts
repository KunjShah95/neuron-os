import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

import { CIGate } from "./ci-gate"
import { BaselineManager } from "./baseline"
import type { EvalReport } from "./types"

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

describe("CIGate regression-only semantics", () => {
  let baselineManager: BaselineManager
  let testDir: string

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "aegis-ci-gate-"))
    baselineManager = new BaselineManager({ storeDir: resolve(testDir, "baselines"), maxBaselines: 5 })
  })

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true })
  })

  function makeGate(): CIGate {
    return new CIGate(baselineManager, {
      baselineModel: "test-model",
      suite: "regression",
      regressionThreshold: 0.05,
      minPassRate: 0.8,
      criticalFailThreshold: 1,
      reportPath: resolve(testDir, "report.json"),
    })
  }

  it("does not fail on an improvement larger than the regression threshold", async () => {
    baselineManager.save(makeReport(0.80, new Date().toISOString()), "base")

    const result = await makeGate().evaluate([makeReport(0.92, new Date().toISOString())])

    expect(result.comparison?.overallScoreDelta).toBeGreaterThan(0)
    expect(result.passed).toBe(true)
    expect(result.summary).toContain("PASSED")
    expect(result.summary).not.toContain("Score drop")
  })

  it("does not fail on a small improvement inside the threshold", async () => {
    baselineManager.save(makeReport(0.80, new Date().toISOString()), "base")

    const result = await makeGate().evaluate([makeReport(0.82, new Date().toISOString())])

    expect(result.comparison?.overallScoreDelta).toBeGreaterThan(0)
    expect(result.passed).toBe(true)
  })

  it("still fails on a real regression and reports the drop magnitude", async () => {
    baselineManager.save(makeReport(0.90, new Date().toISOString()), "base")

    const result = await makeGate().evaluate([makeReport(0.80, new Date().toISOString())])

    expect(result.comparison?.overallScoreDelta).toBeLessThan(0)
    expect(result.passed).toBe(false)
    expect(result.summary).toContain("Score drop 0.100")
  })
})

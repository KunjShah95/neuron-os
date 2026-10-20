import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { rmSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { BaselineManager } from "./baseline"
import type { EvalReport } from "./types"

const TEST_DIR = resolve(process.cwd(), ".aegis", "test-baseline-prune")

function makeReport(avgScore: number, timestamp: string): EvalReport {
  return {
    id: `report-${avgScore}`,
    timestamp,
    model: "test-model",
    agentType: "harness",
    suite: "regression",
    totalTests: 1,
    passed: 1,
    failed: 0,
    avgScore,
    totalCost: 0.01,
    totalDurationMs: 1000,
    results: [
      {
        test: { id: "t1", name: "Test 1", prompt: "do 1", tags: [], timeout: 60000 },
        passed: true,
        score: avgScore,
        grades: [],
        output: "",
        trace: [],
        steps: 1,
        totalTokens: 10,
        totalCost: 0.01,
        durationMs: 100,
        model: "test-model",
        agentType: "harness",
        timestamp,
        metadata: {},
      },
    ],
    byCategory: { regression: { total: 1, passed: 1, avgScore } } as never,
    regressions: [],
    metadata: {},
  }
}

describe("BaselineManager pruning", () => {
  let manager: BaselineManager

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
    mkdirSync(TEST_DIR, { recursive: true })
    manager = new BaselineManager({ storeDir: TEST_DIR, maxBaselines: 2 })
  })

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true })
  })

  it("keeps the newest baseline as loadLatest after pruning", () => {
    const now = Date.now()
    const oldest = manager.save(makeReport(0.6, new Date(now - 3 * 86400000).toISOString()), "oldest")
    const middle = manager.save(makeReport(0.7, new Date(now - 2 * 86400000).toISOString()), "middle")
    const newest = manager.save(makeReport(0.9, new Date(now - 1 * 86400000).toISOString()), "newest")

    const latest = manager.loadLatest("test-model", "regression")

    expect(latest).not.toBeNull()
    expect(latest!.id).toBe(newest)
    expect(latest!.id).not.toBe(oldest)
    expect(latest!.id).not.toBe(middle)
    expect(latest!.summary.avgScore).toBe(0.9)
  })

  it("keeps the cached list sorted ascending after pruning", () => {
    const now = Date.now()
    manager.save(makeReport(0.6, new Date(now - 3 * 86400000).toISOString()), "oldest")
    manager.save(makeReport(0.7, new Date(now - 2 * 86400000).toISOString()), "middle")
    manager.save(makeReport(0.9, new Date(now - 1 * 86400000).toISOString()), "newest")

    const list = manager.list("test-model")
    const timestamps = list.map((b) => new Date(b.timestamp).getTime())

    expect(timestamps.length).toBe(2)
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]!).toBeGreaterThan(timestamps[i - 1]!)
    }
  })

  it("returns the newest baseline across repeated reads", () => {
    const now = Date.now()
    manager.save(makeReport(0.6, new Date(now - 3 * 86400000).toISOString()), "oldest")
    manager.save(makeReport(0.7, new Date(now - 2 * 86400000).toISOString()), "middle")
    const newest = manager.save(makeReport(0.9, new Date(now - 1 * 86400000).toISOString()), "newest")

    expect(manager.loadLatest("test-model", "regression")!.id).toBe(newest)
    expect(manager.loadLatest("test-model", "regression")!.id).toBe(newest)
    expect(manager.list("test-model")[manager.list("test-model").length - 1]!.id).toBe(newest)
  })

  it("prunes the oldest baseline beyond the configured maximum", () => {
    const now = Date.now()
    const oldest = manager.save(makeReport(0.6, new Date(now - 3 * 86400000).toISOString()), "oldest")
    manager.save(makeReport(0.7, new Date(now - 2 * 86400000).toISOString()), "middle")
    manager.save(makeReport(0.9, new Date(now - 1 * 86400000).toISOString()), "newest")

    expect(manager.load(oldest)).toBeNull()
    expect(manager.list("test-model").length).toBe(2)
  })
})

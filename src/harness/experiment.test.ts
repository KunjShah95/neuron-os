import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readdirSync, unlinkSync } from "node:fs"
import { resolve } from "node:path"
import { ExperimentManager } from "./experiment"
import type { EvalReport } from "./types"

const TEST_DIR = resolve(process.cwd(), ".aegis", "test-experiments")

function makeReport(overrides: Partial<EvalReport> = {}): EvalReport {
  return {
    id: "test-report",
    timestamp: new Date().toISOString(),
    model: "test-model",
    agentType: "harness",
    suite: "test",
    totalTests: 2,
    passed: 2,
    failed: 0,
    avgScore: 0.9,
    totalCost: 0.02,
    totalDurationMs: 8000,
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
    ],
    byCategory: { capability: { total: 2, passed: 2, avgScore: 0.9 } } as any,
    regressions: [],
    metadata: {},
    ...overrides,
  }
}

describe("ExperimentManager", () => {
  let manager: ExperimentManager

  beforeEach(() => {
    manager = new ExperimentManager(TEST_DIR)
  })

  afterEach(() => {
    try {
      if (existsSync(TEST_DIR)) {
        const files = readdirSync(TEST_DIR)
        for (const f of files) unlinkSync(resolve(TEST_DIR, f))
      }
    } catch {}
  })

  it("creates an experiment", async () => {
    const exp = await manager.create("Test run", {
      suite: "regression",
      model: "claude-sonnet-4-6",
      agentType: "harness",
      runnerConfig: {},
    })
    expect(exp.id).toBeTruthy()
    expect(exp.name).toBe("Test run")
    expect(exp.status).toBe("running")
  })

  it("completes an experiment with a report", async () => {
    const exp = await manager.create("Test run", {
      suite: "regression",
      model: "claude-sonnet-4-6",
      agentType: "harness",
      runnerConfig: {},
    })
    const report = makeReport()
    manager.complete(exp.id, report)

    const loaded = manager.load(exp.id)
    expect(loaded).not.toBeNull()
    expect(loaded!.status).toBe("completed")
    expect(loaded!.report).toBeDefined()
    expect(loaded!.report!.avgScore).toBe(0.9)
  })

  it("fails an experiment", async () => {
    const exp = await manager.create("Test run", {
      suite: "regression",
      model: "test",
      agentType: "harness",
      runnerConfig: {},
    })
    manager.fail(exp.id, "Something went wrong")

    const loaded = manager.load(exp.id)
    expect(loaded!.status).toBe("failed")
    expect(loaded!.error).toBe("Something went wrong")
  })

  it("lists experiments", async () => {
    await manager.create("Exp A", { suite: "s1", model: "m1", agentType: "harness", runnerConfig: {} })
    await manager.create("Exp B", { suite: "s2", model: "m2", agentType: "harness", runnerConfig: {} })

    const list = manager.list()
    expect(list).toHaveLength(2)
  })

  it("compares two experiments", async () => {
    const a = await manager.create("Exp A", { suite: "s1", model: "m1", agentType: "harness", runnerConfig: {} })
    const b = await manager.create("Exp B", { suite: "s1", model: "m2", agentType: "harness", runnerConfig: {} })

    manager.complete(a.id, makeReport({ avgScore: 0.8 }))
    manager.complete(b.id, makeReport({ avgScore: 0.9 }))

    const comparison = manager.compare(a.id, b.id)
    expect(comparison.scoreDelta).toBeCloseTo(0.1, 2)
    expect(comparison.configDiff.model).toBeDefined()
  })

  it("tags an experiment", async () => {
    const exp = await manager.create("Test", { suite: "s1", model: "m1", agentType: "harness", runnerConfig: {} })
    manager.tag(exp.id, ["regression", "prompt-change"])

    const loaded = manager.load(exp.id)
    expect(loaded!.tags).toContain("regression")
    expect(loaded!.tags).toContain("prompt-change")
  })

  it("deletes an experiment", async () => {
    const exp = await manager.create("To delete", { suite: "s1", model: "m1", agentType: "harness", runnerConfig: {} })
    expect(manager.delete(exp.id)).toBe(true)
    expect(manager.load(exp.id)).toBeNull()
  })
})

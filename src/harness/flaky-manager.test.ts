import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { FlakyManager } from "./flaky-manager"
import type { EvalResult } from "./types"

// Helper to create a minimal EvalResult
function makeResult(
  passed: boolean,
  score: number,
  testId = "test-1",
  overrides: Partial<EvalResult> = {},
): EvalResult {
  return {
    test: {
      id: testId,
      name: testId,
      prompt: "do something",
      tags: [],
      timeout: 30000,
    },
    passed,
    score,
    grades: [],
    output: passed ? "ok" : "fail",
    trace: [],
    steps: 1,
    totalTokens: 10,
    totalCost: 0.01,
    durationMs: 100,
    model: "test-model",
    agentType: "test",
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides,
  }
}

describe("FlakyManager", () => {
  let manager: FlakyManager

  beforeEach(() => {
    // Use a unique temp path per test to prevent state leaking across tests
    const tmpDir = `.test-flaky-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    manager = new FlakyManager({
      flakyThreshold: 0.3,
      quarantineAfterFlakes: 3,
      maxRetries: 3,
      flakyHistorySize: 20,
      dbPath: tmpDir,
    })
    // Clean up any leftover state from the temp path
    manager.clearRecords()
  })

  afterEach(() => {
    manager.clearRecords()
  })

  // ── Initial State ───────────────────────────────────────────

  it("should have no records initially", () => {
    expect(manager.isQuarantined("test-1")).toBe(false)
    expect(manager.isFlaky("test-1")).toBe(false)
    expect(manager.getFlakyTests()).toHaveLength(0)
  })

  it("should have zero counts in summary", () => {
    const summary = manager.getSummary()
    expect(summary.healthy).toBe(0)
    expect(summary.flaky).toBe(0)
    expect(summary.quarantined).toBe(0)
    expect(summary.total).toBe(0)
  })

  // ── recordRun ───────────────────────────────────────────────

  it("should record a successful run without flaky status", () => {
    manager.recordRun("test-1", makeResult(true, 1.0))

    const record = manager.getRecord("test-1")
    expect(record?.totalRuns).toBe(1)
    expect(record?.flakyRuns).toBe(0)
    expect(record?.status).toBe("healthy")
  })

  it("should detect flaky behavior when first fails and retry passes", () => {
    manager.recordRun("test-1", makeResult(false, 0.0), makeResult(true, 0.9))

    const record = manager.getRecord("test-1")
    expect(record?.totalRuns).toBe(1)
    expect(record?.flakyRuns).toBe(1)
    expect(record?.consecutiveFlakes).toBe(1)
    expect(record?.status).toBe("flaky")
    expect(record?.flakeHistory).toHaveLength(1)
  })

  it("should NOT mark as flaky when first passes even if retry also passes", () => {
    manager.recordRun("test-1", makeResult(true, 1.0), makeResult(true, 1.0))

    const record = manager.getRecord("test-1")
    expect(record?.flakyRuns).toBe(0)
    expect(record?.status).toBe("healthy")
  })

  it("should NOT mark as flaky when both first and retry fail", () => {
    manager.recordRun("test-1", makeResult(false, 0.0), makeResult(false, 0.2))

    const record = manager.getRecord("test-1")
    expect(record?.flakyRuns).toBe(0)
    expect(record?.status).toBe("healthy")
  })

  it("should increment consecutive flakes on repeated flaky runs", () => {
    manager.recordRun("test-1", makeResult(false, 0.1), makeResult(true, 0.8))
    manager.recordRun("test-1", makeResult(false, 0.2), makeResult(true, 0.9))

    const record = manager.getRecord("test-1")
    expect(record?.consecutiveFlakes).toBe(2)
  })

  it("should reset consecutive flakes on a non-flaky run", () => {
    manager.recordRun("test-1", makeResult(false, 0.1), makeResult(true, 0.8)) // flaky
    manager.recordRun("test-1", makeResult(true, 1.0)) // healthy

    const record = manager.getRecord("test-1")
    expect(record?.consecutiveFlakes).toBe(0)
    expect(record?.flakyRuns).toBe(1) // Still counted
  })

  // ── Auto-Quarantine ─────────────────────────────────────────

  it("should auto-quarantine after reaching consecutive flake threshold", () => {
    // 3 consecutive flaky runs → quarantine
    manager.recordRun("test-1", makeResult(false, 0.0), makeResult(true, 0.8))
    manager.recordRun("test-1", makeResult(false, 0.0), makeResult(true, 0.8))
    manager.recordRun("test-1", makeResult(false, 0.0), makeResult(true, 0.8))

    expect(manager.isQuarantined("test-1")).toBe(true)
    expect(manager.isFlaky("test-1")).toBe(false)
  })

  it("should auto-quarantine when flaky rate exceeds threshold", () => {
    // 5 flaky runs out of 10 total = 50% > 30% threshold
    for (let i = 0; i < 5; i++) {
      manager.recordRun("test-1", makeResult(false, 0.0), makeResult(true, 0.8))
      manager.recordRun("test-1", makeResult(true, 1.0)) // healthy
    }

    expect(manager.isQuarantined("test-1")).toBe(true)
  })

  // ── isQuarantined / isFlaky ─────────────────────────────────

  it("should return false for unknown tests", () => {
    expect(manager.isQuarantined("unknown")).toBe(false)
    expect(manager.isFlaky("unknown")).toBe(false)
  })

  // ── getFlakyTests ───────────────────────────────────────────

  it("should return non-healthy tests sorted by flaky count descending", () => {
    manager.recordRun("test-a", makeResult(false, 0.0), makeResult(true, 0.9))
    manager.recordRun("test-a", makeResult(false, 0.0), makeResult(true, 0.9))
    manager.recordRun("test-b", makeResult(false, 0.0), makeResult(true, 0.9))

    const flaky = manager.getFlakyTests()
    expect(flaky.length).toBe(2)
    // test-a has 2 flaky runs, test-b has 1
    expect(flaky[0].testId).toBe("test-a")
    expect(flaky[1].testId).toBe("test-b")
  })

  it("should not include healthy tests", () => {
    manager.recordRun("test-1", makeResult(true, 1.0))
    manager.recordRun("test-1", makeResult(true, 1.0))

    expect(manager.getFlakyTests()).toHaveLength(0)
  })

  // ── getRecord ───────────────────────────────────────────────

  it("should return undefined for unknown test", () => {
    expect(manager.getRecord("unknown")).toBeUndefined()
  })

  it("should return the record for a known test", () => {
    manager.recordRun("test-1", makeResult(true, 1.0))
    const record = manager.getRecord("test-1")
    expect(record?.testId).toBe("test-1")
    expect(record?.totalRuns).toBe(1)
  })

  // ── unquarantine ────────────────────────────────────────────

  it("should un-quarantine a test back to flaky status", () => {
    // Create quarantine
    manager.recordRun("test-1", makeResult(false, 0.0), makeResult(true, 0.8))
    manager.recordRun("test-1", makeResult(false, 0.0), makeResult(true, 0.8))
    manager.recordRun("test-1", makeResult(false, 0.0), makeResult(true, 0.8))

    expect(manager.isQuarantined("test-1")).toBe(true)

    manager.unquarantine("test-1")
    expect(manager.isQuarantined("test-1")).toBe(false)
    expect(manager.isFlaky("test-1")).toBe(true)
  })

  it("should not crash unquarantine on unknown test", () => {
    expect(() => manager.unquarantine("unknown")).not.toThrow()
  })

  // ── markHealthy ─────────────────────────────────────────────

  it("should mark a known test as healthy", () => {
    manager.recordRun("test-1", makeResult(false, 0.0), makeResult(true, 0.8))
    expect(manager.isFlaky("test-1")).toBe(true)

    manager.markHealthy("test-1")
    expect(manager.isFlaky("test-1")).toBe(false)
    expect(manager.isQuarantined("test-1")).toBe(false)
    const record = manager.getRecord("test-1")
    expect(record?.consecutiveFlakes).toBe(0)
  })

  it("should not crash markHealthy on unknown test", () => {
    expect(() => manager.markHealthy("unknown")).not.toThrow()
  })

  // ── autoSuggestFix ──────────────────────────────────────────

  it("should return null for unknown test", () => {
    expect(manager.autoSuggestFix("unknown")).toBeNull()
  })

  it("should suggest timeout fix when first attempt score is 0", () => {
    manager.recordRun("test-1", makeResult(false, 0.0, "test-1"), makeResult(true, 1.0, "test-1"))
    const suggestion = manager.autoSuggestFix("test-1")
    expect(suggestion?.success).toBe(true)
    expect(suggestion?.suggestion).toContain("Increase timeout")
  })

  it("should suggest environment fix when first attempt score < 0.3", () => {
    manager.recordRun(
      "test-1",
      makeResult(false, 0.2, "test-1", { output: "error: module not found" }),
      makeResult(true, 0.8, "test-1"),
    )
    const suggestion = manager.autoSuggestFix("test-1")
    expect(suggestion?.success).toBe(true)
    expect(suggestion?.suggestion).toContain("environment")
  })

  it("should suggest judge review for other flaky patterns", () => {
    manager.recordRun(
      "test-1",
      makeResult(false, 0.6, "test-1", { output: "partial output" }),
      makeResult(true, 0.8, "test-1"),
    )
    const suggestion = manager.autoSuggestFix("test-1")
    expect(suggestion?.success).toBe(true)
    expect(suggestion?.suggestion).toContain("judge")
  })

  // ── getSummary ──────────────────────────────────────────────

  it("should return correct summary counts", () => {
    // 1 healthy test
    manager.recordRun("healthy-1", makeResult(true, 1.0))

    // 1 flaky test (2 flaky runs)
    manager.recordRun("flaky-1", makeResult(false, 0.0), makeResult(true, 0.8))

    // 1 quarantined test (3 consecutive flakes)
    manager.recordRun("quar-1", makeResult(false, 0.0), makeResult(true, 0.8))
    manager.recordRun("quar-1", makeResult(false, 0.0), makeResult(true, 0.8))
    manager.recordRun("quar-1", makeResult(false, 0.0), makeResult(true, 0.8))

    const summary = manager.getSummary()
    expect(summary.total).toBe(3)
    expect(summary.healthy).toBe(1)
    expect(summary.flaky).toBe(1)
    expect(summary.quarantined).toBe(1)
  })
})

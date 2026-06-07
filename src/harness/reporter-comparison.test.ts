import { describe, it, expect } from "bun:test"
import { ComparisonReportGenerator } from "./reporter-comparison"
import type { EvalReport } from "./types"

function makeReport(overrides: Partial<EvalReport> = {}): EvalReport {
  return {
    id: "test",
    timestamp: new Date().toISOString(),
    model: "test",
    agentType: "harness",
    suite: "test",
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

describe("ComparisonReportGenerator", () => {
  const generator = new ComparisonReportGenerator()

  it("detects regressions", () => {
    const baseline = makeReport()
    const current = makeReport({
      avgScore: 0.6,
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
    const comparison = generator.generate(current, baseline)
    expect(comparison.regressions.length).toBeGreaterThan(0)
    expect(comparison.scoreDelta).toBeLessThan(0)
  })

  it("detects improvements", () => {
    const baseline = makeReport()
    const current = makeReport({
      avgScore: 0.85,
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
          score: 0.85,
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
          score: 0.75,
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
    const comparison = generator.generate(current, baseline)
    expect(comparison.improvements.length).toBeGreaterThan(0)
    expect(comparison.scoreDelta).toBeGreaterThan(0)
  })

  it("detects new and removed tests", () => {
    const baseline = makeReport()
    const current = makeReport({
      results: [
        ...baseline.results,
        {
          test: { id: "t4", name: "Test 4", prompt: "do 4", tags: [], timeout: 60000 },
          passed: true,
          score: 0.85,
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
    })
    current.totalTests = 4
    current.passed = 3

    const comparison = generator.generate(current, baseline)
    expect(comparison.newTests).toHaveLength(1)
    expect(comparison.newTests[0]!.id).toBe("t4")
  })

  it("generates HTML report", () => {
    const baseline = makeReport()
    const current = makeReport({ avgScore: 0.7 })
    const comparison = generator.generate(current, baseline)
    const html = generator.generateHtml(current, comparison)
    expect(html).toContain("html")
    expect(html).toContain("Evaluation Comparison")
  })

  it("reports no changes when identical", () => {
    const report = makeReport()
    const comparison = generator.generate(report, report)
    expect(comparison.regressions).toHaveLength(0)
    expect(comparison.improvements).toHaveLength(0)
    expect(comparison.scoreDelta).toBe(0)
  })
})

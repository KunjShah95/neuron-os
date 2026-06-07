/**
 * src/harness/multi-agent-collector.test.ts
 *
 * Tests for the MultiAgentMetricCollector — collects coordination
 * metrics from multi-agent trace data.
 */

import { describe, it, expect } from "bun:test"
import { MultiAgentMetricCollector } from "./multi-agent-collector"
import { createMultiAgentTest, MULTI_AGENT_SCENARIOS } from "./multi-agent"
import type { ToolTrace } from "./types"

// ── Helpers ──────────────────────────────────────────────────────

function makeTrace(name: string, overrides: Partial<ToolTrace> = {}): ToolTrace {
  return {
    name,
    params: {},
    result: overrides.result ?? "ok",
    durationMs: overrides.durationMs ?? 100,
    tokenCost: overrides.tokenCost ?? 50,
    ...overrides,
  }
}

function makeAgentTrace(
  role: string,
  traceNames: string[],
  output?: string,
): { role: string; traces: ToolTrace[]; output: string } {
  return {
    role,
    traces: traceNames.map((n) => makeTrace(n)),
    output: output ?? `Output from ${role}`,
  }
}

// ── Tests ────────────────────────────────────────────────────────

describe("MultiAgentMetricCollector", () => {
  const collector = new MultiAgentMetricCollector()

  describe("collect", () => {
    it("returns metrics for a sequential pattern", () => {
      const test = createMultiAgentTest(MULTI_AGENT_SCENARIOS[0]!, "Build a feature")
      const traces = [
        makeAgentTrace("architect", ["read", "write"], "Arch spec"),
        makeAgentTrace("engineer", ["read", "write", "bash"], "Implementation"),
        makeAgentTrace("reviewer", ["read"], "Review comments"),
      ]

      const metrics = collector.collect(test, traces, 30000)

      expect(metrics.pattern).toBe("sequential")
      expect(metrics.totalHandoffs).toBeGreaterThanOrEqual(0)
      expect(metrics.handoffAccuracy).toBeGreaterThanOrEqual(0)
      expect(metrics.contextLossScore).toBeGreaterThanOrEqual(0)
      expect(metrics.agentUtilization).toBe(1) // All agents have traces
      expect(metrics.contributionBalance).toBeGreaterThanOrEqual(0)
      // Non-debate patterns return null for convergence
      expect(metrics.convergenceRounds).toBeNull()
      expect(metrics.parallelSpeedup).toBeNull()
    })

    it("returns parallel speedup for parallel pattern", () => {
      const scenario = MULTI_AGENT_SCENARIOS.find((s) => s.pattern === "parallel")!
      const test = createMultiAgentTest(scenario, "Generate solutions")
      const traces = [
        makeAgentTrace("writer-a", ["read", "write", "think"], "Solution A"),
        makeAgentTrace("writer-b", ["read", "write"], "Solution B"),
        makeAgentTrace("writer-c", ["read"], "Solution C"),
        makeAgentTrace("selector", ["read", "write"], "Selection"),
      ]

      const metrics = collector.collect(test, traces, 5000)

      expect(metrics.pattern).toBe("parallel")
      expect(metrics.parallelSpeedup).not.toBeNull()
      expect(metrics.parallelSpeedup!).toBeGreaterThan(0)
    })

    it("returns consensus metrics for debate pattern", () => {
      const scenario = MULTI_AGENT_SCENARIOS.find((s) => s.pattern === "debate")!
      const test = createMultiAgentTest(scenario, "Debate architecture")
      const traces = [
        makeAgentTrace("proponent", ["read", "write", "think"], "Use microservices"),
        makeAgentTrace("opponent", ["read", "write"], "Use monolith"),
        makeAgentTrace("judge", ["read", "write"], "Decision: monolith"),
      ]

      const metrics = collector.collect(test, traces, 20000)

      expect(metrics.pattern).toBe("debate")
      expect(metrics.convergenceRounds).not.toBeNull()
      expect(metrics.consensusStability).not.toBeNull()
      expect(metrics.disagreementRate).not.toBeNull()
    })

    it("returns decomposition quality for hierarchical pattern", () => {
      const scenario = MULTI_AGENT_SCENARIOS.find((s) => s.pattern === "hierarchical")!
      const test = createMultiAgentTest(scenario, "Decompose task")
      const traces = [
        makeAgentTrace("supervisor", ["read", "write", "think"], "Plan"),
        makeAgentTrace("sub-agent-1", ["read", "write", "bash"], "Part A"),
        makeAgentTrace("sub-agent-2", ["read", "write"], "Part B"),
        makeAgentTrace("synthesizer", ["read", "write"], "Result"),
      ]

      const metrics = collector.collect(test, traces, 40000)

      expect(metrics.pattern).toBe("hierarchical")
      expect(metrics.decompositionQuality).not.toBeNull()
      expect(metrics.decompositionQuality!).toBeGreaterThan(0)
    })

    it("handles single-agent edge case", () => {
      const scenario = MULTI_AGENT_SCENARIOS[0]!
      const test = createMultiAgentTest(scenario, "Simple task")
      const traces = [makeAgentTrace("architect", ["read", "write"], "Output")]

      const metrics = collector.collect(test, traces, 1000)

      expect(metrics.agentUtilization).toBe(1)
      expect(metrics.consensusStability).toBeNull()
      expect(metrics.disagreementRate).toBeNull()
    })

    it("handles empty traces", () => {
      const scenario = MULTI_AGENT_SCENARIOS[0]!
      const test = createMultiAgentTest(scenario, "Empty")
      const traces: Array<{ role: string; traces: ToolTrace[]; output: string }> = []

      const metrics = collector.collect(test, traces, 0)

      expect(metrics.agentUtilization).toBe(0)
      expect(metrics.totalHandoffs).toBe(0)
      expect(metrics.coordinationOverhead).toBeNull()
    })

    it("detects handoff tools in traces", () => {
      const test = createMultiAgentTest(MULTI_AGENT_SCENARIOS[0]!, "Handoff test")
      const traces = [
        {
          role: "architect",
          traces: [makeTrace("delegate", { params: { agent: "engineer" }, result: "delegated task" })],
          output: "Plan",
        },
        {
          role: "engineer",
          traces: [makeTrace("write", { result: "done" })],
          output: "Implementation",
        },
      ]

      const metrics = collector.collect(test, traces, 2000)

      expect(metrics.totalHandoffs).toBeGreaterThanOrEqual(1)
      expect(metrics.handoffAccuracy).toBeGreaterThanOrEqual(0)
    })
  })

  describe("buildReport", () => {
    it("builds a complete evaluation report", () => {
      const scenario = MULTI_AGENT_SCENARIOS[0]!
      const test = createMultiAgentTest(scenario, "Build a feature")
      const traces = [
        makeAgentTrace("architect", ["read", "write"], "Arch spec"),
        makeAgentTrace("engineer", ["read", "write", "bash"], "Implementation"),
        makeAgentTrace("reviewer", ["read"], "Review comments"),
      ]

      const report = collector.buildReport(test, traces, 30000, 0.15, [])

      expect(report.testId).toBe(test.id)
      expect(report.testName).toBe(test.name)
      expect(report.pattern).toBe("sequential")
      expect(report.agentCount).toBe(3)
      expect(report.totalCost).toBe(0.15)
      expect(report.coordinationMetrics).toBeDefined()
      expect(report.perAgentMetrics).toHaveLength(3)
      expect(report.errors).toEqual([])
      // sequential pattern has no consensus config → null
      expect(report.consensusReached).toBeNull()
    })

    it("includes errors in the report", () => {
      const scenario = MULTI_AGENT_SCENARIOS[0]!
      const test = createMultiAgentTest(scenario, "Error test")
      const traces = [makeAgentTrace("architect", ["read", "write"], "Output")]

      const report = collector.buildReport(test, traces, 1000, 0.05, [
        "Agent engineer failed to start",
        "Tool read timed out",
      ])

      expect(report.errors).toHaveLength(2)
      expect(report.errors[0]).toContain("Agent")
    })

    it("computes per-agent metrics correctly", () => {
      const scenario = MULTI_AGENT_SCENARIOS[0]!
      const test = createMultiAgentTest(scenario, "Per-agent test")
      const traces = [
        makeAgentTrace("architect", ["read", "write"], "Spec"),
        makeAgentTrace("engineer", ["read", "write", "bash", "glob", "read"], "Impl"),
      ]

      const report = collector.buildReport(test, traces, 5000, 0.1, [])

      const archMetric = report.perAgentMetrics.find((m) => m.role === "architect")
      const engMetric = report.perAgentMetrics.find((m) => m.role === "engineer")

      expect(archMetric).toBeDefined()
      expect(engMetric).toBeDefined()
      expect(archMetric!.calls).toBe(2)
      expect(engMetric!.calls).toBe(5)
      // Contribution should be proportional to call count
      expect(archMetric!.contribution).toBeCloseTo(2 / 7, 3)
      expect(engMetric!.contribution).toBeCloseTo(5 / 7, 3)
    })
  })

  describe("Gini coefficient (contributionBalance)", () => {
    it("returns 0 for single agent", () => {
      const scenario = MULTI_AGENT_SCENARIOS[0]!
      const test = createMultiAgentTest(scenario, "Single")
      const traces = [makeAgentTrace("architect", ["read", "write"], "Out")]

      const metrics = collector.collect(test, traces, 1000)
      expect(metrics.contributionBalance).toBe(0)
    })

    it("returns 0 for perfectly equal contributions", () => {
      const scenario = MULTI_AGENT_SCENARIOS[0]!
      const test = createMultiAgentTest(scenario, "Equal")
      const traces = [
        makeAgentTrace("a", ["read", "write"], "A"),
        makeAgentTrace("b", ["read", "write"], "B"),
        makeAgentTrace("c", ["read", "write"], "C"),
      ]

      const metrics = collector.collect(test, traces, 1000)
      // Each agent has 2 calls out of 6 total = 0.333 each → perfect equality
      expect(metrics.contributionBalance).toBeCloseTo(0, 1)
    })
  })

  describe("context loss", () => {
    it("computes context loss based on handoff context preservation", () => {
      const test = createMultiAgentTest(MULTI_AGENT_SCENARIOS[0]!, "Context test")
      const traces = [
        makeAgentTrace("architect", ["read", "write"], "Short"),
        makeAgentTrace("engineer", ["read", "write"], ""), // Empty output = lost context
      ]

      const metrics = collector.collect(test, traces, 2000)

      expect(metrics.contextLossScore).toBeGreaterThanOrEqual(0)
      expect(metrics.contextLossScore).toBeLessThanOrEqual(1)
    })

    it("returns 0 when no handoffs occur", () => {
      const test = createMultiAgentTest(MULTI_AGENT_SCENARIOS[0]!, "No handoffs")
      const traces = [makeAgentTrace("architect", [], "Output")]

      const metrics = collector.collect(test, traces, 1000)

      expect(metrics.contextLossScore).toBe(0)
    })
  })
})

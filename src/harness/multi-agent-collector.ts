/**
 * src/harness/multi-agent-collector.ts
 *
 * Collects coordination metrics from multi-agent trace data.
 * Extracts handoff accuracy, context preservation, consensus quality,
 * parallel speedup, and agent contribution balance.
 */

import type {
  CoordinationPattern,
  CoordinationMetrics,
  AgentMetrics,
  MultiAgentEvalReport,
  MultiAgentTest,
} from "./multi-agent"
import type { ToolTrace } from "./types"

// ── Handoff Event Detection ─────────────────────────────────────

interface HandoffEvent {
  fromAgent: string
  toAgent: string
  timestamp: string
  contextSize: number // Characters of context passed
  contextPreserved: boolean // Was context correctly transmitted?
  durationMs: number
}

// ── Metric Collector ────────────────────────────────────────────

export class MultiAgentMetricCollector {
  /**
   * Collect full coordination metrics from multi-agent traces.
   */
  collect(
    test: MultiAgentTest,
    agentTraces: Array<{ role: string; traces: ToolTrace[]; output: string }>,
    totalDurationMs: number,
  ): CoordinationMetrics {
    const handoffs = this.extractHandoffs(agentTraces)
    const handoffAccuracy = this.scoreHandoffAccuracy(handoffs)
    const contextLoss = this.computeContextLoss(handoffs)
    const agentMetrics = this.computeAgentMetrics(agentTraces)

    return {
      pattern: test.coordinationPattern,
      totalHandoffs: handoffs.length,
      handoffAccuracy,
      contextLossScore: contextLoss,

      convergenceRounds: this.computeConvergenceRounds(agentTraces, test.coordinationPattern),
      consensusStability: this.computeConsensusStability(agentTraces),
      disagreementRate: this.computeDisagreementRate(agentTraces),

      parallelSpeedup: this.computeParallelSpeedup(agentTraces, totalDurationMs, test.coordinationPattern),
      agentUtilization: this.computeAgentUtilization(agentTraces),
      coordinationOverhead: this.computeCoordinationOverhead(handoffs, totalDurationMs),

      outputCoherence: null, // Requires LLM judge call — set by caller
      decompositionQuality:
        test.coordinationPattern === "hierarchical" ? this.computeDecompositionQuality(agentTraces) : null,
      contributionBalance: this.computeContributionBalance(agentMetrics),
    }
  }

  /**
   * Build full multi-agent eval report.
   */
  buildReport(
    test: MultiAgentTest,
    agentTraces: Array<{ role: string; traces: ToolTrace[]; output: string }>,
    totalDurationMs: number,
    totalCost: number,
    errors: string[],
  ): MultiAgentEvalReport {
    const metrics = this.collect(test, agentTraces, totalDurationMs)
    const agentMetrics = this.computeAgentMetrics(agentTraces)
    const consensusReached = test.consensus ? (metrics.disagreementRate ?? 1) < 1 - test.consensus.threshold : null

    return {
      testId: test.id,
      testName: test.name,
      pattern: test.coordinationPattern,
      agentCount: agentTraces.length,
      totalRounds: agentTraces.reduce((s, a) => s + a.traces.length, 0),
      totalDurationMs,
      totalCost,
      coordinationMetrics: metrics,
      perAgentMetrics: agentMetrics,
      consensusReached,
      finalOutput: agentTraces[agentTraces.length - 1]?.output ?? "",
      errors,
    }
  }

  // ── Private extraction methods ───────────────────────────────

  private extractHandoffs(agentTraces: Array<{ role: string; traces: ToolTrace[]; output?: string }>): HandoffEvent[] {
    const handoffs: HandoffEvent[] = []

    // Detect handoffs by looking for message-passing or context-sharing patterns
    for (let i = 0; i < agentTraces.length; i++) {
      const curr = agentTraces[i]!
      const next = agentTraces[i + 1]

      if (!next) {
        // Check for message/reply patterns within traces
        for (const trace of curr.traces) {
          if (this.isHandoffTool(trace)) {
            handoffs.push({
              fromAgent: curr.role,
              toAgent: this.extractTargetAgent(trace) ?? "unknown",
              timestamp: trace.timestamp ?? new Date().toISOString(),
              contextSize: (trace.result ?? "").length,
              contextPreserved: (trace.result ?? "").length > 10,
              durationMs: trace.durationMs ?? 0,
            })
          }
        }
        continue
      }

      // Sequential handoff between agents
      if (next.traces.length > 0) {
        const handoffDuration = curr.traces.reduce((s, t) => s + (t.durationMs ?? 0), 0)
        handoffs.push({
          fromAgent: curr.role,
          toAgent: next.role,
          timestamp: new Date().toISOString(),
          contextSize: curr.output?.length ?? 0,
          contextPreserved: curr.traces.some((t) => t.name === "write" || t.name === "read"),
          durationMs: handoffDuration,
        })
      }
    }

    return handoffs
  }

  private isHandoffTool(trace: ToolTrace): boolean {
    const handoffTools = ["delegate", "transfer", "message", "send", "handoff", "agent_call"]
    return handoffTools.includes(trace.name)
  }

  private extractTargetAgent(trace: ToolTrace): string | null {
    const target = (trace.params as Record<string, unknown>)?.agent ?? (trace.params as Record<string, unknown>)?.target
    return typeof target === "string" ? target : null
  }

  private scoreHandoffAccuracy(handoffs: HandoffEvent[]): number {
    if (handoffs.length === 0) return 1 // No handoffs = perfect accuracy
    const accurate = handoffs.filter((h) => h.contextPreserved).length
    return accurate / handoffs.length
  }

  private computeContextLoss(handoffs: HandoffEvent[]): number {
    if (handoffs.length === 0) return 0
    // Context loss = 1 - (preserved / total) weighted by context size
    const totalSize = handoffs.reduce((s, h) => s + h.contextSize, 0)
    const preservedSize = handoffs.filter((h) => h.contextPreserved).reduce((s, h) => s + h.contextSize, 0)
    return totalSize > 0 ? 1 - preservedSize / totalSize : 0
  }

  private computeConvergenceRounds(
    agentTraces: Array<{ role: string; traces: ToolTrace[]; output?: string }>,
    pattern: CoordinationPattern,
  ): number | null {
    if (pattern !== "debate" && pattern !== "refine") return null

    // Count how many rounds until output stabilizes
    const outputs = agentTraces.map((a) => a.traces.length)
    return Math.max(...outputs)
  }

  private computeConsensusStability(
    agentTraces: Array<{ role: string; traces: ToolTrace[]; output?: string }>,
  ): number | null {
    if (agentTraces.length < 2) return null
    // Stability = 1 - variance in tool call counts
    const callCounts = agentTraces.map((a) => a.traces.length)
    const mean = callCounts.reduce((s, c) => s + c, 0) / callCounts.length
    const variance = callCounts.reduce((s, c) => s + (c - mean) ** 2, 0) / callCounts.length
    return Math.max(0, 1 - Math.sqrt(variance) / Math.max(1, mean))
  }

  private computeDisagreementRate(
    agentTraces: Array<{ role: string; traces: ToolTrace[]; output?: string }>,
  ): number | null {
    if (agentTraces.length < 2) return null
    const uniqueOutputs = new Set(agentTraces.map((a) => a.output?.slice(0, 50) ?? ""))
    return 1 - 1 / Math.max(1, uniqueOutputs.size)
  }

  private computeParallelSpeedup(
    agentTraces: Array<{ role: string; traces: ToolTrace[]; output?: string }>,
    totalDurationMs: number,
    pattern: CoordinationPattern,
  ): number | null {
    if (pattern !== "parallel") return null
    const sequentialTime = agentTraces.reduce(
      (s, a) => s + a.traces.reduce((t, trace) => t + (trace.durationMs ?? 0), 0),
      0,
    )
    return sequentialTime > 0 && totalDurationMs > 0 ? sequentialTime / totalDurationMs : null
  }

  private computeAgentUtilization(agentTraces: Array<{ role: string; traces: ToolTrace[]; output?: string }>): number {
    if (agentTraces.length === 0) return 0
    const active = agentTraces.filter((a) => a.traces.length > 0).length
    return active / agentTraces.length
  }

  private computeCoordinationOverhead(handoffs: HandoffEvent[], totalDurationMs: number): number | null {
    if (totalDurationMs === 0) return null
    const overheadMs = handoffs.reduce((s, h) => s + h.durationMs, 0)
    return overheadMs / totalDurationMs
  }

  private computeDecompositionQuality(
    agentTraces: Array<{ role: string; traces: ToolTrace[]; output?: string }>,
  ): number | null {
    if (agentTraces.length < 2) return null
    // Quality = average of per-agent engagement
    const perAgentQuality = agentTraces.map((a) => {
      const reads = a.traces.filter((t) => t.name === "read").length
      const writes = a.traces.filter((t) => t.name === "write").length
      return reads > 0 && writes > 0 ? 1 : 0.5
    })
    return perAgentQuality.reduce((s, q) => s + q, 0) / perAgentQuality.length
  }

  private computeContributionBalance(agentMetrics: AgentMetrics[]): number {
    if (agentMetrics.length < 2) return 0
    // Gini coefficient of contributions
    const contributions = agentMetrics.map((m) => m.contribution).sort((a, b) => a - b)
    const n = contributions.length
    const sumContrib = contributions.reduce((s, c) => s + c, 0)
    if (sumContrib === 0) return 0

    let giniSum = 0
    for (let i = 0; i < n; i++) {
      giniSum += (2 * (i + 1) - n - 1) * contributions[i]!
    }

    return Math.min(1, Math.max(0, giniSum / (n * sumContrib)))
  }

  private computeAgentMetrics(
    agentTraces: Array<{ role: string; traces: ToolTrace[]; output: string }>,
  ): AgentMetrics[] {
    const totalCalls = agentTraces.reduce((s, a) => s + a.traces.length, 0)

    return agentTraces.map((a) => {
      const calls = a.traces.length
      const durationMs = a.traces.reduce((s, t) => s + (t.durationMs ?? 0), 0)
      const tokensUsed = a.traces.reduce((s, t) => s + (t.tokenCost ?? 0), 0)

      // Estimate cost (rough: $0.00001 per token)
      const cost = tokensUsed * 0.00001

      return {
        role: a.role,
        model: "multi-agent", // Injected by caller
        calls,
        durationMs: calls > 0 ? durationMs / calls : 0, // avg per call
        tokensUsed,
        cost,
        contribution: totalCalls > 0 ? calls / totalCalls : 0,
        handoffsInitiated: 0, // Set during handoff collection
        handoffsReceived: 0,
        errors: a.traces.filter((t) => t.result?.startsWith("error:")).length,
      }
    })
  }
}

export const multiAgentCollector = new MultiAgentMetricCollector()

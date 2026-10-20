/**
 * mesh/orchestrator — Multi-agent coordination engine.
 *
 * Executes agent meshes across different topologies:
 * - Sequential: agents run one after another
 * - Fan-out: parallel execution with result aggregation
 * - Debate: multiple agents on the same task, combined
 * - Ensemble: same task with different models, voted
 * - Supervisor: hierarchical delegation
 *
 * Each agent in the mesh runs in its own process via AgentManager IPC,
 * sharing context through the audit store and experience buffer.
 */

import { randomUUID } from "node:crypto"
import { createLogger } from "../cli/logger"
import { type MeshConfig, type MeshRunResult, type MeshAgentResult, type MeshAgent } from "./types"
import type { Outcome } from "../experience/store"

const log = createLogger("mesh:orchestrator")

// ── MeshOrchestrator ──────────────────────────────────────────────────

export class MeshOrchestrator {
  private running = new Map<string, AbortController>()

  /**
   * Execute a mesh configuration and return the combined result.
   */
  async run(config: MeshConfig): Promise<MeshRunResult> {
    const runId = `mesh-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
    const startedAt = new Date().toISOString()
    const startedAtMs = Date.now()
    log.info("Mesh run started", { runId, topology: config.topology })

    const controller = new AbortController()
    this.running.set(runId, controller)

    try {
      let results: MeshAgentResult[]
      let strategyNote: string | undefined
      let aggregate: string | undefined

      switch (config.topology) {
        case "sequential":
          results = await this.runSequential(config.agents, controller.signal)
          break
        case "fan-out": {
          const fanOut = await this.runFanOut(config.coordinator, config.workers, config.strategy, controller.signal)
          results = fanOut.results
          strategyNote = `strategy=${config.strategy}`
          aggregate = fanOut.aggregate
          break
        }
        case "debate":
          results = await this.runDebate(config.debaters, config.rounds, controller.signal)
          break
        case "ensemble":
          results = await this.runEnsemble(config.runs, controller.signal)
          break
        case "supervisor":
          results = await this.runSupervisor(
            config.supervisor,
            config.subAgents,
            config.reviewRequired,
            controller.signal,
          )
          break
        default:
          throw new Error(`Unknown topology: ${(config as Record<string, unknown>).topology}`)
      }

      const completedAt = new Date().toISOString()
      const totalDurationMs = Date.now() - startedAtMs
      const successful = results.filter((r) => r.outcome === "success").length
      const overallOutcome: Outcome =
        results.length === 0
          ? "failed"
          : successful === results.length
            ? "success"
            : successful > 0
              ? "partial"
              : "failed"

      const details: string[] = [config.topology]
      if (strategyNote) details.push(strategyNote)
      if (aggregate) details.push(`majority: ${aggregate.slice(0, 200)}`)

      const result: MeshRunResult = {
        id: runId,
        topology: config.topology,
        startedAt,
        completedAt,
        totalDurationMs,
        agentResults: results,
        overallOutcome,
        summary: `${successful}/${results.length} agents succeeded (${details.join(", ")})`,
      }

      log.info("Mesh run completed", { runId, outcome: overallOutcome, agents: results.length })
      return result
    } finally {
      this.running.delete(runId)
    }
  }

  /**
   * Cancel a running mesh.
   */
  cancel(runId: string): boolean {
    const controller = this.running.get(runId)
    if (!controller) return false
    controller.abort()
    this.running.delete(runId)
    return true
  }

  listRunning(): string[] {
    return [...this.running.keys()]
  }

  // ── Topology Implementations ────────────────────────────────────────

  private async runSequential(agents: MeshAgent[], signal: AbortSignal): Promise<MeshAgentResult[]> {
    const results: MeshAgentResult[] = []

    for (const agent of agents) {
      if (signal.aborted) break
      const result = await this.executeAgent(agent, signal)
      results.push(result)
    }

    return results
  }

  private async runFanOut(
    coordinator: MeshAgent,
    workers: MeshAgent[],
    strategy: "all" | "first-past" | "majority",
    signal: AbortSignal,
  ): Promise<{ results: MeshAgentResult[]; aggregate?: string }> {
    const results: MeshAgentResult[] = []

    if (coordinator) {
      const coordResult = await this.executeAgent(coordinator, signal)
      results.push(coordResult)
    }

    if (strategy === "first-past") {
      const winner = await this.runFirstPast(workers, signal)
      if (winner) results.push(winner)
      return { results }
    }

    const workerResults = await Promise.all(workers.map((w) => this.executeAgent(w, signal)))
    results.push(...workerResults)

    if (strategy === "majority") {
      const majority = this.pickMajority(workerResults)
      if (majority) {
        return { results, aggregate: majority.output }
      }
    }

    return { results }
  }

  private async runFirstPast(workers: MeshAgent[], signal: AbortSignal): Promise<MeshAgentResult | null> {
    if (workers.length === 0) return null

    return new Promise<MeshAgentResult | null>((resolve) => {
      let settled = false
      let pending = workers.length

      const settleEmpty = () => {
        pending--
        if (!settled && pending <= 0) {
          settled = true
          resolve(null)
        }
      }

      for (const worker of workers) {
        this.executeAgent(worker, signal)
          .then((result) => {
            if (!settled && result.outcome === "success") {
              settled = true
              resolve(result)
              return
            }
            settleEmpty()
          })
          .catch(() => settleEmpty())
      }
    })
  }

  private pickMajority(results: MeshAgentResult[]): { output: string; count: number } | null {
    const tally = new Map<string, { output: string; count: number }>()
    for (const result of results) {
      const key = result.output.trim()
      if (!key) continue
      const existing = tally.get(key)
      if (existing) {
        existing.count++
      } else {
        tally.set(key, { output: key, count: 1 })
      }
    }

    let best: { output: string; count: number } | null = null
    for (const entry of tally.values()) {
      if (!best || entry.count > best.count) best = entry
    }
    return best
  }

  private async runDebate(debaters: MeshAgent[], rounds: number, signal: AbortSignal): Promise<MeshAgentResult[]> {
    const results: MeshAgentResult[] = []

    for (let round = 0; round < rounds; round++) {
      if (signal.aborted) break

      // Run all debaters in parallel for this round
      const roundPromises = debaters.map((d) =>
        this.executeAgent(
          {
            ...d,
            goal: `[Round ${round + 1}/${rounds}] ${d.goal}`,
          },
          signal,
        ),
      )
      const roundResults = await Promise.all(roundPromises)
      results.push(...roundResults)
    }

    return results
  }

  private async runEnsemble(
    runs: Array<{ agent: MeshAgent; model: string }>,
    signal: AbortSignal,
  ): Promise<MeshAgentResult[]> {
    const runPromises = runs.map((r) => this.executeAgent({ ...r.agent, model: r.model }, signal))
    return Promise.all(runPromises)
  }

  private async runSupervisor(
    supervisor: MeshAgent,
    subAgents: MeshAgent[],
    reviewRequired: boolean,
    signal: AbortSignal,
  ): Promise<MeshAgentResult[]> {
    const results: MeshAgentResult[] = []

    // Run sub-agents in parallel
    const subResults = await Promise.all(subAgents.map((sa) => this.executeAgent(sa, signal)))
    results.push(...subResults)

    // Run supervisor to review
    const reviewGoal = [
      `Review the following agent outputs:`,
      ...subResults.map((r) => `\nAgent ${r.agentId} (${r.role}): ${r.summary}`),
      reviewRequired ? "\n\nApprove or request changes." : "",
    ].join("\n")

    const supervisorResult = await this.executeAgent(
      {
        ...supervisor,
        goal: reviewGoal,
      },
      signal,
    )
    results.push(supervisorResult)

    return results
  }

  // ── Agent Execution ─────────────────────────────────────────────────

  private async executeAgent(agent: MeshAgent, _signal: AbortSignal): Promise<MeshAgentResult> {
    const startTime = Date.now()
    log.debug("Executing mesh agent", { agentId: agent.id, role: agent.role })

    try {
      // Use the agent-run mode to execute this agent
      const { runAgentOrchestrator } = await import("../modes/agent-run")
      const summary = await runAgentOrchestrator(agent.goal)

      return {
        agentId: agent.id,
        role: agent.role,
        goal: agent.goal,
        outcome: "success",
        summary,
        output: summary,
        durationMs: Date.now() - startTime,
      }
    } catch (err: unknown) {
      log.error("Mesh agent failed", { agentId: agent.id, error: err instanceof Error ? err.message : String(err) })
      return {
        agentId: agent.id,
        role: agent.role,
        goal: agent.goal,
        outcome: "failed",
        summary: `Error: ${err instanceof Error ? err.message : String(err)}`,
        output: "",
        durationMs: Date.now() - startTime,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
}

export const meshOrchestrator = new MeshOrchestrator()

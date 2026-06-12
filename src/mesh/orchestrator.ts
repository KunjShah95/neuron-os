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
    log.info("Mesh run started", { runId, topology: config.topology })

    const controller = new AbortController()
    this.running.set(runId, controller)

    try {
      let results: MeshAgentResult[]

      switch (config.topology) {
        case "sequential":
          results = await this.runSequential(config.agents, controller.signal)
          break
        case "fan-out":
          results = await this.runFanOut(config.coordinator, config.workers, config.strategy, controller.signal)
          break
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
      const totalDurationMs = results.reduce((s, r) => s + r.durationMs, 0)
      const successful = results.filter((r) => r.outcome === "success").length
      const overallOutcome: Outcome = successful === results.length ? "success" : successful > 0 ? "partial" : "failed"

      const result: MeshRunResult = {
        id: runId,
        topology: config.topology,
        startedAt,
        completedAt,
        totalDurationMs,
        agentResults: results,
        overallOutcome,
        summary: `${successful}/${results.length} agents succeeded (${config.topology})`,
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
    _strategy: "all" | "first-past" | "majority",
    signal: AbortSignal,
  ): Promise<MeshAgentResult[]> {
    const results: MeshAgentResult[] = []

    // Run coordinator first
    if (coordinator) {
      const coordResult = await this.executeAgent(coordinator, signal)
      results.push(coordResult)
    }

    // Run workers in parallel
    const workerPromises = workers.map((w) => this.executeAgent(w, signal))
    const workerResults = await Promise.all(workerPromises)
    results.push(...workerResults)

    return results
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

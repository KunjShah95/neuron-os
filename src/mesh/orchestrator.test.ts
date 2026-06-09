/**
 * Tests for the MeshOrchestrator (multi-agent coordination).
 * Covers cancel, listRunning, and basic run flow.
 *
 * The run() method calls executeAgent() which dynamically imports
 * runAgentOrchestrator and requires an AI provider. These tests focus
 * on the public API that doesn't require AI — cancel, list, and
 * constructor behavior. Private state is accessed via (as any) pattern.
 *
 * Usage: bun test ./src/mesh/test-orchestrator.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { MeshOrchestrator } from "./orchestrator"
import type { MeshAgent } from "./types"

describe("MeshOrchestrator", () => {
  let orchestrator: MeshOrchestrator

  const mockResult = {
    agentId: "mock",
    role: "mock",
    goal: "mock",
    outcome: "failed" as const,
    summary: "Mock execution (no AI key)",
    output: "",
    durationMs: 1,
    error: "Mock: no AI provider",
  }

  // Save original prototype method for restoration in afterEach
  const originalExecuteAgent = (MeshOrchestrator.prototype as any).executeAgent

  beforeEach(() => {
    orchestrator = new MeshOrchestrator()
    // Mock executeAgent to return instantly without AI provider dependency
    ;(MeshOrchestrator.prototype as any).executeAgent = async () => mockResult
  })

  afterEach(() => {
    // Restore the original method on the prototype
    if (originalExecuteAgent) {
      ;(MeshOrchestrator.prototype as any).executeAgent = originalExecuteAgent
    } else {
      delete (MeshOrchestrator.prototype as any).executeAgent
    }
  })

  // ── Constructor ─────────────────────────────────────────────────────

  it("should construct without error", () => {
    expect(orchestrator).toBeInstanceOf(MeshOrchestrator)
  })

  it("should have no running meshes on init", () => {
    expect(orchestrator.listRunning()).toEqual([])
  })

  // ── Cancel ──────────────────────────────────────────────────────────

  it("should return false when cancelling nonexistent run", () => {
    const result = orchestrator.cancel("nonexistent-run")
    expect(result).toBe(false)
  })

  it("should return true when cancelling an existing run", () => {
    // Inject a mock running entry (following the pattern from test-engine.ts
    // which uses `as any` to access private state)
    const controller = new AbortController()
    ;(orchestrator as any).running.set("test-run-123", controller)

    const result = orchestrator.cancel("test-run-123")
    expect(result).toBe(true)
    // Run should no longer be in the running list
    expect(orchestrator.listRunning()).not.toContain("test-run-123")
  })

  it("should handle cancel after run completes gracefully", async () => {
    // Start a run that will fail quickly (no AI key)
    const agent: MeshAgent = {
      id: "graceful-cancel-test",
      role: "implementer",
      goal: "quick fail",
      dependsOn: [],
    }

    try {
      const result = await orchestrator.run({
        topology: "sequential",
        agents: [agent],
      })

      // Run completed (with failed agents), the finally block in run()
      // already cleaned up from the running map
      const cancelResult = orchestrator.cancel(result.id)
      expect(cancelResult).toBe(false) // Already cleaned up
    } catch {
      // If run throws entirely, orchestrator is in clean state
      expect(orchestrator.listRunning()).toEqual([])
    }
  })

  it("should remove cancelled run from running list", () => {
    const controller = new AbortController()
    ;(orchestrator as any).running.set("list-cleanup-test", controller)

    orchestrator.cancel("list-cleanup-test")
    expect(orchestrator.listRunning()).not.toContain("list-cleanup-test")
  })

  it("should handle multiple cancels on nonexistent runs", () => {
    expect(orchestrator.cancel("no-such-1")).toBe(false)
    expect(orchestrator.cancel("no-such-2")).toBe(false)
    expect(orchestrator.cancel("no-such-3")).toBe(false)
  })

  // ── List Running ────────────────────────────────────────────────────

  it("should return empty list when no runs are active", () => {
    expect(orchestrator.listRunning()).toEqual([])
  })

  it("should list a single running mesh", () => {
    ;(orchestrator as any).running.set("run-1", new AbortController())
    expect(orchestrator.listRunning()).toEqual(["run-1"])
  })

  it("should list multiple running meshes", () => {
    ;(orchestrator as any).running.set("run-a", new AbortController())
    ;(orchestrator as any).running.set("run-b", new AbortController())
    ;(orchestrator as any).running.set("run-c", new AbortController())

    const list = orchestrator.listRunning()
    expect(list).toContain("run-a")
    expect(list).toContain("run-b")
    expect(list).toContain("run-c")
    expect(list).toHaveLength(3)
  })

  it("should list empty after cancelled run", () => {
    ;(orchestrator as any).running.set("to-cancel", new AbortController())

    orchestrator.cancel("to-cancel")
    expect(orchestrator.listRunning()).toEqual([])
  })

  // ── Run ─────────────────────────────────────────────────────────────

  it("should run sequential topology and return result", async () => {
    const agent: MeshAgent = {
      id: "seq-agent",
      role: "implementer",
      goal: "Do something",
      dependsOn: [],
    }

    const result = await orchestrator.run({
      topology: "sequential",
      agents: [agent],
    })

    expect(result).toBeTruthy()
    expect(result.topology).toBe("sequential")
    expect(result.id).toBeTruthy()
    expect(typeof result.startedAt).toBe("string")
    expect(typeof result.completedAt).toBe("string")
    expect(result.agentResults).toHaveLength(1)
    expect(result.agentResults[0]?.outcome).toBe("failed") // no AI key
  })

  it("should return summary for run results", async () => {
    const agent: MeshAgent = {
      id: "summary-test-1",
      role: "implementer",
      goal: "Test summary",
      dependsOn: [],
    }

    const result = await orchestrator.run({
      topology: "sequential",
      agents: [agent, { ...agent, id: "summary-test-2" }],
    })

    expect(result.summary).toContain("2 agents")
    expect(result.summary).toContain("sequential")
  })

  it("should reject unknown topology", async () => {
    try {
      await (orchestrator as any).run({ topology: "unknown", agents: [] })
      expect(true).toBe(false) // Should not reach here
    } catch (err: unknown) {
      expect(err.message).toContain("Unknown topology")
    }
  })

  it("should run fan-out topology without crashing", async () => {
    const coordinator: MeshAgent = {
      id: "fan-coord",
      role: "coordinator",
      goal: "Coordinate",
      dependsOn: [],
    }
    const worker: MeshAgent = {
      id: "fan-worker",
      role: "implementer",
      goal: "Work",
      dependsOn: [],
    }

    const result = await orchestrator.run({
      topology: "fan-out",
      coordinator,
      workers: [worker],
      strategy: "all",
    })

    expect(result.topology).toBe("fan-out")
    expect(result.agentResults).toHaveLength(2)
  })

  it("should run debate topology without crashing", async () => {
    const debater: MeshAgent = {
      id: "debate-1",
      role: "implementer",
      goal: "Debate this",
      dependsOn: [],
    }

    const result = await orchestrator.run({
      topology: "debate",
      question: "Should we use TypeScript?",
      debaters: [debater, { ...debater, id: "debate-2" }],
      rounds: 2,
      synthesis: "vote",
    })

    expect(result.topology).toBe("debate")
    // 2 debaters × 2 rounds = 4 agent results
    expect(result.agentResults).toHaveLength(4)
  })

  it("should run ensemble topology without crashing", async () => {
    const agent: MeshAgent = {
      id: "ens-agent",
      role: "implementer",
      goal: "Ensemble task",
      dependsOn: [],
    }

    const result = await orchestrator.run({
      topology: "ensemble",
      task: "Ensemble task",
      runs: [
        { agent, model: "gpt-4o" },
        { agent: { ...agent, id: "ens-agent-2" }, model: "claude-3-opus" },
      ],
      aggregation: "vote",
    })

    expect(result.topology).toBe("ensemble")
    expect(result.agentResults).toHaveLength(2)
  })

  it("should run supervisor topology without crashing", async () => {
    const supervisor: MeshAgent = {
      id: "sup-visor",
      role: "coordinator",
      goal: "Review work",
      dependsOn: [],
    }
    const sub: MeshAgent = {
      id: "sub-agent",
      role: "implementer",
      goal: "Do work",
      dependsOn: [],
    }

    const result = await orchestrator.run({
      topology: "supervisor",
      supervisor,
      subAgents: [sub],
      reviewRequired: false,
    })

    expect(result.topology).toBe("supervisor")
    expect(result.agentResults).toHaveLength(2)
  })

  // ── Error Handling ──────────────────────────────────────────────────

  it("should handle empty agent list in sequential topology", async () => {
    const result = await orchestrator.run({
      topology: "sequential",
      agents: [],
    })

    expect(result.agentResults).toEqual([])
    expect(result.overallOutcome).toBeTruthy()
  })

  it("should handle empty workers in fan-out topology", async () => {
    const coordinator: MeshAgent = {
      id: "empty-fan",
      role: "coordinator",
      goal: "test",
      dependsOn: [],
    }

    const result = await orchestrator.run({
      topology: "fan-out",
      coordinator,
      workers: [],
      strategy: "all",
    })

    expect(result.agentResults.length).toBeGreaterThanOrEqual(1)
  })
})

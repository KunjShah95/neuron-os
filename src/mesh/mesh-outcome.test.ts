import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { MeshOrchestrator } from "./orchestrator"
import type { MeshAgent, MeshAgentResult } from "./types"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const originalExecuteAgent = (MeshOrchestrator.prototype as any).executeAgent

function agent(id: string, extra: Record<string, unknown> = {}): MeshAgent {
  return {
    id,
    role: "implementer",
    goal: `goal-${id}`,
    dependsOn: [],
    config: extra,
  }
}

describe("mesh run outcome", () => {
  let orchestrator: MeshOrchestrator

  beforeEach(() => {
    orchestrator = new MeshOrchestrator()
  })

  afterEach(() => {
    if (originalExecuteAgent) {
      ;(MeshOrchestrator.prototype as any).executeAgent = originalExecuteAgent
    } else {
      delete (MeshOrchestrator.prototype as any).executeAgent
    }
  })

  it("is not success when the run produced no agent results", async () => {
    const result = await orchestrator.run({ topology: "sequential", agents: [] })

    expect(result.agentResults).toEqual([])
    expect(result.overallOutcome).not.toBe("success")
    expect(result.overallOutcome).toBe("failed")
    expect(result.summary).toContain("0/0")
  })

  it("reports wall-clock duration instead of the sum of agent durations", async () => {
    ;(MeshOrchestrator.prototype as any).executeAgent = async (a: MeshAgent): Promise<MeshAgentResult> => ({
      agentId: a.id,
      role: a.role,
      goal: a.goal,
      outcome: "success",
      summary: a.id,
      output: a.id,
      durationMs: 30_000,
    })

    const result = await orchestrator.run({
      topology: "fan-out",
      coordinator: agent("coord"),
      workers: [agent("w1"), agent("w2"), agent("w3"), agent("w4")],
      strategy: "all",
    })

    const summed = result.agentResults.reduce((s, r) => s + r.durationMs, 0)
    expect(summed).toBe(150_000)
    expect(result.totalDurationMs).toBeLessThan(5_000)
  })
})

describe("mesh fan-out strategies", () => {
  let orchestrator: MeshOrchestrator

  beforeEach(() => {
    orchestrator = new MeshOrchestrator()
    ;(MeshOrchestrator.prototype as any).executeAgent = async (a: MeshAgent): Promise<MeshAgentResult> => {
      const cfg = (a.config ?? {}) as { delayMs?: number; output?: string; outcome?: string }
      if (cfg.delayMs) await sleep(cfg.delayMs)
      return {
        agentId: a.id,
        role: a.role,
        goal: a.goal,
        outcome: (cfg.outcome as MeshAgentResult["outcome"]) ?? "success",
        summary: a.id,
        output: cfg.output ?? a.id,
        durationMs: 1,
      }
    }
  })

  afterEach(() => {
    if (originalExecuteAgent) {
      ;(MeshOrchestrator.prototype as any).executeAgent = originalExecuteAgent
    } else {
      delete (MeshOrchestrator.prototype as any).executeAgent
    }
  })

  it("stops waiting at the first success with the first-past strategy", async () => {
    const result = await orchestrator.run({
      topology: "fan-out",
      coordinator: agent("coord"),
      workers: [agent("slow", { delayMs: 400, output: "slow" }), agent("fast", { delayMs: 5, output: "fast" })],
      strategy: "first-past",
    })

    expect(result.summary).toContain("strategy=first-past")
    const workerResults = result.agentResults.filter((r) => r.agentId !== "coord")
    expect(workerResults.length).toBe(1)
    expect(workerResults[0]?.agentId).toBe("fast")
  })

  it("returns the majority answer with the majority strategy", async () => {
    const result = await orchestrator.run({
      topology: "fan-out",
      coordinator: agent("coord"),
      workers: [
        agent("w1", { output: "answer-a" }),
        agent("w2", { output: "answer-a" }),
        agent("w3", { output: "answer-b" }),
      ],
      strategy: "majority",
    })

    expect(result.summary).toContain("strategy=majority")
    expect(result.summary).toContain("majority: answer-a")
    expect(result.agentResults.length).toBe(4)
  })

  it("runs every worker with the all strategy", async () => {
    const result = await orchestrator.run({
      topology: "fan-out",
      coordinator: agent("coord"),
      workers: [agent("w1"), agent("w2"), agent("w3")],
      strategy: "all",
    })

    expect(result.summary).toContain("strategy=all")
    expect(result.agentResults.length).toBe(4)
  })
})

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { EvolutionEngine, type DreamInsightSource } from "./engine"
import { MutationGenerator } from "./mutation-generator"
import { CodeMutator } from "./code-mutator"
import { VerificationEngine } from "./verification-engine"
import type { CodeMutation } from "./types"
import type { DreamInsight } from "../dream/types"

function tempDbDir(): string {
  return mkdtempSync(join(tmpdir(), "evolve-cycle-test-"))
}

function makeInsight(id: string): DreamInsight {
  return {
    id,
    dreamId: "dream-1",
    type: "pattern",
    title: `Insight ${id}`,
    description: "insight description",
    confidence: 0.9,
    sourceCount: 5,
    actionable: true,
    applied: false,
    createdAt: new Date().toISOString(),
  }
}

describe("EvolutionEngine runCycle", () => {
  let dbDir: string
  let applied: string[]
  let rolledBack: string[]
  let markedInsights: string[]
  let verifyPassed: boolean

  beforeEach(() => {
    dbDir = tempDbDir()
    applied = []
    rolledBack = []
    markedInsights = []
    verifyPassed = true
  })

  afterEach(() => {
    try {
      rmSync(dbDir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  })

  function buildEngine(mutations: CodeMutation[]) {
    const insightSource: DreamInsightSource = {
      getInsights: () => [makeInsight("insight-1")],
      markInsightApplied: (id: string) => {
        markedInsights.push(id)
      },
    }

    const mutationGen = {
      generateFromDreamInsight: () => mutations,
      generateFromFailures: () => [],
    } as unknown as MutationGenerator

    const mutator = {
      applyMutation: (mutation: CodeMutation) => {
        applied.push(mutation.id)
        return true
      },
      rollbackMutation: (mutation: CodeMutation) => {
        rolledBack.push(mutation.id)
        return true
      },
    } as unknown as CodeMutator

    const verifier = {
      verifyMutation: async () => ({
        passed: verifyPassed,
        output: "",
        durationMs: 1,
        error: verifyPassed ? "" : "tests failed",
      }),
    } as unknown as VerificationEngine

    const engine = new EvolutionEngine(
      {
        enabled: true,
        autoApplyLowRisk: true,
        maxConcurrentMutations: 1,
        confidenceThreshold: 0.5,
      },
      { dbPath: dbDir, mutationGen, mutator, verifier, insightSource },
    )

    return engine
  }

  function createMutations(engine: EvolutionEngine, count: number): CodeMutation[] {
    const mutations: CodeMutation[] = []
    for (let i = 0; i < count; i++) {
      mutations.push(
        engine.proposeMutation({
          filePath: `src/file-${i}.ts`,
          strategy: "refactor",
          description: `Mutation ${i}`,
          diff: "[]",
          oldContent: "const x = 1\n",
          newContent: "const x = 2\n",
          confidence: 0.9,
          sourceInsight: "insight",
        }),
      )
    }
    return mutations
  }

  it("enforces maxConcurrentMutations", async () => {
    const engine = buildEngine([])
    const mutations = createMutations(engine, 3)
    const cycleEngine = buildEngine(mutations)

    const report = await cycleEngine.runCycle()

    expect(applied.length).toBe(1)
    expect(report.mutationsApplied).toBe(1)
    expect(report.mutationsProposed).toBe(3)
    cycleEngine.close()
    engine.close()
  })

  it("marks the source insight as applied after a successful apply", async () => {
    const engine = buildEngine([])
    const mutations = createMutations(engine, 1)
    const cycleEngine = buildEngine(mutations)

    const report = await cycleEngine.runCycle()

    expect(report.mutationsApplied).toBe(1)
    expect(markedInsights).toEqual(["insight-1"])
    expect(cycleEngine.listMutations(10, "applied").length).toBe(1)
    cycleEngine.close()
    engine.close()
  })

  it("rolls back a failing mutation and records the failure in the engine store", async () => {
    verifyPassed = false
    const engine = buildEngine([])
    const mutations = createMutations(engine, 1)
    const cycleEngine = buildEngine(mutations)

    const report = await cycleEngine.runCycle()

    expect(report.mutationsFailed).toBe(1)
    expect(rolledBack).toEqual([mutations[0]?.id])
    expect(cycleEngine.listMutations(10, "rolled-back").length).toBe(1)
    expect(markedInsights).toEqual([])
    cycleEngine.close()
    engine.close()
  })

  it("does not re-apply a mutation that is no longer proposed", async () => {
    const engine = buildEngine([])
    const mutations = createMutations(engine, 1)
    const cycleEngine = buildEngine(mutations)

    await cycleEngine.runCycle()
    const appliedAfterFirst = applied.length

    const stored = cycleEngine.listMutations(10).find((m) => m.id === mutations[0]?.id)
    expect(stored?.status).toBe("applied")

    const report = await cycleEngine.runCycle()
    expect(applied.length).toBe(appliedAfterFirst)
    expect(report.mutationsApplied).toBe(0)
    cycleEngine.close()
    engine.close()
  })
})

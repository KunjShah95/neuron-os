import { createLogger } from "../cli/logger"
import { dreamEngine } from "../dream/engine"
import { EvolutionStore } from "./evolution-store"
import { MutationGenerator } from "./mutation-generator"
import { CodeMutator } from "./code-mutator"
import { VerificationEngine, type VerificationResult } from "./verification-engine"
import type { EvolutionConfig, EvolutionCycleReport, EvolutionStats, CodeMutation, MutationStrategy } from "./types"
import { DEFAULT_EVOLUTION_CONFIG } from "./types"

const log = createLogger("evolution-engine")

export class EvolutionEngine {
  private store: EvolutionStore
  private mutationGen: MutationGenerator
  private mutator: CodeMutator
  private verifier: VerificationEngine
  private config: EvolutionConfig
  private cycleCount = 0

  constructor(config?: Partial<EvolutionConfig>) {
    this.store = new EvolutionStore()
    this.mutationGen = new MutationGenerator()
    this.mutator = new CodeMutator()
    this.verifier = new VerificationEngine()
    this.config = { ...DEFAULT_EVOLUTION_CONFIG, ...config }
  }

  getConfig(): EvolutionConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<EvolutionConfig>): void {
    this.config = { ...this.config, ...config }
    log.info("Evolution config updated")
  }

  async runCycle(): Promise<EvolutionCycleReport> {
    const cycleId = `evolve-${Date.now().toString(36)}`
    const startedAt = new Date().toISOString()
    const cycleStart = Date.now()
    log.info(`Evolution cycle ${cycleId} started`)

    let mutationsProposed = 0
    let mutationsApplied = 0
    let mutationsFailed = 0
    let insightsConsumed = 0
    let failuresConsumed = 0

    if (!this.config.enabled) {
      return {
        cycleId,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: 0,
        mutationsProposed: 0,
        mutationsApplied: 0,
        mutationsFailed: 0,
        insightsConsumed: 0,
        failuresConsumed: 0,
      }
    }

    const insightMutations = this.proposeFromDreams()
    mutationsProposed += insightMutations.length
    insightsConsumed += insightMutations.length

    const failureMutations = this.proposeFromFailures()
    mutationsProposed += failureMutations.length
    failuresConsumed += failureMutations.length

    const allMutations = [...insightMutations, ...failureMutations]
      .filter((m) => m.status === "proposed")
      .sort((a, b) => b.confidence - a.confidence)

    if (this.config.autoApplyLowRisk) {
      for (const mutation of allMutations) {
        if (mutation.confidence >= this.config.confidenceThreshold) {
          const ok = this.mutator.applyMutation(mutation)
          if (ok) {
            const result = await this.verifier.verifyMutation(mutation)
            if (result.passed) {
              this.store.updateMutation(mutation.id, { status: "applied" })
              mutationsApplied++
              log.info(`Applied mutation ${mutation.id.slice(0, 12)} to ${mutation.filePath}`)
            } else {
              this.mutator.rollbackMutation(mutation)
              mutationsFailed++
              log.warn(`Rolled back mutation ${mutation.id.slice(0, 12)} — tests failed`)
            }
          } else {
            mutationsFailed++
          }
        }
      }
    }

    this.cycleCount++

    const report: EvolutionCycleReport = {
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - cycleStart,
      mutationsProposed,
      mutationsApplied,
      mutationsFailed,
      insightsConsumed,
      failuresConsumed,
    }

    log.info(
      `Evolution cycle ${cycleId}: ${mutationsProposed} proposed, ${mutationsApplied} applied, ${mutationsFailed} failed`,
    )

    return report
  }

  proposeFromDreams(): CodeMutation[] {
    const mutations: CodeMutation[] = []

    const insights = dreamEngine.getInsights(10, true)

    for (const insight of insights) {
      if (insight.confidence < this.config.confidenceThreshold) continue
      const result = this.mutationGen.generateFromDreamInsight(insight)
      mutations.push(...result)
    }

    return mutations
  }

  proposeFromFailures(): CodeMutation[] {
    return this.mutationGen.generateFromFailures()
  }

  proposeMutation(params: {
    filePath: string
    strategy: MutationStrategy
    description: string
    diff: string
    oldContent: string
    newContent: string
    confidence: number
    sourceInsight: string
  }): CodeMutation {
    return this.store.createMutation({
      filePath: params.filePath,
      strategy: params.strategy,
      description: params.description,
      diff: params.diff,
      oldContent: params.oldContent,
      newContent: params.newContent,
      confidence: params.confidence,
      sourceInsight: params.sourceInsight,
      sourceDreamId: "",
      sourceFailureIds: [],
    })
  }

  applyMutation(mutationId: string): boolean {
    const mutation = this.store.getMutation(mutationId)
    if (!mutation) {
      log.error(`Mutation not found: ${mutationId}`)
      return false
    }
    return this.mutator.applyMutation(mutation)
  }

  async verifyMutation(mutationId: string): Promise<VerificationResult> {
    const mutation = this.store.getMutation(mutationId)
    if (!mutation) {
      return { passed: false, output: "", durationMs: 0, error: "Mutation not found" }
    }
    return await this.verifier.verifyMutation(mutation)
  }

  async applyAndVerify(mutationId: string): Promise<"passed" | "failed" | "rolled-back"> {
    const mutation = this.store.getMutation(mutationId)
    if (!mutation) return "failed"

    const applied = this.mutator.applyMutation(mutation)
    if (!applied) return "failed"

    const result = await this.verifier.verifyMutation(mutation)

    if (result.passed) {
      this.store.updateMutation(mutation.id, { status: "applied" })
      log.info(`Mutation ${mutationId.slice(0, 12)} passed verification → applied`)
      return "passed"
    }

    this.mutator.rollbackMutation(mutation)
    log.warn(`Mutation ${mutationId.slice(0, 12)} failed verification → rolled back`)
    return "rolled-back"
  }

  rollbackMutation(mutationId: string): boolean {
    const mutation = this.store.getMutation(mutationId)
    if (!mutation) {
      log.error(`Mutation not found: ${mutationId}`)
      return false
    }
    return this.mutator.rollbackMutation(mutation)
  }

  listMutations(limit = 20, status?: string): CodeMutation[] {
    return this.store.listMutations(limit, status as string)
  }

  getStats(): EvolutionStats {
    return this.store.getStats()
  }
}

export const evolutionEngine = new EvolutionEngine()

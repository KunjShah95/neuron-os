import { createLogger } from "../cli/logger"
import { dreamEngine } from "../dream/engine"
import type { DreamInsight } from "../dream/types"
import { EvolutionStore } from "./evolution-store"
import { MutationGenerator } from "./mutation-generator"
import { CodeMutator } from "./code-mutator"
import { VerificationEngine, type VerificationResult } from "./verification-engine"
import type { EvolutionConfig, EvolutionCycleReport, EvolutionStats, CodeMutation, MutationStrategy } from "./types"
import { DEFAULT_EVOLUTION_CONFIG } from "./types"

const log = createLogger("evolution-engine")

export interface DreamInsightSource {
  getInsights(limit?: number, actionableOnly?: boolean): DreamInsight[]
  markInsightApplied(id: string): void
}

export interface EvolutionEngineOptions {
  dbPath?: string
  mutationGen?: MutationGenerator
  mutator?: CodeMutator
  verifier?: VerificationEngine
  insightSource?: DreamInsightSource
}

export class EvolutionEngine {
  private store: EvolutionStore
  private mutationGen: MutationGenerator
  private mutator: CodeMutator
  private verifier: VerificationEngine
  private insightSource: DreamInsightSource
  private config: EvolutionConfig
  private cycleCount = 0
  private insightByMutation = new Map<string, string>()

  constructor(config?: Partial<EvolutionConfig>, options?: EvolutionEngineOptions) {
    this.store = new EvolutionStore(undefined, options)
    this.config = { ...DEFAULT_EVOLUTION_CONFIG, ...config }
    this.insightSource = options?.insightSource ?? dreamEngine
    this.mutationGen = options?.mutationGen ?? new MutationGenerator(this.store)
    this.mutator = options?.mutator ?? new CodeMutator(this.store, { allowedDirs: this.config.allowedDirs })
    this.verifier =
      options?.verifier ??
      new VerificationEngine(this.store, undefined, {
        requireTestPass: this.config.requireTestPass,
        allowedDirs: this.config.allowedDirs,
        typecheckTimeoutMs: this.config.typecheckTimeoutMs,
        testTimeoutMs: this.config.testTimeoutMs,
      })
  }

  getConfig(): EvolutionConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<EvolutionConfig>): void {
    this.config = { ...this.config, ...config }
    if (config.allowedDirs) {
      this.mutator.setAllowedDirs(this.config.allowedDirs)
      this.verifier.setAllowedDirs(this.config.allowedDirs)
    }
    if (config.typecheckTimeoutMs !== undefined || config.testTimeoutMs !== undefined) {
      this.verifier.setTimeouts({
        typecheckTimeoutMs: this.config.typecheckTimeoutMs,
        testTimeoutMs: this.config.testTimeoutMs,
      })
    }
    log.info("Evolution config updated")
  }

  async runCycle(): Promise<EvolutionCycleReport> {
    const cycleId = `evolve-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
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

    const maxConcurrent = Math.max(0, this.config.maxConcurrentMutations)
    let processed = 0

    if (this.config.autoApplyLowRisk) {
      for (const mutation of allMutations) {
        if (processed >= maxConcurrent) {
          log.info(`Reached maxConcurrentMutations limit (${maxConcurrent}) — deferring remaining mutations`)
          break
        }
        if (mutation.confidence < this.config.confidenceThreshold) continue

        const stored = this.store.getMutation(mutation.id)
        if (!stored || stored.status !== "proposed") continue

        processed++

        const ok = this.mutator.applyMutation(mutation)
        if (!ok) {
          mutationsFailed++
          this.store.updateMutation(mutation.id, { status: "failed" })
          log.warn(`Failed to apply mutation ${mutation.id.slice(0, 12)} to ${mutation.filePath}`)
          continue
        }

        const result = await this.verifier.verifyMutation(mutation)
        if (result.passed) {
          this.store.updateMutation(mutation.id, { status: "applied" })
          this.markSourceInsightApplied(mutation.id)
          mutationsApplied++
          log.info(`Applied mutation ${mutation.id.slice(0, 12)} to ${mutation.filePath}`)
        } else {
          this.mutator.rollbackMutation(mutation)
          this.store.updateMutation(mutation.id, { status: "rolled-back" })
          mutationsFailed++
          log.warn(`Rolled back mutation ${mutation.id.slice(0, 12)} — tests failed`)
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

    const insights = this.insightSource.getInsights(10, true)

    for (const insight of insights) {
      if (insight.applied) continue
      if (insight.confidence < this.config.confidenceThreshold) continue
      const result = this.mutationGen.generateFromDreamInsight(insight)
      for (const mutation of result) {
        this.insightByMutation.set(mutation.id, insight.id)
      }
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
    if (!applied) {
      this.store.updateMutation(mutation.id, { status: "failed" })
      return "failed"
    }

    const result = await this.verifier.verifyMutation(mutation)

    if (result.passed) {
      this.store.updateMutation(mutation.id, { status: "applied" })
      this.markSourceInsightApplied(mutation.id)
      log.info(`Mutation ${mutationId.slice(0, 12)} passed verification → applied`)
      return "passed"
    }

    this.mutator.rollbackMutation(mutation)
    this.store.updateMutation(mutation.id, { status: "rolled-back" })
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
    return this.store.listMutations(limit, status as Parameters<typeof this.store.listMutations>[1])
  }

  getStats(): EvolutionStats {
    return this.store.getStats()
  }

  close(): void {
    this.store.close()
  }

  private markSourceInsightApplied(mutationId: string): void {
    const insightId = this.insightByMutation.get(mutationId)
    if (!insightId) return
    this.insightByMutation.delete(mutationId)
    try {
      this.insightSource.markInsightApplied(insightId)
    } catch (err) {
      log.warn(`Failed to mark insight ${insightId} applied: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

export const evolutionEngine = new EvolutionEngine()

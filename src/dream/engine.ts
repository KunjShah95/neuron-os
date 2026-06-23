import { createLogger } from "../cli/logger"
import { DreamStore } from "./dream-store"
import type { DreamConfig, DreamEntry, DreamInsight, DreamCycleReport } from "./types"
import { DEFAULT_DREAM_CONFIG } from "./types"
import { promoteInsights } from "./insight-injector"
import { runMemoryReplayPhase } from "./phases/memory-replay-phase"
import { runPatternDiscoveryPhase } from "./phases/pattern-discovery-phase"
import { runKnowledgeCompressionPhase } from "./phases/knowledge-compression-phase"
import { runCounterfactualPhase } from "./phases/counterfactual-phase"
import { runSharedDreamPhase } from "./phases/shared-dream-phase"
import { runMoodConsolidationPhase } from "./phases/mood-consolidation-phase"

const log = createLogger("dream-engine")

export class DreamEngine {
  private store: DreamStore
  private config: DreamConfig
  private activeDreams = new Set<string>()
  private cycleCount = 0
  private idleSince: number | null = null

  constructor(config?: Partial<DreamConfig>) {
    this.store = new DreamStore()
    this.config = { ...DEFAULT_DREAM_CONFIG, ...config }
  }

  getConfig(): DreamConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<DreamConfig>): void {
    this.config = { ...this.config, ...config }
    log.info("Dream config updated")
  }

  markActivity(): void {
    this.idleSince = null
  }

  tick(): void {
    if (!this.config.enabled) return

    const now = Date.now()

    if (this.idleSince === null) {
      this.idleSince = now
      return
    }

    const idleMinutes = (now - this.idleSince) / 60000

    if (idleMinutes >= this.config.minIdleMinutes && this.activeDreams.size === 0) {
      this.runCycle().catch((err) =>
        log.error(`Dream cycle failed: ${err instanceof Error ? err.message : String(err)}`),
      )
    }
  }

  async runCycle(): Promise<DreamCycleReport> {
    const cycleId = `cycle-${Date.now().toString(36)}`
    const startedAt = new Date().toISOString()
    const cycleStart = Date.now()
    this.cycleCount++

    log.info(`Starting dream cycle #${this.cycleCount} (${cycleId})`)

    const allInsights: DreamInsight[] = []

    const [memoryReplayResult, patternResult, compressionResult, counterfactualResult] = await Promise.all([
      runMemoryReplayPhase(this.store, this.config, cycleStart, this.activeDreams),
      runPatternDiscoveryPhase(this.store, this.config, cycleStart),
      runKnowledgeCompressionPhase(this.store, this.config, cycleStart),
      runCounterfactualPhase(this.store, this.config, cycleStart),
    ])

    allInsights.push(...memoryReplayResult.insights, ...patternResult.insights, ...compressionResult.insights, ...counterfactualResult.insights)

    const sharedDreamResult = await runSharedDreamPhase(this.store, cycleStart, this.activeDreams)
    const moodResult = await runMoodConsolidationPhase(this.store, cycleStart, this.activeDreams)

    allInsights.push(...sharedDreamResult.insights, ...moodResult.insights)

    const completedAt = new Date().toISOString()
    const durationMs = Date.now() - cycleStart

    const report: DreamCycleReport = {
      cycleId,
      startedAt,
      completedAt,
      durationMs,
      dreamsCreated: memoryReplayResult.dreamCount + patternResult.dreamCount + compressionResult.dreamCount + counterfactualResult.dreamCount + sharedDreamResult.dreamCount + moodResult.dreamCount,
      insightsGenerated: allInsights.length,
      memoryReplayCount: memoryReplayResult.dreamCount,
      patternCount: patternResult.dreamCount,
      compressionCount: compressionResult.dreamCount,
      counterfactualCount: counterfactualResult.dreamCount,
      sharedDreamCount: sharedDreamResult.dreamCount,
      moodConsolidationCount: moodResult.dreamCount,
      topInsights: allInsights.sort((a, b) => b.confidence - a.confidence).slice(0, 5),
    }

    log.info(
      `Dream cycle #${this.cycleCount} complete: ${report.dreamsCreated} dreams, ${report.insightsGenerated} insights in ${durationMs}ms`,
    )

    promoteInsights(allInsights)

    return report
  }

  /**
   * Run a focused cross-agent dream sharing cycle (Phase 5 + Phase 6 only).
   * Optionally filtered to specific agent types.
   */
  async runShareCycle(agentTypes?: string[]): Promise<DreamCycleReport> {
    const cycleId = `share-cycle-${Date.now().toString(36)}`
    const startedAt = new Date().toISOString()
    const cycleStart = Date.now()

    log.info(`Starting dream share cycle (${cycleId})${agentTypes ? ` for types: ${agentTypes.join(", ")}` : " — all agents"}`)

    const allInsights: DreamInsight[] = []

    const sharedDreamResult = await runSharedDreamPhase(this.store, cycleStart, this.activeDreams, agentTypes)
    allInsights.push(...sharedDreamResult.insights)

    let moodResult = { insights: [] as DreamInsight[], dreamCount: 0 }
    if (!agentTypes) {
      moodResult = await runMoodConsolidationPhase(this.store, cycleStart, this.activeDreams)
      allInsights.push(...moodResult.insights)
    }

    const completedAt = new Date().toISOString()
    const durationMs = Date.now() - cycleStart

    const report: DreamCycleReport = {
      cycleId,
      startedAt,
      completedAt,
      durationMs,
      dreamsCreated: sharedDreamResult.dreamCount + moodResult.dreamCount,
      insightsGenerated: allInsights.length,
      memoryReplayCount: 0,
      patternCount: 0,
      compressionCount: 0,
      counterfactualCount: 0,
      sharedDreamCount: sharedDreamResult.dreamCount,
      moodConsolidationCount: moodResult.dreamCount,
      topInsights: allInsights.sort((a, b) => b.confidence - a.confidence).slice(0, 5),
    }

    log.info(
      `Dream share cycle complete: ${report.dreamsCreated} dreams, ${report.insightsGenerated} insights in ${durationMs}ms`,
    )

    return report
  }

  listDreams(limit = 20, agentType?: string): DreamEntry[] {
    return this.store.listDreams(limit, agentType)
  }

  getInsights(limit = 50, actionableOnly = false) {
    return this.store.getAllInsights(limit, actionableOnly)
  }

  getStats() {
    return this.store.getStats()
  }

  markInsightApplied(id: string): void {
    this.store.markInsightApplied(id)
  }

  close(): void {
    this.store.close()
  }
}

export const dreamEngine = new DreamEngine()

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

export interface DreamPhaseResult {
  insights: DreamInsight[]
  dreamCount: number
}

export interface DreamPhases {
  memoryReplay: (
    store: DreamStore,
    config: DreamConfig,
    cycleStart: number,
    activeDreams: Set<string>,
  ) => Promise<DreamPhaseResult>
  patternDiscovery: (store: DreamStore, config: DreamConfig, cycleStart: number) => Promise<DreamPhaseResult>
  knowledgeCompression: (store: DreamStore, config: DreamConfig, cycleStart: number) => Promise<DreamPhaseResult>
  counterfactual: (store: DreamStore, config: DreamConfig, cycleStart: number) => Promise<DreamPhaseResult>
  sharedDream: (
    store: DreamStore,
    cycleStart: number,
    activeDreams: Set<string>,
    agentTypes?: string[],
  ) => Promise<DreamPhaseResult>
  moodConsolidation: (store: DreamStore, cycleStart: number, activeDreams: Set<string>) => Promise<DreamPhaseResult>
}

const DEFAULT_PHASES: DreamPhases = {
  memoryReplay: runMemoryReplayPhase,
  patternDiscovery: runPatternDiscoveryPhase,
  knowledgeCompression: runKnowledgeCompressionPhase,
  counterfactual: runCounterfactualPhase,
  sharedDream: runSharedDreamPhase,
  moodConsolidation: runMoodConsolidationPhase,
}

export interface DreamEngineOptions {
  dbPath?: string
  phases?: Partial<DreamPhases>
}

interface PhaseCounts {
  memoryReplay: number
  pattern: number
  compression: number
  counterfactual: number
  sharedDream: number
  mood: number
}

export class DreamEngine {
  private store: DreamStore
  private config: DreamConfig
  private phases: DreamPhases
  private activeDreams = new Set<string>()
  private cycleCount = 0
  private idleSince: number | null = null
  private cycleRunning = false

  constructor(config?: Partial<DreamConfig>, options?: DreamEngineOptions) {
    this.store = new DreamStore(undefined, options)
    this.config = { ...DEFAULT_DREAM_CONFIG, ...config }
    this.phases = { ...DEFAULT_PHASES, ...options?.phases }
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

  isCycleRunning(): boolean {
    return this.cycleRunning
  }

  tick(): void {
    if (!this.config.enabled) return

    if (this.cycleRunning) {
      log.debug("Dream cycle already in progress — skipping tick")
      return
    }

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
    const release = this.acquireCycle()

    try {
      const cycleId = `cycle-${Date.now().toString(36)}`
      const startedAt = new Date().toISOString()
      const cycleStart = Date.now()
      this.cycleCount++

      log.info(`Starting dream cycle #${this.cycleCount} (${cycleId})`)

      const work = this.executeCycle(cycleId, startedAt, cycleStart)
      const maxDurationMs = this.config.maxDreamDurationMs
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), maxDurationMs)
      })

      const outcome = await Promise.race([
        work.then((report) => ({ timedOut: false as const, report })),
        timeout.then(() => ({ timedOut: true as const, report: undefined })),
      ])

      if (timer) clearTimeout(timer)

      if (outcome.timedOut) {
        log.warn(`Dream cycle ${cycleId} exceeded max duration of ${maxDurationMs}ms — abandoning`)
        void work.then(release, release)
        return this.buildReport(cycleId, startedAt, cycleStart, [], {
          memoryReplay: 0,
          pattern: 0,
          compression: 0,
          counterfactual: 0,
          sharedDream: 0,
          mood: 0,
        })
      }

      release()
      return outcome.report
    } catch (err) {
      release()
      throw err
    }
  }

  /**
   * Run a focused cross-agent dream sharing cycle (Phase 5 + Phase 6 only).
   * Optionally filtered to specific agent types.
   */
  async runShareCycle(agentTypes?: string[]): Promise<DreamCycleReport> {
    const release = this.acquireCycle()

    try {
      const cycleId = `share-cycle-${Date.now().toString(36)}`
      const startedAt = new Date().toISOString()
      const cycleStart = Date.now()

      log.info(
        `Starting dream share cycle (${cycleId})${agentTypes ? ` for types: ${agentTypes.join(", ")}` : " — all agents"}`,
      )

      const allInsights: DreamInsight[] = []
      const counts: PhaseCounts = {
        memoryReplay: 0,
        pattern: 0,
        compression: 0,
        counterfactual: 0,
        sharedDream: 0,
        mood: 0,
      }

      try {
        const sharedDreamResult = await this.phases.sharedDream(this.store, cycleStart, this.activeDreams, agentTypes)
        allInsights.push(...sharedDreamResult.insights)
        counts.sharedDream += sharedDreamResult.dreamCount
      } catch (err) {
        log.error(`Shared dream phase failed: ${err instanceof Error ? err.message : String(err)}`)
      }

      if (!agentTypes) {
        try {
          const moodResult = await this.phases.moodConsolidation(this.store, cycleStart, this.activeDreams)
          allInsights.push(...moodResult.insights)
          counts.mood += moodResult.dreamCount
        } catch (err) {
          log.error(`Mood consolidation phase failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      const report = this.buildReport(cycleId, startedAt, cycleStart, allInsights, counts)

      log.info(
        `Dream share cycle complete: ${report.dreamsCreated} dreams, ${report.insightsGenerated} insights in ${report.durationMs}ms`,
      )

      return report
    } catch (err) {
      release()
      throw err
    }
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

  private acquireCycle(): () => void {
    if (this.cycleRunning) {
      throw new Error("Dream cycle already in progress")
    }
    this.cycleRunning = true
    let released = false
    return () => {
      if (released) return
      released = true
      this.cycleRunning = false
    }
  }

  private async executeCycle(cycleId: string, startedAt: string, cycleStart: number): Promise<DreamCycleReport> {
    const allInsights: DreamInsight[] = []
    const counts: PhaseCounts = {
      memoryReplay: 0,
      pattern: 0,
      compression: 0,
      counterfactual: 0,
      sharedDream: 0,
      mood: 0,
    }

    const phaseNames = ["memory-replay", "pattern-discovery", "knowledge-compression", "counterfactual"] as const
    const phaseCountKeys = ["memoryReplay", "pattern", "compression", "counterfactual"] as const

    const settled = await Promise.allSettled([
      this.phases.memoryReplay(this.store, this.config, cycleStart, this.activeDreams),
      this.phases.patternDiscovery(this.store, this.config, cycleStart),
      this.phases.knowledgeCompression(this.store, this.config, cycleStart),
      this.phases.counterfactual(this.store, this.config, cycleStart),
    ])

    settled.forEach((result, index) => {
      const name = phaseNames[index] as string
      const key = phaseCountKeys[index] as keyof PhaseCounts
      if (result.status === "fulfilled") {
        allInsights.push(...result.value.insights)
        counts[key] += result.value.dreamCount
      } else {
        log.error(
          `Dream phase ${name} failed: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        )
      }
    })

    try {
      const sharedDreamResult = await this.phases.sharedDream(this.store, cycleStart, this.activeDreams)
      allInsights.push(...sharedDreamResult.insights)
      counts.sharedDream += sharedDreamResult.dreamCount
    } catch (err) {
      log.error(`Shared dream phase failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    try {
      const moodResult = await this.phases.moodConsolidation(this.store, cycleStart, this.activeDreams)
      allInsights.push(...moodResult.insights)
      counts.mood += moodResult.dreamCount
    } catch (err) {
      log.error(`Mood consolidation phase failed: ${err instanceof Error ? err.message : String(err)}`)
    }

    const report = this.buildReport(cycleId, startedAt, cycleStart, allInsights, counts)

    log.info(
      `Dream cycle #${this.cycleCount} complete: ${report.dreamsCreated} dreams, ${report.insightsGenerated} insights in ${report.durationMs}ms`,
    )

    promoteInsights(allInsights)

    return report
  }

  private buildReport(
    cycleId: string,
    startedAt: string,
    cycleStart: number,
    allInsights: DreamInsight[],
    counts: PhaseCounts,
  ): DreamCycleReport {
    const completedAt = new Date().toISOString()
    const durationMs = Date.now() - cycleStart

    return {
      cycleId,
      startedAt,
      completedAt,
      durationMs,
      dreamsCreated:
        counts.memoryReplay +
        counts.pattern +
        counts.compression +
        counts.counterfactual +
        counts.sharedDream +
        counts.mood,
      insightsGenerated: allInsights.length,
      memoryReplayCount: counts.memoryReplay,
      patternCount: counts.pattern,
      compressionCount: counts.compression,
      counterfactualCount: counts.counterfactual,
      sharedDreamCount: counts.sharedDream,
      moodConsolidationCount: counts.mood,
      topInsights: [...allInsights].sort((a, b) => b.confidence - a.confidence).slice(0, 5),
    }
  }
}

export const dreamEngine = new DreamEngine()

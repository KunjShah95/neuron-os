import { createLogger } from "../cli/logger"
import { experienceStore } from "../experience/store"
import { DreamStore } from "./dream-store"
import { MemoryReplay } from "./memory-replay"
import { InsightGenerator } from "./insight-generator"
import type { DreamConfig, DreamEntry, DreamInsight, DreamCycleReport } from "./types"
import { DEFAULT_DREAM_CONFIG } from "./types"

const log = createLogger("dream-engine")

export class DreamEngine {
  private store: DreamStore
  private memoryReplay: MemoryReplay
  private insightGen: InsightGenerator
  private config: DreamConfig
  private activeDreams = new Set<string>()
  private cycleCount = 0
  private idleSince: number | null = null

  constructor(config?: Partial<DreamConfig>) {
    this.store = new DreamStore()
    this.memoryReplay = new MemoryReplay()
    this.insightGen = new InsightGenerator()
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

    const allInsights: DreamCycleReport["topInsights"] = []
    let memoryReplayCount = 0
    let patternCount = 0
    let compressionCount = 0
    let counterfactualCount = 0
    let sharedDreamCount = 0
    let moodConsolidationCount = 0

    // Phase 1: Memory Replay — replay past experiences to find patterns
    if (this.config.memoryReplay.enabled) {
      const dream = this.store.createDream({
        agentType: "system",
        agentId: "dream-engine",
        type: "memory-replay",
      })
      this.activeDreams.add(dream.id)
      dream.status = "processing"
      this.store.updateDream(dream.id, { status: "processing" })

      try {
        const result = this.memoryReplay.replay(this.config.memoryReplay)
        const insights = this.insightGen.generateFromMemoryReplay(dream.id, result)

        for (const ins of insights) {
          this.store.addInsight(ins)
        }

        dream.status = "completed"
        dream.completedAt = new Date().toISOString()
        dream.durationMs = Date.now() - cycleStart
        dream.insightIds = insights.map((i) => i.id)
        dream.summary = `Memory replay: ${result.replayedExperiences.length} experiences, ${result.patternsFound.length} patterns, ${result.anomalies.length} anomalies`
        dream.narrative = this.buildNarrative(result.patternsFound, result.anomalies)
        dream.vividness = result.patternsFound.length > 3 ? "vivid" : result.patternsFound.length > 0 ? "moderate" : "faint"

        this.store.updateDream(dream.id, {
          status: dream.status,
          completedAt: dream.completedAt,
          durationMs: dream.durationMs,
          insightIds: dream.insightIds,
          summary: dream.summary,
          narrative: dream.narrative,
          vividness: dream.vividness,
          sourceIds: result.replayedExperiences.map((e) => e.id),
        })

        memoryReplayCount = 1
        allInsights.push(...insights)
      } catch (err) {
        this.store.updateDream(dream.id, { status: "failed" })
        log.error(`Memory replay dream failed: ${err instanceof Error ? err.message : String(err)}`)
      }
      this.activeDreams.delete(dream.id)
    }

    // Phase 2: Pattern Discovery — cluster analysis on recent experiences
    if (this.config.patternDiscovery.enabled) {
      try {
        const insights = experienceStore.computeClusterInsights(this.config.patternDiscovery.minClusterSize)
        if (insights.length > 0) {
          const dream = this.store.createDream({
            agentType: "system",
            agentId: "dream-engine",
            type: "pattern-discovery",
          })

          const dreamInsights = insights.map((ci) =>
            this.store.addInsight({
              dreamId: dream.id,
              type: "pattern",
              title: `Cluster: ${ci.clusterKey.slice(0, 60)}`,
              description: `${ci.count} occurrences. ${ci.topSuggestions.join("; ")}`,
              confidence: Math.min(0.9, ci.count / 10),
              sourceCount: ci.count,
              actionable: ci.topSuggestions.length > 0,
              applied: false,
            }),
          )

          this.store.updateDream(dream.id, {
            status: "completed",
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - cycleStart,
            insightIds: dreamInsights.map((i) => i.id),
            summary: `Pattern discovery: ${insights.length} clusters found`,
            narrative: insights.map((ci) => `Cluster "${ci.clusterKey}": ${ci.count} occurrences`).join("\n"),
            vividness: insights.length > 3 ? "vivid" : "moderate",
          })

          patternCount = 1
          allInsights.push(
            ...dreamInsights.filter((i) => i.confidence > 0.5),
          )
        }
      } catch (err) {
        log.error(`Pattern discovery dream failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Phase 3: Knowledge Compression — consolidate related dreams
    if (this.config.knowledgeCompression.enabled) {
      try {
        const recentDreams = this.store.listDreams(this.config.knowledgeCompression.maxEntries)
        if (recentDreams.length >= 5) {
          const dream = this.store.createDream({
            agentType: "system",
            agentId: "dream-engine",
            type: "knowledge-compression",
          })

          const concepts = new Set<string>()
          let totalInsights = 0
          for (const d of recentDreams) {
            const ins = this.store.getInsightsForDream(d.id)
            totalInsights += ins.length
            for (const i of ins) {
              for (const word of i.title.split(/\s+/)) {
                if (word.length > 4) concepts.add(word.toLowerCase())
              }
            }
          }

          const compressionRatio = recentDreams.length > 0 ? totalInsights / recentDreams.length : 0

          const insight = this.store.addInsight({
            dreamId: dream.id,
            type: "compression",
            title: `Knowledge compressed from ${recentDreams.length} dreams`,
            description: `${totalInsights} insights consolidated into ${concepts.size} conceptual groups`,
            confidence: Math.min(0.9, concepts.size / totalInsights || 0),
            sourceCount: recentDreams.length,
            actionable: false,
            applied: false,
          })

          this.store.updateDream(dream.id, {
            status: "completed",
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - cycleStart,
            insightIds: [insight.id],
            summary: `Compressed ${recentDreams.length} dreams into ${concepts.size} concept groups`,
            narrative: [...concepts].slice(0, 20).join(", "),
            vividness: compressionRatio > 0.5 ? "vivid" : "faint",
          })

          compressionCount = 1
          allInsights.push(insight)
        }
      } catch (err) {
        log.error(`Knowledge compression dream failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Phase 4: Counterfactual — imagine alternative outcomes for failures
    if (this.config.counterfactual.enabled) {
      try {
        const failures = experienceStore.getRecentFailures(10)
        if (failures.length >= 2) {
          const dream = this.store.createDream({
            agentType: "system",
            agentId: "dream-engine",
            type: "counterfactual",
          })

          const alternatives = failures.slice(0, this.config.counterfactual.maxAlternatives).map((f) => ({
            scenario: `What if "${f.goal.slice(0, 60)}" used a different approach?`,
            probability: 0.3 + Math.random() * 0.4,
            insight: `Alternative path for "${f.summary.slice(0, 80)}" could improve success rate`,
          }))

          const insights = alternatives
            .filter((a) => a.probability > 0.3)
            .map((a) =>
              this.store.addInsight({
                dreamId: dream.id,
                type: "counterfactual",
                title: a.scenario.slice(0, 80),
                description: a.insight,
                confidence: a.probability,
                sourceCount: 1,
                actionable: true,
                applied: false,
              }),
            )

          this.store.updateDream(dream.id, {
            status: "completed",
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - cycleStart,
            insightIds: insights.map((i) => i.id),
            summary: `Counterfactual analysis: ${alternatives.length} alternatives considered`,
            narrative: alternatives.map((a) => a.scenario).join("\n"),
            vividness: "moderate",
          })

          counterfactualCount = 1
          allInsights.push(...insights)
        }
      } catch (err) {
        log.error(`Counterfactual dream failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Phase 5: Shared Dream Consolidation — cross-agent knowledge sharing
    // Consolidates insights from all agents into shared dreams that other
    // agents can learn from. This creates the "collective subconscious".
    if (this.config.knowledgeCompression.enabled) {
      try {
        const allDreams = this.store.listDreams(100)
        const dreamsWithInsights = allDreams.filter((d) => d.insightIds.length > 0)

        if (dreamsWithInsights.length >= 3) {
          const dream = this.store.createDream({
            agentType: "system",
            agentId: "dream-engine",
            type: "shared-dream-consolidation",
          })

          // Collect all insights across all agents
          const allAgentInsights: Array<{ agent: string; type: string; title: string; confidence: number }> = []
          const agentTypes = new Set<string>()

          for (const d of dreamsWithInsights) {
            agentTypes.add(d.agentType)
            const ins = this.store.getInsightsForDream(d.id)
            for (const i of ins) {
              allAgentInsights.push({
                agent: d.agentType,
                type: i.type,
                title: i.title,
                confidence: i.confidence,
              })
            }
          }

          // Generate cross-agent synthesis insights
          const agentCount = agentTypes.size
          const highConfidence = allAgentInsights.filter((i) => i.confidence > 0.7)
          const patterns = allAgentInsights.filter((i) => i.type === "pattern")

          // Create synthesis insights
          const synthesisInsights = []

          if (highConfidence.length > 0) {
            synthesisInsights.push(
              this.store.addInsight({
                dreamId: dream.id,
                type: "synthesis",
                title: `Cross-agent synthesis: ${highConfidence.length} high-confidence insights shared across ${agentCount} agent types`,
                description: `Shared dream consolidates ${allAgentInsights.length} insights from ${dreamsWithInsights.length} dreams across ${agentCount} agent types. Patterns found: ${patterns.length}.`,
                confidence: Math.min(0.9, agentCount / 5),
                sourceCount: allAgentInsights.length,
                actionable: true,
                applied: false,
              }),
            )
          }

          if (patterns.length >= 5) {
            synthesisInsights.push(
              this.store.addInsight({
                dreamId: dream.id,
                type: "correlation",
                title: `${patterns.length} patterns detected across agents — shared knowledge available`,
                description: `Cross-cutting patterns found across ${agentCount} different agent types. These represent shared learning opportunities.`,
                confidence: 0.7,
                sourceCount: patterns.length,
                actionable: true,
                applied: false,
              }),
            )
          }

          this.store.updateDream(dream.id, {
            status: "completed",
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - cycleStart,
            insightIds: synthesisInsights.map((i) => i.id),
            summary: `Shared dream consolidation: ${allAgentInsights.length} insights from ${agentCount} agent types`,
            narrative: [`Cross-agent knowledge shared across ${agentCount} agent types: ${[...agentTypes].join(", ")}`,
              `Total insights consolidated: ${allAgentInsights.length}`,
              `High-confidence findings: ${highConfidence.length}`,
              `Recurring patterns: ${patterns.length}`].join("\n"),
            vividness: agentCount > 3 ? "vivid" : "moderate",
          })

          sharedDreamCount = 1
          allInsights.push(...synthesisInsights)
        }
      } catch (err) {
        log.error(`Shared dream consolidation failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    // Phase 6: Mood Consolidation — track agent emotional health across the fleet
    if (this.config.knowledgeCompression.enabled) {
      try {
        const { soulManager } = await import("../agent/soul")
        const souls = soulManager.list()

        if (souls.length >= 2) {
          const dream = this.store.createDream({
            agentType: "system",
            agentId: "dream-engine",
            type: "mood-consolidation",
          })

          // Analyze fleet mood
          const moodCounts = new Map<string, number>()
          let totalStreak = 0
          for (const { soul } of souls) {
            moodCounts.set(soul.mood.mood, (moodCounts.get(soul.mood.mood) ?? 0) + 1)
            totalStreak += soul.mood.streak
          }

          const dominantMood = [...moodCounts.entries()].sort(([, a], [, b]) => b - a)[0]
          const avgStreak = souls.length > 0 ? Math.round(totalStreak / souls.length) : 0
          const burnedOutCount = moodCounts.get("burned_out") ?? 0
          const frustratedCount = moodCounts.get("frustrated") ?? 0

          const moodHealth = burnedOutCount > 0 ? "concerning" : frustratedCount > 0 ? "strained" : "healthy"

          const insight = this.store.addInsight({
            dreamId: dream.id,
            type: "synthesis",
            title: `Fleet mood: ${moodHealth} — ${dominantMood ? dominantMood[0] + " (" + dominantMood[1] + " agents)" : "unknown"}`,
            description: `${souls.length} agents tracked. Dominant mood: ${dominantMood ? dominantMood[0] : "N/A"}. Avg streak: ${avgStreak}. Burned out: ${burnedOutCount}. Frustrated: ${frustratedCount}.`,
            confidence: 0.8,
            sourceCount: souls.length,
            actionable: burnedOutCount > 0,
            applied: false,
          })

          this.store.updateDream(dream.id, {
            status: "completed",
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - cycleStart,
            insightIds: [insight.id],
            summary: `Fleet mood consolidation: ${souls.length} agents, dominant: ${dominantMood ? dominantMood[0] : "N/A"}, health: ${moodHealth}`,
            narrative: [`Fleet emotional health: ${moodHealth}`,
              `Agents tracked: ${souls.length}`,
              `Mood distribution: ${[...moodCounts.entries()].map(([m, c]) => `${m}: ${c}`).join(", ")}`,
              `Average streak: ${avgStreak}`,
              `Burned out: ${burnedOutCount}, Frustrated: ${frustratedCount}`].join("\n"),
            vividness: burnedOutCount > 0 ? "vivid" : "moderate",
          })

          moodConsolidationCount = 1
          allInsights.push(insight)
        }
      } catch (err) {
        log.error(`Mood consolidation dream failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    const completedAt = new Date().toISOString()
    const durationMs = Date.now() - cycleStart

    const report: DreamCycleReport = {
      cycleId,
      startedAt,
      completedAt,
      durationMs,
      dreamsCreated: memoryReplayCount + patternCount + compressionCount + counterfactualCount + sharedDreamCount + moodConsolidationCount,
      insightsGenerated: allInsights.length,
      memoryReplayCount,
      patternCount,
      compressionCount,
      counterfactualCount,
      sharedDreamCount,
      moodConsolidationCount,
      topInsights: allInsights.sort((a, b) => b.confidence - a.confidence).slice(0, 5),
    }

    log.info(
      `Dream cycle #${this.cycleCount} complete: ${report.dreamsCreated} dreams, ${report.insightsGenerated} insights in ${durationMs}ms`,
    )

    return report
  }

  /**
   * Run a focused cross-agent dream sharing cycle.
   * This only runs Phase 5 (shared dream consolidation) and Phase 6 (mood consolidation),
   * optionally filtered to specific agent types.
   *
   * @param agentTypes - Optional list of agent types to filter by (e.g., ["build", "plan"])
   *                     If omitted, shares across ALL agent types.
   */
  async runShareCycle(agentTypes?: string[]): Promise<DreamCycleReport> {
    const cycleId = `share-cycle-${Date.now().toString(36)}`
    const startedAt = new Date().toISOString()
    const cycleStart = Date.now()

    log.info(`Starting dream share cycle (${cycleId})${agentTypes ? ` for types: ${agentTypes.join(", ")}` : " — all agents"}`)

    const allInsights: DreamInsight[] = []
    let sharedDreamCount = 0
    let moodConsolidationCount = 0

    // Phase 5: Shared Dream Consolidation — cross-agent knowledge sharing
    // If agentTypes is specified, only include dreams from those agent types
    const allDreams = agentTypes
      ? (await Promise.all(agentTypes.map((t) => this.store.listDreams(50, t)))).flat()
      : this.store.listDreams(100)

    const dreamsWithInsights = allDreams.filter((d) => d.insightIds.length > 0)

    if (dreamsWithInsights.length >= 2) {
      const dream = this.store.createDream({
        agentType: "system",
        agentId: "dream-engine",
        type: "shared-dream-consolidation",
      })
      this.activeDreams.add(dream.id)

      try {
        // Collect all insights across the filtered agents
        const allAgentInsights: Array<{ agent: string; type: string; title: string; confidence: number }> = []
        const agentTypesSet = new Set<string>()

        for (const d of dreamsWithInsights) {
          agentTypesSet.add(d.agentType)
          const ins = this.store.getInsightsForDream(d.id)
          for (const i of ins) {
            allAgentInsights.push({
              agent: d.agentType,
              type: i.type,
              title: i.title,
              confidence: i.confidence,
            })
          }
        }

        const agentCount = agentTypesSet.size
        const highConfidence = allAgentInsights.filter((i) => i.confidence > 0.7)
        const patterns = allAgentInsights.filter((i) => i.type === "pattern")

        // Build synthesis insight title based on whether filtering
        const scopeLabel = agentTypes
          ? `types ${agentTypes.join(", ")}`
          : `all types (${[...agentTypesSet].join(", ")})`

        const synthesisInsights: DreamInsight[] = []

        if (highConfidence.length > 0) {
          synthesisInsights.push(
            this.store.addInsight({
              dreamId: dream.id,
              type: "synthesis",
              title: `Shared dream: ${highConfidence.length} high-confidence insights across ${scopeLabel}`,
              description: `Cross-agent sharing consolidated ${allAgentInsights.length} insights from ${dreamsWithInsights.length} dreams across ${agentCount} agent types. Patterns found: ${patterns.length}.`,
              confidence: Math.min(0.9, agentCount / 5),
              sourceCount: allAgentInsights.length,
              actionable: true,
              applied: false,
            }),
          )
        }

        if (patterns.length >= 3) {
          synthesisInsights.push(
            this.store.addInsight({
              dreamId: dream.id,
              type: "correlation",
              title: `${patterns.length} shared patterns across ${scopeLabel}`,
              description: `Cross-cutting patterns found across ${agentCount} agent types. These represent shared learning opportunities from the collective subconscious.`,
              confidence: 0.7,
              sourceCount: patterns.length,
              actionable: true,
              applied: false,
            }),
          )
        }

        if (synthesisInsights.length === 0) {
          // Minimum insight even with limited data
          synthesisInsights.push(
            this.store.addInsight({
              dreamId: dream.id,
              type: "synthesis",
              title: `Shared dream: ${allAgentInsights.length} insights from ${scopeLabel}`,
              description: `Cross-agent sharing checked ${dreamsWithInsights.length} dreams. ${allAgentInsights.length} total insights found across ${agentCount} agent types.`,
              confidence: 0.5,
              sourceCount: Math.max(1, allAgentInsights.length),
              actionable: false,
              applied: false,
            }),
          )
        }

        this.store.updateDream(dream.id, {
          status: "completed",
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - cycleStart,
          insightIds: synthesisInsights.map((i) => i.id),
          summary: `Shared dream: ${allAgentInsights.length} insights from ${agentCount} agent types (${scopeLabel})`,
          narrative: [`Cross-agent knowledge shared across ${scopeLabel}`,
            `Total insights consolidated: ${allAgentInsights.length}`,
            `High-confidence findings: ${highConfidence.length}`,
            `Recurring patterns: ${patterns.length}`,
            agentTypes ? `Filtered to types: ${agentTypes.join(", ")}` : `All agent types: ${[...agentTypesSet].join(", ")}`,
          ].join("\n"),
          vividness: agentCount > 2 ? "vivid" : "moderate",
        })

        sharedDreamCount = 1
        allInsights.push(...synthesisInsights)
      } catch (err) {
        this.store.updateDream(dream.id, { status: "failed" })
        log.error(`Share dream failed: ${err instanceof Error ? err.message : String(err)}`)
      }
      this.activeDreams.delete(dream.id)
    }

    // Phase 6: Mood Consolidation (only runs when not filtering — fleet-wide view)
    if (!agentTypes) {
      let moodDreamId: string | null = null
      try {
        const { soulManager } = await import("../agent/soul")
        const souls = soulManager.list()

        if (souls.length >= 2) {
          const dream = this.store.createDream({
            agentType: "system",
            agentId: "dream-engine",
            type: "mood-consolidation",
          })
          moodDreamId = dream.id
          this.activeDreams.add(dream.id)

          const moodCounts = new Map<string, number>()
          let totalStreak = 0
          for (const { soul } of souls) {
            moodCounts.set(soul.mood.mood, (moodCounts.get(soul.mood.mood) ?? 0) + 1)
            totalStreak += soul.mood.streak
          }

          const dominantMood = [...moodCounts.entries()].sort(([, a], [, b]) => b - a)[0]
          const avgStreak = souls.length > 0 ? Math.round(totalStreak / souls.length) : 0
          const burnedOutCount = moodCounts.get("burned_out") ?? 0
          const frustratedCount = moodCounts.get("frustrated") ?? 0
          const moodHealth = burnedOutCount > 0 ? "concerning" : frustratedCount > 0 ? "strained" : "healthy"

          const insight = this.store.addInsight({
            dreamId: dream.id,
            type: "synthesis",
            title: `Fleet mood: ${moodHealth} — ${dominantMood ? dominantMood[0] + " (" + dominantMood[1] + " agents)" : "unknown"}`,
            description: `${souls.length} agents tracked. Dominant mood: ${dominantMood ? dominantMood[0] : "N/A"}. Avg streak: ${avgStreak}. Burned out: ${burnedOutCount}. Frustrated: ${frustratedCount}.`,
            confidence: 0.8,
            sourceCount: souls.length,
            actionable: burnedOutCount > 0,
            applied: false,
          })

          this.store.updateDream(dream.id, {
            status: "completed",
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - cycleStart,
            insightIds: [insight.id],
            summary: `Fleet mood: ${souls.length} agents, dominant: ${dominantMood ? dominantMood[0] : "N/A"}, health: ${moodHealth}`,
            narrative: [`Fleet emotional health: ${moodHealth}`,
              `Agents tracked: ${souls.length}`,
              `Mood distribution: ${[...moodCounts.entries()].map(([m, c]) => `${m}: ${c}`).join(", ")}`,
              `Average streak: ${avgStreak}`,
              `Burned out: ${burnedOutCount}, Frustrated: ${frustratedCount}`,
            ].join("\n"),
            vividness: burnedOutCount > 0 ? "vivid" : "moderate",
          })

          moodConsolidationCount = 1
          allInsights.push(insight)
        }
      } catch (err) {
        log.error(`Mood consolidation in share cycle failed: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        if (moodDreamId) {
          this.activeDreams.delete(moodDreamId)
        }
      }
    }

    const completedAt = new Date().toISOString()
    const durationMs = Date.now() - cycleStart

    const report: DreamCycleReport = {
      cycleId,
      startedAt,
      completedAt,
      durationMs,
      dreamsCreated: sharedDreamCount + moodConsolidationCount,
      insightsGenerated: allInsights.length,
      memoryReplayCount: 0,
      patternCount: 0,
      compressionCount: 0,
      counterfactualCount: 0,
      sharedDreamCount,
      moodConsolidationCount,
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

  private buildNarrative(patterns: string[], anomalies: string[]): string {
    const parts: string[] = []

    if (patterns.length > 0) {
      parts.push("Patterns observed:")
      parts.push(...patterns.map((p) => `  • ${p}`))
    }

    if (anomalies.length > 0) {
      if (parts.length > 0) parts.push("")
      parts.push("Anomalies detected:")
      parts.push(...anomalies.map((a) => `  ⚠ ${a}`))
    }

    if (parts.length === 0) {
      parts.push("Nothing unusual — all experiences within expected patterns.")
    }

    return parts.join("\n")
  }
}

export const dreamEngine = new DreamEngine()

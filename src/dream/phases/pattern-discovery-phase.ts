import { createLogger } from "../../cli/logger"
import { experienceStore } from "../../experience/store"
import type { DreamStore } from "../dream-store"
import type { DreamInsight, DreamConfig } from "../types"

const log = createLogger("dream-engine")

export interface PatternDiscoveryPhaseResult {
  insights: DreamInsight[]
  dreamCount: number
}

export async function runPatternDiscoveryPhase(
  store: DreamStore,
  config: DreamConfig,
  cycleStart: number,
): Promise<PatternDiscoveryPhaseResult> {
  if (!config.patternDiscovery.enabled) return { insights: [], dreamCount: 0 }

  try {
    const clusterInsights = experienceStore.computeClusterInsights(config.patternDiscovery.minClusterSize)
    if (clusterInsights.length === 0) return { insights: [], dreamCount: 0 }

    const dream = store.createDream({
      agentType: "system",
      agentId: "dream-engine",
      type: "pattern-discovery",
    })

    const dreamInsights = clusterInsights.map((ci) =>
      store.addInsight({
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

    store.updateDream(dream.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - cycleStart,
      insightIds: dreamInsights.map((i) => i.id),
      summary: `Pattern discovery: ${clusterInsights.length} clusters found`,
      narrative: clusterInsights.map((ci) => `Cluster "${ci.clusterKey}": ${ci.count} occurrences`).join("\n"),
      vividness: clusterInsights.length > 3 ? "vivid" : "moderate",
    })

    return { insights: dreamInsights.filter((i) => i.confidence > 0.5), dreamCount: 1 }
  } catch (err) {
    log.error(`Pattern discovery dream failed: ${err instanceof Error ? err.message : String(err)}`)
    return { insights: [], dreamCount: 0 }
  }
}

import { createLogger } from "../../cli/logger"
import type { DreamStore } from "../dream-store"
import type { DreamInsight, DreamConfig } from "../types"

const log = createLogger("dream-engine")

export interface KnowledgeCompressionPhaseResult {
  insights: DreamInsight[]
  dreamCount: number
}

export async function runKnowledgeCompressionPhase(
  store: DreamStore,
  config: DreamConfig,
  cycleStart: number,
): Promise<KnowledgeCompressionPhaseResult> {
  if (!config.knowledgeCompression.enabled) return { insights: [], dreamCount: 0 }

  try {
    const recentDreams = store.listDreams(config.knowledgeCompression.maxEntries)
    if (recentDreams.length < 5) return { insights: [], dreamCount: 0 }

    const dream = store.createDream({
      agentType: "system",
      agentId: "dream-engine",
      type: "knowledge-compression",
    })

    const concepts = new Set<string>()
    let totalInsights = 0
    for (const d of recentDreams) {
      const ins = store.getInsightsForDream(d.id)
      totalInsights += ins.length
      for (const i of ins) {
        for (const word of i.title.split(/\s+/)) {
          if (word.length > 4) concepts.add(word.toLowerCase())
        }
      }
    }

    const compressionRatio = recentDreams.length > 0 ? totalInsights / recentDreams.length : 0

    const insight = store.addInsight({
      dreamId: dream.id,
      type: "compression",
      title: `Knowledge compressed from ${recentDreams.length} dreams`,
      description: `${totalInsights} insights consolidated into ${concepts.size} conceptual groups`,
      confidence: Math.min(0.9, concepts.size / totalInsights || 0),
      sourceCount: recentDreams.length,
      actionable: false,
      applied: false,
    })

    store.updateDream(dream.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - cycleStart,
      insightIds: [insight.id],
      summary: `Compressed ${recentDreams.length} dreams into ${concepts.size} concept groups`,
      narrative: [...concepts].slice(0, 20).join(", "),
      vividness: compressionRatio > 0.5 ? "vivid" : "faint",
    })

    return { insights: [insight], dreamCount: 1 }
  } catch (err) {
    log.error(`Knowledge compression dream failed: ${err instanceof Error ? err.message : String(err)}`)
    return { insights: [], dreamCount: 0 }
  }
}

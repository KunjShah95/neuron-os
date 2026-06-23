import { createLogger } from "../../cli/logger"
import { MemoryReplay } from "../memory-replay"
import { InsightGenerator } from "../insight-generator"
import type { DreamStore } from "../dream-store"
import type { DreamInsight, DreamConfig } from "../types"

const log = createLogger("dream-engine")

export interface MemoryReplayPhaseResult {
  insights: DreamInsight[]
  dreamCount: number
}

const memoryReplay = new MemoryReplay()
const insightGen = new InsightGenerator()

function buildNarrative(patterns: string[], anomalies: string[]): string {
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

export async function runMemoryReplayPhase(
  store: DreamStore,
  config: DreamConfig,
  cycleStart: number,
  activeDreams: Set<string>,
): Promise<MemoryReplayPhaseResult> {
  if (!config.memoryReplay.enabled) return { insights: [], dreamCount: 0 }

  const dream = store.createDream({
    agentType: "system",
    agentId: "dream-engine",
    type: "memory-replay",
  })
  activeDreams.add(dream.id)
  store.updateDream(dream.id, { status: "processing" })

  try {
    const result = memoryReplay.replay(config.memoryReplay)
    const insights = insightGen.generateFromMemoryReplay(dream.id, result)

    for (const ins of insights) {
      store.addInsight(ins)
    }

    store.updateDream(dream.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - cycleStart,
      insightIds: insights.map((i) => i.id),
      summary: `Memory replay: ${result.replayedExperiences.length} experiences, ${result.patternsFound.length} patterns, ${result.anomalies.length} anomalies`,
      narrative: buildNarrative(result.patternsFound, result.anomalies),
      vividness: result.patternsFound.length > 3 ? "vivid" : result.patternsFound.length > 0 ? "moderate" : "faint",
      sourceIds: result.replayedExperiences.map((e) => e.id),
    })

    activeDreams.delete(dream.id)
    return { insights, dreamCount: 1 }
  } catch (err) {
    store.updateDream(dream.id, { status: "failed" })
    activeDreams.delete(dream.id)
    log.error(`Memory replay dream failed: ${err instanceof Error ? err.message : String(err)}`)
    return { insights: [], dreamCount: 0 }
  }
}

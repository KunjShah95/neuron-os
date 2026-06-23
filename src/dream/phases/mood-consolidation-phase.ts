import { createLogger } from "../../cli/logger"
import type { DreamStore } from "../dream-store"
import type { DreamInsight } from "../types"

const log = createLogger("dream-engine")

export interface MoodConsolidationPhaseResult {
  insights: DreamInsight[]
  dreamCount: number
  dreamId?: string
}

export async function runMoodConsolidationPhase(
  store: DreamStore,
  cycleStart: number,
  activeDreams: Set<string>,
): Promise<MoodConsolidationPhaseResult> {
  let dreamId: string | undefined

  try {
    const { soulManager } = await import("../../agent/soul")
    const souls = soulManager.list()

    if (souls.length < 2) return { insights: [], dreamCount: 0 }

    const dream = store.createDream({
      agentType: "system",
      agentId: "dream-engine",
      type: "mood-consolidation",
    })
    dreamId = dream.id
    activeDreams.add(dream.id)

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

    const insight = store.addInsight({
      dreamId: dream.id,
      type: "synthesis",
      title: `Fleet mood: ${moodHealth} — ${dominantMood ? dominantMood[0] + " (" + dominantMood[1] + " agents)" : "unknown"}`,
      description: `${souls.length} agents tracked. Dominant mood: ${dominantMood ? dominantMood[0] : "N/A"}. Avg streak: ${avgStreak}. Burned out: ${burnedOutCount}. Frustrated: ${frustratedCount}.`,
      confidence: 0.8,
      sourceCount: souls.length,
      actionable: burnedOutCount > 0,
      applied: false,
    })

    store.updateDream(dream.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - cycleStart,
      insightIds: [insight.id],
      summary: `Fleet mood${cycleStart ? "" : " consolidation"}: ${souls.length} agents, dominant: ${dominantMood ? dominantMood[0] : "N/A"}, health: ${moodHealth}`,
      narrative: [
        `Fleet emotional health: ${moodHealth}`,
        `Agents tracked: ${souls.length}`,
        `Mood distribution: ${[...moodCounts.entries()].map(([m, c]) => `${m}: ${c}`).join(", ")}`,
        `Average streak: ${avgStreak}`,
        `Burned out: ${burnedOutCount}, Frustrated: ${frustratedCount}`,
      ].join("\n"),
      vividness: burnedOutCount > 0 ? "vivid" : "moderate",
    })

    activeDreams.delete(dream.id)
    return { insights: [insight], dreamCount: 1, dreamId: dream.id }
  } catch (err) {
    if (dreamId) activeDreams.delete(dreamId)
    log.error(`Mood consolidation dream failed: ${err instanceof Error ? err.message : String(err)}`)
    return { insights: [], dreamCount: 0 }
  }
}

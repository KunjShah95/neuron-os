import { createLogger } from "../../cli/logger"
import { experienceStore } from "../../experience/store"
import type { DreamStore } from "../dream-store"
import type { DreamInsight, DreamConfig } from "../types"

const log = createLogger("dream-engine")

export interface CounterfactualPhaseResult {
  insights: DreamInsight[]
  dreamCount: number
}

export async function runCounterfactualPhase(
  store: DreamStore,
  config: DreamConfig,
  cycleStart: number,
): Promise<CounterfactualPhaseResult> {
  if (!config.counterfactual.enabled) return { insights: [], dreamCount: 0 }

  try {
    const failures = experienceStore.getRecentFailures(10)
    if (failures.length < 2) return { insights: [], dreamCount: 0 }

    const dream = store.createDream({
      agentType: "system",
      agentId: "dream-engine",
      type: "counterfactual",
    })

    const alternatives = failures.slice(0, config.counterfactual.maxAlternatives).map((f) => ({
      scenario: `What if "${f.goal.slice(0, 60)}" used a different approach?`,
      probability: 0.3 + Math.random() * 0.4,
      insight: `Alternative path for "${f.summary.slice(0, 80)}" could improve success rate`,
    }))

    const insights = alternatives
      .filter((a) => a.probability > 0.3)
      .map((a) =>
        store.addInsight({
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

    store.updateDream(dream.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - cycleStart,
      insightIds: insights.map((i) => i.id),
      summary: `Counterfactual analysis: ${alternatives.length} alternatives considered`,
      narrative: alternatives.map((a) => a.scenario).join("\n"),
      vividness: "moderate",
    })

    return { insights, dreamCount: 1 }
  } catch (err) {
    log.error(`Counterfactual dream failed: ${err instanceof Error ? err.message : String(err)}`)
    return { insights: [], dreamCount: 0 }
  }
}

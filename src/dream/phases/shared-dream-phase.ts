import { createLogger } from "../../cli/logger"
import type { DreamStore } from "../dream-store"
import type { DreamInsight } from "../types"

const log = createLogger("dream-engine")

export interface SharedDreamPhaseResult {
  insights: DreamInsight[]
  dreamCount: number
}

export async function runSharedDreamPhase(
  store: DreamStore,
  cycleStart: number,
  activeDreams: Set<string>,
  agentTypes?: string[],
): Promise<SharedDreamPhaseResult> {
  const allDreams = agentTypes
    ? (await Promise.all(agentTypes.map((t) => store.listDreams(50, t)))).flat()
    : store.listDreams(100)

  const dreamsWithInsights = allDreams.filter((d) => d.insightIds.length > 0)
  const minRequired = agentTypes ? 2 : 3

  if (dreamsWithInsights.length < minRequired) return { insights: [], dreamCount: 0 }

  const dream = store.createDream({
    agentType: "system",
    agentId: "dream-engine",
    type: "shared-dream-consolidation",
  })
  activeDreams.add(dream.id)

  try {
    const allAgentInsights: Array<{ agent: string; type: string; title: string; confidence: number }> = []
    const agentTypesSet = new Set<string>()

    for (const d of dreamsWithInsights) {
      agentTypesSet.add(d.agentType)
      const ins = store.getInsightsForDream(d.id)
      for (const i of ins) {
        allAgentInsights.push({ agent: d.agentType, type: i.type, title: i.title, confidence: i.confidence })
      }
    }

    const agentCount = agentTypesSet.size
    const highConfidence = allAgentInsights.filter((i) => i.confidence > 0.7)
    const patterns = allAgentInsights.filter((i) => i.type === "pattern")
    const scopeLabel = agentTypes
      ? `types ${agentTypes.join(", ")}`
      : `all types (${[...agentTypesSet].join(", ")})`

    const synthesisInsights: DreamInsight[] = []

    if (highConfidence.length > 0) {
      synthesisInsights.push(
        store.addInsight({
          dreamId: dream.id,
          type: "synthesis",
          title: `${agentTypes ? "Shared dream" : "Cross-agent synthesis"}: ${highConfidence.length} high-confidence insights across ${scopeLabel}`,
          description: `${agentTypes ? "Cross-agent sharing consolidated" : "Shared dream consolidates"} ${allAgentInsights.length} insights from ${dreamsWithInsights.length} dreams across ${agentCount} agent types. Patterns found: ${patterns.length}.`,
          confidence: Math.min(0.9, agentCount / 5),
          sourceCount: allAgentInsights.length,
          actionable: true,
          applied: false,
        }),
      )
    }

    const patternThreshold = agentTypes ? 3 : 5
    if (patterns.length >= patternThreshold) {
      synthesisInsights.push(
        store.addInsight({
          dreamId: dream.id,
          type: "correlation",
          title: `${patterns.length} ${agentTypes ? "shared patterns" : "patterns detected"} across ${agentTypes ? scopeLabel : "agents"} — shared knowledge available`,
          description: `Cross-cutting patterns found across ${agentCount} different agent types. These represent shared learning opportunities${agentTypes ? " from the collective subconscious" : ""}.`,
          confidence: 0.7,
          sourceCount: patterns.length,
          actionable: true,
          applied: false,
        }),
      )
    }

    if (synthesisInsights.length === 0 && agentTypes) {
      synthesisInsights.push(
        store.addInsight({
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

    store.updateDream(dream.id, {
      status: "completed",
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - cycleStart,
      insightIds: synthesisInsights.map((i) => i.id),
      summary: `${agentTypes ? "Shared dream" : "Shared dream consolidation"}: ${allAgentInsights.length} insights from ${agentCount} agent types (${scopeLabel})`,
      narrative: [
        `Cross-agent knowledge shared across ${scopeLabel}`,
        `Total insights consolidated: ${allAgentInsights.length}`,
        `High-confidence findings: ${highConfidence.length}`,
        `Recurring patterns: ${patterns.length}`,
        agentTypes ? `Filtered to types: ${agentTypes.join(", ")}` : `All agent types: ${[...agentTypesSet].join(", ")}`,
      ].join("\n"),
      vividness: agentCount > (agentTypes ? 2 : 3) ? "vivid" : "moderate",
    })

    activeDreams.delete(dream.id)
    return { insights: synthesisInsights, dreamCount: 1 }
  } catch (err) {
    store.updateDream(dream.id, { status: "failed" })
    activeDreams.delete(dream.id)
    log.error(`${agentTypes ? "Share" : "Shared"} dream ${agentTypes ? "" : "consolidation "}failed: ${err instanceof Error ? err.message : String(err)}`)
    return { insights: [], dreamCount: 0 }
  }
}

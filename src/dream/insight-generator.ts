import type { DreamInsight, MemoryReplayResult, PatternDiscoveryResult, CompressionResult, CounterfactualResult } from "./types"

export class InsightGenerator {
  generateFromMemoryReplay(
    dreamId: string,
    result: MemoryReplayResult,
  ): DreamInsight[] {
    const insights: DreamInsight[] = []
    const now = new Date().toISOString()

    for (const pattern of result.patternsFound) {
      insights.push({
        id: `${dreamId}-p-${insights.length}`,
        dreamId,
        type: "pattern",
        title: `Replay pattern: ${pattern.slice(0, 60)}`,
        description: pattern,
        confidence: 0.6,
        sourceCount: result.replayedExperiences.length,
        actionable: true,
        applied: false,
        createdAt: now,
      })
    }

    for (const anomaly of result.anomalies) {
      insights.push({
        id: `${dreamId}-a-${insights.length}`,
        dreamId,
        type: "correlation",
        title: `Anomaly detected: ${anomaly.slice(0, 60)}`,
        description: anomaly,
        confidence: 0.8,
        sourceCount: result.replayedExperiences.filter((e) => e.outcome === "failed").length,
        actionable: true,
        applied: false,
        createdAt: now,
      })
    }

    for (const corr of result.crossCorrelations) {
      if (corr.correlation > 0.8) {
        insights.push({
          id: `${dreamId}-c-${insights.length}`,
          dreamId,
          type: "correlation",
          title: `${corr.source} ↔ ${corr.target} correlation`,
          description: `${corr.source} and ${corr.target} agents show correlated outcomes (r=${corr.correlation.toFixed(2)})`,
          confidence: corr.correlation,
          sourceCount: result.replayedExperiences.length,
          actionable: false,
          applied: false,
          createdAt: now,
        })
      }
    }

    return insights
  }

  generateFromPatternDiscovery(
    dreamId: string,
    result: PatternDiscoveryResult,
  ): DreamInsight[] {
    const insights: DreamInsight[] = []
    const now = new Date().toISOString()

    for (const pattern of result.emergentPatterns) {
      if (pattern.confidence > 0.5) {
        insights.push({
          id: `${dreamId}-ep-${insights.length}`,
          dreamId,
          type: "pattern",
          title: `Emergent: ${pattern.name}`,
          description: pattern.description,
          confidence: pattern.confidence,
          sourceCount: pattern.evidence.length,
          actionable: true,
          applied: false,
          createdAt: now,
        })
      }
    }

    for (const cluster of result.clusters) {
      if (cluster.novelty > 0.6) {
        insights.push({
          id: `${dreamId}-nc-${insights.length}`,
          dreamId,
          type: "synthesis",
          title: `Novel cluster: ${cluster.key}`,
          description: `Found ${cluster.count} related items with novelty ${(cluster.novelty * 100).toFixed(0)}%`,
          confidence: cluster.novelty,
          sourceCount: cluster.count,
          actionable: true,
          applied: false,
          createdAt: now,
        })
      }
    }

    return insights
  }

  generateFromCompression(
    dreamId: string,
    result: CompressionResult,
  ): DreamInsight[] {
    const insights: DreamInsight[] = []
    const now = new Date().toISOString()

    if (result.compressionRatio > 0.3) {
      insights.push({
        id: `${dreamId}-comp-${insights.length}`,
        dreamId,
        type: "compression",
        title: `Knowledge compressed ${(result.compressionRatio * 100).toFixed(0)}%`,
        description: `Consolidated ${result.originalCount} entries into ${result.compressedCount}, preserving ${result.preservedConcepts.length} core concepts`,
        confidence: Math.min(0.9, result.compressionRatio),
        sourceCount: result.originalCount,
        actionable: false,
        applied: false,
        createdAt: now,
      })
    }

    if (result.lostConcepts.length > 0) {
      insights.push({
        id: `${dreamId}-lost-${insights.length}`,
        dreamId,
        type: "synthesis",
        title: `Pruned ${result.lostConcepts.length} low-value concepts`,
        description: `Concepts removed: ${result.lostConcepts.join(", ")}`,
        confidence: 0.7,
        sourceCount: result.lostConcepts.length,
        actionable: false,
        applied: false,
        createdAt: now,
      })
    }

    return insights
  }

  generateFromCounterfactual(
    dreamId: string,
    result: CounterfactualResult,
  ): DreamInsight[] {
    const insights: DreamInsight[] = []
    const now = new Date().toISOString()

    for (const alt of result.alternatives) {
      if (alt.probability > 0.3) {
        insights.push({
          id: `${dreamId}-cf-${insights.length}`,
          dreamId,
          type: "counterfactual",
          title: `Counterfactual: ${alt.scenario.slice(0, 60)}`,
          description: `${alt.insight} (estimated probability: ${(alt.probability * 100).toFixed(0)}%)`,
          confidence: alt.probability,
          sourceCount: 1,
          actionable: true,
          applied: false,
          createdAt: now,
        })
      }
    }

    return insights
  }
}

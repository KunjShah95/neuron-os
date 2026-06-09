import { createLogger } from "../cli/logger"
import { computeEmbedding, cosineSimilarity } from "../memory/embedding"
import { experienceStore } from "../experience/store"
import type { MemoryReplayResult, DreamConfig } from "./types"

const log = createLogger("dream:memory-replay")

export class MemoryReplay {
  replay(config: DreamConfig["memoryReplay"]): MemoryReplayResult {
    const startTime = Date.now()

    const failures = experienceStore.getRecentFailures(config.sampleSize)
    const successes = experienceStore.getRecentSuccesses(config.sampleSize)

    const combined = [...failures, ...successes]
    if (combined.length === 0) {
      return { replayedExperiences: [], patternsFound: [], anomalies: [], crossCorrelations: [] }
    }

    const patternsFound = this.findPatterns(combined)
    const anomalies = this.findAnomalies(combined)
    const crossCorrelations = this.findCrossCorrelations(combined)

    log.info(`Memory replay complete: ${combined.length} experiences, ${patternsFound.length} patterns, ${anomalies.length} anomalies in ${Date.now() - startTime}ms`)

    return {
      replayedExperiences: combined,
      patternsFound,
      anomalies,
      crossCorrelations,
    }
  }

  private findPatterns(experiences: MemoryReplayResult["replayedExperiences"]): string[] {
    const patterns: string[] = []

    const outcomeGroups = new Map<string, number>()
    for (const exp of experiences) {
      const key = `${exp.outcome}:${exp.agentType}`
      outcomeGroups.set(key, (outcomeGroups.get(key) || 0) + 1)
    }

    for (const [key, count] of outcomeGroups) {
      const [outcome, agentType] = key.split(":")
      if (count >= 3) {
        patterns.push(`${agentType} agents show ${outcome} pattern ${count} times`)
      }
    }

    const goalSimilarities = this.computeGoalSimilarities(experiences)
    if (goalSimilarities.length > 0) {
      const avg = goalSimilarities.reduce((a, b) => a + b, 0) / goalSimilarities.length
      if (avg > 0.4) {
        patterns.push(`High goal similarity (${(avg * 100).toFixed(0)}%) — repetitive task patterns detected`)
      }
    }

    return patterns
  }

  private findAnomalies(experiences: MemoryReplayResult["replayedExperiences"]): string[] {
    const anomalies: string[] = []

    const rewards = experiences.map((e) => e.reward)
    if (rewards.length > 5) {
      const sorted = [...rewards].sort((a, b) => a - b)
      const q1 = sorted[Math.floor(sorted.length * 0.25)]!
      const q3 = sorted[Math.floor(sorted.length * 0.75)]!
      const iqr = q3 - q1
      const lowerBound = q1 - 1.5 * iqr

      for (const exp of experiences) {
        if (exp.reward < lowerBound && exp.outcome === "failed") {
          anomalies.push(`Low-reward failure: ${exp.summary.slice(0, 100)}`)
        }
      }
    }

    const recentFailures = experiences.filter(
      (e) => e.outcome === "failed" && Date.now() - new Date(e.completedAt).getTime() < 3600000,
    )
    if (recentFailures.length > 5) {
      anomalies.push(`Failure spike: ${recentFailures.length} failures in the last hour`)
    }

    return anomalies
  }

  private findCrossCorrelations(
    experiences: MemoryReplayResult["replayedExperiences"],
  ): MemoryReplayResult["crossCorrelations"] {
    const correlations: MemoryReplayResult["crossCorrelations"] = []

    const outcomeByType = new Map<string, { success: number; failure: number; total: number }>()
    for (const exp of experiences) {
      const stat = outcomeByType.get(exp.agentType) || { success: 0, failure: 0, total: 0 }
      stat.total++
      if (exp.outcome === "success") stat.success++
      if (exp.outcome === "failed") stat.failure++
      outcomeByType.set(exp.agentType, stat)
    }

    const types = [...outcomeByType.entries()] as Array<[string, { success: number; failure: number; total: number }]>
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const [a, aStats] = types[i]!
        const [b, bStats] = types[j]!

        const aSuccessRate = aStats.total > 0 ? aStats.success / aStats.total : 0
        const bSuccessRate = bStats.total > 0 ? bStats.success / bStats.total : 0

        if (Math.abs(aSuccessRate - bSuccessRate) < 0.15) {
          correlations.push({
            source: a,
            target: b,
            correlation: 1 - Math.abs(aSuccessRate - bSuccessRate),
          })
        }
      }
    }

    return correlations.sort((a, b) => b.correlation - a.correlation)
  }

  private computeGoalSimilarities(experiences: MemoryReplayResult["replayedExperiences"]): number[] {
    if (experiences.length < 2) return []

    const embeddings = experiences.map((e) => computeEmbedding(`${e.goal} ${e.summary}`))
    const similarities: number[] = []

    for (let i = 0; i < embeddings.length - 1; i++) {
      const ei = embeddings[i]
      if (!ei) continue
      for (let j = i + 1; j < embeddings.length; j++) {
        const ej = embeddings[j]
        if (!ej) continue
        similarities.push(cosineSimilarity(ei, ej))
      }
    }

    return similarities
  }
}

/**
 * src/improve/skill-monitor.ts
 *
 * Tracks skill performance over time after publication. Monitors
 * invocation count, success rate, reward trends, and generates
 * improvement suggestions when performance degrades.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createLogger } from "../cli/logger"

const log = createLogger("improve:skill-monitor")

// ── Types ────────────────────────────────────────────────────────

export interface SkillPerformanceRecord {
  skillId: string
  skillName: string
  timestamp: string
  invocationCount: number
  successCount: number
  avgReward: number
  totalTokens: number
  avgDurationMs: number
}

export interface SkillPerformanceSummary {
  skillId: string
  skillName: string
  firstSeen: string
  lastSeen: string
  totalInvocations: number
  currentSuccessRate: number
  overallSuccessRate: number
  avgReward: number
  trend: "improving" | "stable" | "degrading"
  trendSlope: number // Positive = improving
  degradationScore: number // 0-1, higher = more degraded
  improvementSuggestions: string[]
}

export interface SkillMonitorConfig {
  historyPath: string
  trendWindowDays: number // Days to compute trend over
  degradationThreshold: number // Success rate drop before flagging
  minRecordsForTrend: number // Minimum data points for trend analysis
}

const DEFAULT_CONFIG: SkillMonitorConfig = {
  historyPath: join(process.cwd(), ".aegis", "skill-monitor.json"),
  trendWindowDays: 14,
  degradationThreshold: 0.1, // 10% drop triggers suggestion
  minRecordsForTrend: 3,
}

// ── SkillMonitor ────────────────────────────────────────────────

export class SkillMonitor {
  private config: SkillMonitorConfig
  private records: SkillPerformanceRecord[] = []

  constructor(config?: Partial<SkillMonitorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.load()
  }

  /**
   * Record a skill usage outcome.
   */
  recordUsage(
    skillId: string,
    skillName: string,
    success: boolean,
    reward: number,
    tokenCount: number,
    durationMs: number,
  ): void {
    const lastRecord = this.getLatestRecord(skillId)
    const record: SkillPerformanceRecord = {
      skillId,
      skillName,
      timestamp: new Date().toISOString(),
      invocationCount: (lastRecord?.invocationCount ?? 0) + 1,
      successCount: (lastRecord?.successCount ?? 0) + (success ? 1 : 0),
      avgReward: this.computeRollingAvg(lastRecord, reward),
      totalTokens: (lastRecord?.totalTokens ?? 0) + tokenCount,
      avgDurationMs: this.computeRollingAvg(lastRecord, durationMs),
    }
    this.records.push(record)
    this.save()
    log.debug(`Recorded skill usage: ${skillName} (success=${success}, reward=${reward.toFixed(2)})`)
  }

  /**
   * Get performance summary for a specific skill.
   */
  getPerformance(skillId: string): SkillPerformanceSummary | null {
    const skillRecords = this.records
      .filter((r) => r.skillId === skillId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    if (skillRecords.length === 0) return null

    const first = skillRecords[0]!
    const last = skillRecords[skillRecords.length - 1]!
    const totalInvocations = skillRecords.reduce((s, r) => s + r.invocationCount, 0)
    const totalSuccesses = skillRecords.reduce((s, r) => s + r.successCount, 0)
    const overallSuccessRate = totalInvocations > 0 ? totalSuccesses / totalInvocations : 0

    // Compute recent trend (last N days)
    const windowStart = new Date()
    windowStart.setDate(windowStart.getDate() - this.config.trendWindowDays)
    const recentRecords = skillRecords.filter((r) => new Date(r.timestamp) >= windowStart)

    const currentSuccessRate =
      recentRecords.length >= 2
        ? recentRecords[recentRecords.length - 1]!.successCount /
          Math.max(1, recentRecords[recentRecords.length - 1]!.invocationCount)
        : overallSuccessRate

    // Linear regression on success rate over time
    const trend = this.computeTrend(
      recentRecords.length >= this.config.minRecordsForTrend ? recentRecords : skillRecords,
    )

    const degradationScore = Math.max(0, trend.slope < 0 ? Math.abs(trend.slope) : 0)

    const suggestions = this.generateSuggestions(skillId, currentSuccessRate, totalInvocations, trend, degradationScore)

    return {
      skillId,
      skillName: last.skillName,
      firstSeen: first.timestamp,
      lastSeen: last.timestamp,
      totalInvocations,
      currentSuccessRate,
      overallSuccessRate,
      avgReward: last.avgReward,
      trend: trend.direction,
      trendSlope: trend.slope,
      degradationScore,
      improvementSuggestions: suggestions,
    }
  }

  /**
   * List all skills with their performance summaries.
   */
  listAll(): SkillPerformanceSummary[] {
    const skillIds = [...new Set(this.records.map((r) => r.skillId))]
    return skillIds
      .map((id) => this.getPerformance(id))
      .filter((s): s is SkillPerformanceSummary => s !== null)
      .sort((a, b) => b.degradationScore - a.degradationScore)
  }

  /**
   * Get degrading skills that need attention.
   */
  getDegradingSkills(threshold?: number): SkillPerformanceSummary[] {
    const t = threshold ?? this.config.degradationThreshold
    return this.listAll().filter((s) => s.degradationScore > t)
  }

  /**
   * Get top performing skills.
   */
  getTopSkills(limit = 5): SkillPerformanceSummary[] {
    return this.listAll()
      .filter((s) => s.totalInvocations >= 3)
      .sort((a, b) => b.currentSuccessRate - a.currentSuccessRate)
      .slice(0, limit)
  }

  /**
   * Get overall monitor stats.
   */
  getStats(): {
    totalSkills: number
    totalRecords: number
    avgSuccessRate: number
    degradingSkills: number
  } {
    const all = this.listAll()
    return {
      totalSkills: all.length,
      totalRecords: this.records.length,
      avgSuccessRate: all.length > 0 ? all.reduce((s, sk) => s + sk.currentSuccessRate, 0) / all.length : 0,
      degradingSkills: all.filter((s) => s.degradationScore > this.config.degradationThreshold).length,
    }
  }

  // ── Private helpers ──────────────────────────────────────────

  private getLatestRecord(skillId: string): SkillPerformanceRecord | undefined {
    return this.records
      .filter((r) => r.skillId === skillId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
  }

  private computeRollingAvg(prev: SkillPerformanceRecord | undefined, newValue: number): number {
    if (!prev) return newValue
    // Exponential moving average (α = 0.3)
    return prev.avgReward * 0.7 + newValue * 0.3
  }

  private computeTrend(records: SkillPerformanceRecord[]): {
    slope: number
    direction: "improving" | "stable" | "degrading"
  } {
    if (records.length < 2) {
      return { slope: 0, direction: "stable" }
    }

    // Simple linear regression: success rate over time
    const data = records.map((r, i) => ({
      x: i,
      y: r.invocationCount > 0 ? r.successCount / r.invocationCount : 0,
    }))

    const n = data.length
    const sumX = data.reduce((s, d) => s + d.x, 0)
    const sumY = data.reduce((s, d) => s + d.y, 0)
    const sumXY = data.reduce((s, d) => s + d.x * d.y, 0)
    const sumX2 = data.reduce((s, d) => s + d.x ** 2, 0)

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX ** 2)

    let direction: "improving" | "stable" | "degrading"
    if (slope > 0.02) direction = "improving"
    else if (slope < -0.02) direction = "degrading"
    else direction = "stable"

    return { slope, direction }
  }

  private generateSuggestions(
    _skillId: string,
    currentSuccessRate: number,
    totalInvocations: number,
    trend: { slope: number; direction: string },
    degradationScore: number,
  ): string[] {
    const suggestions: string[] = []

    if (degradationScore > this.config.degradationThreshold) {
      suggestions.push(
        `Skill success rate declining (slope: ${trend.slope.toFixed(3)}). Consider re-validating against eval suite.`,
      )
    }

    if (currentSuccessRate < 0.5) {
      suggestions.push(
        `Skill success rate is critically low (${(currentSuccessRate * 100).toFixed(0)}%). Consider unpublishing or regenerating.`,
      )
    }

    if (totalInvocations < 10) {
      suggestions.push(
        `Low invocation count (${totalInvocations}). Skill may need more usage data for reliable trend analysis.`,
      )
    }

    if (suggestions.length === 0) {
      suggestions.push("Skill performance is within acceptable range. Continue monitoring.")
    }

    return suggestions
  }

  private load(): void {
    if (!existsSync(this.config.historyPath)) return
    try {
      const raw = readFileSync(this.config.historyPath, "utf-8")
      this.records = JSON.parse(raw)
    } catch {
      this.records = []
    }
  }

  private save(): void {
    const dir = join(this.config.historyPath, "..")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(this.config.historyPath, JSON.stringify(this.records, null, 2), "utf-8")
  }
}

export const skillMonitor = new SkillMonitor()

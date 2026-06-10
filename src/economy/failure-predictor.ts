/**
 * failure-predictor — Predictive Agent System (v0.15.0+).
 *
 * Scores the risk of agent failure BEFORE a spawn, based on historical
 * patterns drawn from the experience store:
 *   - Agent type × hour-of-day failure rates
 *   - Agent type × day-of-week failure rates
 *   - Consecutive failure streaks (recency bias)
 *   - Resource-constrained environments (memory, CPU limits)
 *
 * Usage:
 *   const risk = FailurePredictor.evaluateSpawnRisk({
 *     agentType: "build",
 *     hour: 14,
 *     cpu: 2,
 *     memoryMB: 512,
 *   })
 *   if (risk.level === "high") console.warn(risk.reason)
 */

import { createLogger } from "../cli/logger"

const log = createLogger("failure-predictor")

// ── Types ──────────────────────────────────────────────────────────────

export type RiskLevel = "low" | "medium" | "high" | "critical"

export interface SpawnRiskProfile {
  agentType: string
  /** Hour of day (0-23). Defaults to current hour */
  hour?: number
  /** Available CPU cores (optional, for resource-constrained detection) */
  cpu?: number
  /** Available memory in MB (optional, for resource-constrained detection) */
  memoryMB?: number
}

export interface SpawnRiskResult {
  /** Overall risk level */
  level: RiskLevel
  /** Numeric score 0-100 */
  score: number
  /** Human-readable explanation */
  reason: string
  /** Breakdown by factor */
  factors: Array<{
    name: string
    contribution: number // 0-100
    detail: string
  }>
}

// ── Internal patterns ─────────────────────────────────────────────────

/** Default risk score (0-100) for agent types with no historical data */
const DEFAULT_RISK_SCORE = 20

interface FailurePattern {
  agentType: string
  hourWeights: number[] // 24 entries, 0-1, higher = more risky at that hour
  totalSpawns: number
  totalFailures: number
  recentFailures: number // last 5 attempts
  avgMemoryMB: number
  avgCpu: number
}

// ── FailurePredictor ───────────────────────────────────────────────────

export class FailurePredictor {
  private static patterns = new Map<string, FailurePattern>()
  private static initialized = false

  /**
   * Initialize patterns from the experience store.
   * Call this once at startup, or let evaluateSpawnRisk lazy-init.
   */
  static async initialize(): Promise<void> {
    if (FailurePredictor.initialized) return

    try {
      const { experienceStore } = await import("../experience/store")
      const allExperiences = experienceStore.listRecent(500)

      const byType = new Map<string, {
        hours: number[]
        failures: number[]
        recentFailures: number
        totalMemory: number
        totalCpu: number
        count: number
      }>()

      for (const exp of allExperiences) {
        if (!byType.has(exp.agentType)) {
          byType.set(exp.agentType, {
            hours: new Array(24).fill(0),
            failures: [],
            recentFailures: 0,
            totalMemory: 0,
            totalCpu: 0,
            count: 0,
          })
        }

        const entry = byType.get(exp.agentType)!
        const startedAt = new Date(exp.startedAt)
        const hour = startedAt.getHours()

        entry.hours[hour] = (entry.hours[hour] ?? 0) + 1
        entry.count++

        if (exp.outcome === "failed") {
          entry.failures.push(1)
        } else {
          entry.failures.push(0)
        }

        // Parse metrics for resource usage
        try {
          const metrics = JSON.parse(exp.metrics || "{}")
          entry.totalMemory += metrics.memoryMB ?? 512
          entry.totalCpu += metrics.cpu ?? 2
        } catch {
          entry.totalMemory += 512
          entry.totalCpu += 2
        }
      }

      // Build weighted patterns
      for (const [agentType, data] of byType) {
        const failureCount = data.failures.filter(Boolean).length
        const hourWeights = data.hours.map(
          (count) => (data.count > 0 ? count / data.count : 0),
        )
        // Count recent failures (last 5)
        const recent5 = data.failures.slice(-5)

        FailurePredictor.patterns.set(agentType, {
          agentType,
          hourWeights,
          totalSpawns: data.count,
          totalFailures: failureCount,
          recentFailures: recent5.filter(Boolean).length,
          avgMemoryMB: data.count > 0 ? data.totalMemory / data.count : 512,
          avgCpu: data.count > 0 ? data.totalCpu / data.count : 2,
        })
      }

      FailurePredictor.initialized = true
      log.info(
        `Failure predictor initialized with ${FailurePredictor.patterns.size} agent type patterns`,
      )
    } catch (err) {
      log.warn(`Failure predictor init failed (non-fatal): ${err}`)
    }
  }

  /**
   * Evaluate the risk of spawning an agent of the given type.
   * Returns a risk assessment even without initialized data (uses defaults).
   */
  static evaluateSpawnRisk(profile: SpawnRiskProfile): SpawnRiskResult {
    const hour = profile.hour ?? new Date().getHours()

    const pattern = FailurePredictor.patterns.get(profile.agentType)
    const factors: SpawnRiskResult["factors"] = []

    // ── Factor 1: Historical failure rate ────────────────────────────
    let historicalScore = 0
    if (pattern) {
      const failureRate =
        pattern.totalSpawns > 0
          ? pattern.totalFailures / pattern.totalSpawns
          : 0
      historicalScore = Math.round(failureRate * 100)

      if (pattern.totalSpawns >= 5) {
        factors.push({
          name: "Historical failure rate",
          contribution: historicalScore,
          detail:
            `${pattern.totalFailures}/${pattern.totalSpawns} ` +
            `(${(failureRate * 100).toFixed(1)}%) failures for type "${profile.agentType}"`,
        })
      }
    } else {
      // No data — neutral score
      historicalScore = DEFAULT_RISK_SCORE
      factors.push({
        name: "Historical failure rate",
        contribution: DEFAULT_RISK_SCORE,
        detail: `No historical data for type "${profile.agentType}" — defaulting to low risk`,
      })
    }

    // ── Factor 2: Hour-of-day risk ──────────────────────────────────
    let hourScore = 0
    if (pattern && pattern.totalSpawns >= 10) {
      // Compare this hour's spawn count to the average
      const avgPerHour =
        pattern.totalSpawns / pattern.hourWeights.filter((w) => w > 0).length
      const thisHourCount = pattern.hourWeights[hour]! * pattern.totalSpawns
      // If this hour has significantly fewer spawns, it might be riskier
      // (agents avoid it, or it's a low-activity period)
      if (avgPerHour > 0 && thisHourCount < avgPerHour * 0.5) {
        hourScore = 20
        factors.push({
          name: "Hour-of-day anomaly",
          contribution: 20,
          detail:
            `Hour ${hour} has ${Math.round(thisHourCount)} spawns ` +
            `vs avg ${Math.round(avgPerHour)} — unusual activity period`,
        })
      }
    }

    // ── Factor 3: Recent failure streak ──────────────────────────────
    let streakScore = 0
    if (pattern && pattern.recentFailures >= 3) {
      streakScore = Math.min(100, pattern.recentFailures * 15)
      factors.push({
        name: "Recent failure streak",
        contribution: streakScore,
        detail: `${pattern.recentFailures} of last 5 attempts failed for "${profile.agentType}"`,
      })
    } else if (pattern && pattern.recentFailures >= 2) {
      streakScore = 20
      factors.push({
        name: "Recent failures",
        contribution: streakScore,
        detail: `${pattern.recentFailures} of last 5 attempts failed`,
      })
    }

    // ── Factor 4: Resource constraint ────────────────────────────────
    let resourceScore = 0
    if (profile.memoryMB && pattern && pattern.avgMemoryMB > 0) {
      const ratio = profile.memoryMB / pattern.avgMemoryMB
      if (ratio < 0.5) {
        resourceScore = 40
        factors.push({
          name: "Memory constraint",
          contribution: 40,
          detail:
            `Available memory ${profile.memoryMB}MB is ` +
            `${Math.round((1 - ratio) * 100)}% below average ` +
            `${Math.round(pattern.avgMemoryMB)}MB for "${profile.agentType}"`,
        })
      }
    }

    // ── Composite score ──────────────────────────────────────────────
    // Weighted: historical 40%, hour 15%, streak 30%, resources 15%
    const compositeScore = Math.round(
      historicalScore * 0.4 +
        hourScore * 0.15 +
        streakScore * 0.3 +
        resourceScore * 0.15,
    )

    const level =
      compositeScore >= 70
        ? "critical"
        : compositeScore >= 50
          ? "high"
          : compositeScore >= 30
            ? "medium"
            : "low"

    const reason = FailurePredictor.buildReason(level, compositeScore, profile.agentType, factors)

    return { level, score: compositeScore, reason, factors }
  }

  /**
   * Get the overall risk level for each registered agent type.
   * Useful for CLI display and dashboard.
   */
  static getAllRiskLevels(): Array<{
    agentType: string
    level: RiskLevel
    score: number
    spawns: number
    failures: number
    recentFailures: number
  }> {
    const results: Array<{
      agentType: string
      level: RiskLevel
      score: number
      spawns: number
      failures: number
      recentFailures: number
    }> = []

    for (const [agentType, pattern] of FailurePredictor.patterns) {
      const risk = FailurePredictor.evaluateSpawnRisk({ agentType })
      results.push({
        agentType,
        level: risk.level,
        score: risk.score,
        spawns: pattern.totalSpawns,
        failures: pattern.totalFailures,
        recentFailures: pattern.recentFailures,
      })
    }

    return results.sort((a, b) => b.score - a.score)
  }

  /** Clear all patterns and re-initialize (useful for testing). */
  static reset(): void {
    FailurePredictor.patterns.clear()
    FailurePredictor.initialized = false
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private static buildReason(
    level: RiskLevel,
    score: number,
    agentType: string,
    factors: SpawnRiskResult["factors"],
  ): string {
    const topFactors = factors
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 2)

    if (topFactors.length === 0) {
      return `No risk factors identified for "${agentType}"`
    }

    const factorSummary = topFactors
      .map((f) => `${f.name} (${f.contribution}%)`)
      .join(", ")

    return `Risk level "${level}" (${score}/100) for "${agentType}": ${factorSummary}`
  }
}

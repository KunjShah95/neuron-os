/**
 * src/harness/grader/composite.ts
 *
 * Composite scoring — combines individual grade results into a single score.
 *
 * Strategies:
 *   - weighted_average: Weighted sum of all grade scores
 *   - min: Take the minimum score (fail-fast, any single failure = fail)
 *   - geometric_mean: Geometric mean of all scores (penalizes low scores heavily)
 *
 * Thresholds: If any grade type falls below its threshold, the composite
 * score is capped at 0.4 (prevents passing with a single terrible grade).
 */

import type { GradeResult } from "../types"
import type { CompositeScoringConfig } from "./types"

// ── Default Config ──────────────────────────────────────────────

export const DEFAULT_COMPOSITE_CONFIG: CompositeScoringConfig = {
  defaultWeights: {
    deterministic: 0.3,
    llm: 0.5,
    code: 0.2,
  },
  thresholds: {
    deterministic: 0.5,
    llm: 0.3,
    code: 0.3,
  },
  strategy: "weighted_average",
}

// ── Composite Score Computation ─────────────────────────────────

/**
 * Compute the composite score from individual grade results.
 *
 * @param grades - All grade results from the grader suite
 * @param config - Composite scoring configuration
 * @returns The composite score 0.0–1.0
 */
export function computeCompositeScore(grades: GradeResult[], config?: Partial<CompositeScoringConfig>): number {
  const cfg = { ...DEFAULT_COMPOSITE_CONFIG, ...config }

  if (grades.length === 0) return 0.5 // Neutral score when no grades

  // Group grades by type
  const byType: Record<string, GradeResult[]> = {
    deterministic: [],
    llm: [],
    code: [],
    human: [],
  }

  for (const g of grades) {
    const bucket = byType[g.grader]
    if (bucket) {
      bucket.push(g)
    }
  }

  // Compute per-type average scores
  const typeAverages: Record<string, number> = {}
  for (const [type, typeGrades] of Object.entries(byType)) {
    if (typeGrades.length > 0) {
      const weightedSum = typeGrades.reduce((s, g) => s + g.score * g.weight, 0)
      const totalWeight = typeGrades.reduce((s, g) => s + g.weight, 0)
      typeAverages[type] = totalWeight > 0 ? weightedSum / totalWeight : 0
    }
  }

  // Check thresholds — if any type is below threshold, cap at 0.4
  let belowThreshold = false
  for (const [type, threshold] of Object.entries(cfg.thresholds)) {
    const avg = typeAverages[type]
    if (avg !== undefined && avg < threshold) {
      belowThreshold = true
      break
    }
  }

  // Compute composite score based on strategy
  let composite: number

  switch (cfg.strategy) {
    case "min": {
      // Take the minimum of all individual grade scores
      const minScore = Math.min(...grades.map((g) => g.score))
      composite = minScore
      break
    }

    case "geometric_mean": {
      // Geometric mean = (∏ scores)^(1/n)
      // Add small epsilon to avoid 0
      const nonZeroScores = grades.map((g) => Math.max(g.score, 0.001))
      const product = nonZeroScores.reduce((s, score) => s * score, 1)
      composite = Math.pow(product, 1 / nonZeroScores.length)
      break
    }

    case "weighted_average":
    default: {
      // Each grader TYPE carries the configured weight; that weight is distributed
      // across the grades of that type, then the types are combined.
      const typeWeights = computeTypeWeights(grades, cfg.defaultWeights)
      let weightedSum = 0
      let totalWeight = 0
      for (const [type, typeGrades] of Object.entries(byType)) {
        if (typeGrades.length === 0) continue
        const typeWeight = typeWeights[type] ?? 0
        if (typeWeight <= 0) continue
        const share = typeWeight / typeGrades.length
        for (const g of typeGrades) {
          weightedSum += g.score * share
          totalWeight += share
        }
      }
      composite = totalWeight > 0 ? weightedSum / totalWeight : grades.reduce((s, g) => s + g.score, 0) / grades.length
      break
    }
  }

  // Apply threshold cap
  if (belowThreshold) {
    composite = Math.min(composite, 0.4)
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, composite))
}

/**
 * Determine pass/fail based on composite score and optional passing threshold.
 */
export function isPassing(compositeScore: number, threshold: number = 0.6): boolean {
  return compositeScore >= threshold
}

/**
 * Weight per grader type taken from the configured default weights.
 * Types without a configured weight fall back to the sum of their own grade weights.
 */
export function computeTypeWeights(
  grades: GradeResult[],
  defaultWeights: CompositeScoringConfig["defaultWeights"],
): Record<string, number> {
  const ownWeights: Record<string, number[]> = {}
  for (const g of grades) {
    const bucket = ownWeights[g.grader] ?? (ownWeights[g.grader] = [])
    bucket.push(g.weight)
  }

  const weights: Record<string, number> = {}
  for (const [type, own] of Object.entries(ownWeights)) {
    const configured = defaultWeights[type as keyof CompositeScoringConfig["defaultWeights"]]
    if (typeof configured === "number") {
      weights[type] = configured
      continue
    }
    const ownTotal = own.reduce((s, w) => s + w, 0)
    weights[type] = ownTotal > 0 ? ownTotal : 1
  }
  return weights
}

/**
 * Normalize grade weights so they sum to a desired total.
 */
export function normalizeWeights(grades: GradeResult[], targetTotal: number = 1.0): GradeResult[] {
  const currentTotal = grades.reduce((s, g) => s + g.weight, 0)
  if (currentTotal === 0) return grades

  return grades.map((g) => ({
    ...g,
    weight: (g.weight / currentTotal) * targetTotal,
  }))
}

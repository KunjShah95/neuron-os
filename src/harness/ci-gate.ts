/**
 * src/harness/ci-gate.ts
 *
 * CIGate — automated quality gate for CI/CD pipelines.
 *
 * Compares eval results against a baseline, enforces thresholds,
 * and generates PR annotations. Supports pass@k for statistical rigor.
 */

import { writeFileSync, mkdirSync } from "node:fs"
import { dirname } from "node:path"
import type { EvalReport, BaselineComparison } from "./types"
import { BaselineManager } from "./baseline"

// ── Types ─────────────────────────────────────────────────────────

export interface CIGateConfig {
  /** Baseline model to compare against */
  baselineModel: string

  /** Suite name to run */
  suite: string

  /** Maximum allowed score drop (e.g. 0.05 = 5%) */
  regressionThreshold: number

  /** Minimum pass rate required (e.g. 0.85) */
  minPassRate: number

  /** Max critical regressions allowed */
  criticalFailThreshold: number

  /** Number of runs per test (for pass@k) */
  runCount: number

  /** Runs to warm up / discard */
  warmupCount: number

  /** Confidence level for statistical comparison (0.0–1.0) */
  confidenceLevel: number

  /** Path to write CI report */
  reportPath: string

  /** Whether to generate PR annotation text */
  annotatePR: boolean

  /** Action on regression */
  onRegression: "warn" | "block" | "auto-revert"

  /** Action on pass */
  onPass: "merge" | "notify" | "tag-baseline"
}

export interface CIGateResult {
  passed: boolean
  report: EvalReport
  comparison: BaselineComparison | null
  aggregatedScore: number
  passRate: number
  regressionsFound: number
  criticalRegressions: number
  summary: string
  prComment?: string
}

export const DEFAULT_CI_CONFIG: CIGateConfig = {
  baselineModel: "claude-sonnet-4-6",
  suite: "regression",
  regressionThreshold: 0.05,
  minPassRate: 0.85,
  criticalFailThreshold: 1,
  runCount: 1,
  warmupCount: 0,
  confidenceLevel: 0.95,
  reportPath: ".aegis/harness/ci-report.json",
  annotatePR: true,
  onRegression: "block",
  onPass: "notify",
}

// ── CI Gate ──────────────────────────────────────────────────────

export class CIGate {
  private baselineManager: BaselineManager
  private config: CIGateConfig

  constructor(baselineManager: BaselineManager, config?: Partial<CIGateConfig>) {
    this.baselineManager = baselineManager
    this.config = { ...DEFAULT_CI_CONFIG, ...config }
  }

  /**
   * Evaluate a completed eval run against the CI gate.
   * Optionally accepts multiple reports for pass@k aggregation.
   */
  async evaluate(reports: EvalReport[], existingBaselineId?: string): Promise<CIGateResult> {
    // 1. Aggregate across runs (pass@k)
    const aggregated = this.aggregateRuns(reports)

    // 2. Load baseline
    const baseline = existingBaselineId
      ? this.baselineManager.load(existingBaselineId)
      : this.baselineManager.loadLatest(this.config.baselineModel, this.config.suite)

    // 3. Compare to baseline
    const comparison = baseline ? this.baselineManager.compare(aggregated, baseline) : null

    // 4. Determine pass/fail
    const passRate = aggregated.totalTests > 0 ? aggregated.passed / aggregated.totalTests : 0
    const regressionsFound = comparison?.regressions.length ?? 0
    const criticalRegressions = comparison?.regressions.filter((r) => r.severity === "critical").length ?? 0

    let passed = true
    const failures: string[] = []

    // Check pass rate
    if (passRate < this.config.minPassRate) {
      passed = false
      failures.push(
        `Pass rate ${(passRate * 100).toFixed(1)}% below threshold ${(this.config.minPassRate * 100).toFixed(1)}%`,
      )
    }

    // Check regression threshold
    if (comparison && Math.abs(comparison.overallScoreDelta) > this.config.regressionThreshold) {
      passed = false
      failures.push(
        `Score drop ${Math.abs(comparison.overallScoreDelta).toFixed(3)} exceeds threshold ${this.config.regressionThreshold}`,
      )
    }

    // Check critical regressions
    if (criticalRegressions > this.config.criticalFailThreshold) {
      passed = false
      failures.push(`Critical regressions ${criticalRegressions} exceeds limit ${this.config.criticalFailThreshold}`)
    }

    // 5. Generate summary
    let summary: string
    if (passed) {
      summary = `✅ CI gate PASSED — ${(passRate * 100).toFixed(1)}% pass rate, ${regressionsFound} regression(s)`
    } else {
      summary = `❌ CI gate FAILED — ${failures.join("; ")}`
    }

    // 6. Generate PR comment
    let prComment: string | undefined
    if (this.config.annotatePR && comparison) {
      prComment = this.baselineManager.formatComparisonMarkdown(aggregated, comparison)
    }

    // 7. Write report
    const result: CIGateResult = {
      passed,
      report: aggregated,
      comparison,
      aggregatedScore: aggregated.avgScore,
      passRate,
      regressionsFound,
      criticalRegressions,
      summary,
      prComment,
    }

    this.writeReport(result)

    return result
  }

  /**
   * Aggregate multiple reports using pass@k approach.
   * For each test, it passes if it passed in at least one run.
   * Score is the max score across runs.
   */
  private aggregateRuns(reports: EvalReport[]): EvalReport {
    if (reports.length === 0) throw new Error("No reports to aggregate")
    if (reports.length === 1) return reports[0]!

    // Keep only post-warmup reports
    const validReports = reports.slice(this.config.warmupCount)
    if (validReports.length === 0) return reports[reports.length - 1]!

    const base = { ...validReports[0]! }
    const resultMap = new Map<string, (typeof base.results)[0]>()

    for (const report of validReports) {
      for (const result of report.results) {
        const existing = resultMap.get(result.test.id)
        if (!existing || result.score > existing.score) {
          resultMap.set(result.test.id, result)
        }
      }
    }

    base.results = Array.from(resultMap.values())
    base.totalTests = base.results.length
    base.passed = base.results.filter((r) => r.passed).length
    base.failed = base.totalTests - base.passed
    base.avgScore = base.totalTests > 0 ? base.results.reduce((s, r) => s + r.score, 0) / base.totalTests : 0
    base.totalCost = validReports.reduce((s, r) => s + r.totalCost, 0)

    // Recompute byCategory
    const categories = new Set(base.results.map((r) => r.test.category ?? "capability"))
    base.byCategory = {} as typeof base.byCategory
    for (const cat of categories) {
      const catResults = base.results.filter((r) => (r.test.category ?? "capability") === cat)
      const catPassed = catResults.filter((r) => r.passed)
      base.byCategory[cat as keyof typeof base.byCategory] = {
        total: catResults.length,
        passed: catPassed.length,
        avgScore: catResults.reduce((s, r) => s + r.score, 0) / catResults.length || 0,
      }
    }

    return base
  }

  private writeReport(result: CIGateResult): void {
    try {
      const dir = dirname(this.config.reportPath)
      mkdirSync(dir, { recursive: true })
      writeFileSync(this.config.reportPath, JSON.stringify(result, null, 2), "utf-8")
    } catch {
      // Report writing is non-fatal
    }
  }
}

/**
 * src/harness/baseline.ts
 *
 * BaselineManager — persistent storage for eval baselines, trend tracking,
 * and burn-rate analysis.
 *
 * Baselines are stored as JSON files in .aegis/baselines/<model>/.
 * Each baseline snapshots the full EvalReport for later comparison.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "node:fs"
import { resolve, join } from "node:path"
import { execSync } from "node:child_process"
import type { EvalReport, BaselineComparison, Regression } from "./types"

// ── Types ─────────────────────────────────────────────────────────

export interface Baseline {
  id: string
  model: string
  agentType: string
  suite: string
  timestamp: string
  commitSha: string
  report: EvalReport
  summary: {
    totalTests: number
    passed: number
    avgScore: number
    byCategory: Record<string, { total: number; passed: number; avgScore: number }>
    totalCost: number
    totalDurationMs: number
  }
  metadata: Record<string, unknown>
}

export interface ScoreTrend {
  timestamp: string
  score: number
  commitSha: string
}

export interface BurnRateReport {
  baselineScore: number
  currentScore: number
  totalDrop: number
  dropRate: number // Per day
  estimatedDaysToFailure: number
  budgetRemaining: number // Allowable drop before threshold
  threshold: number
}

export interface BaselineManagerConfig {
  storeDir: string
  maxBaselines: number
  autoSaveThreshold: number
}

export const DEFAULT_BASELINE_CONFIG: BaselineManagerConfig = {
  storeDir: resolve(process.cwd(), ".aegis", "baselines"),
  maxBaselines: 10,
  autoSaveThreshold: 0.7,
}

// ── Baseline Manager ─────────────────────────────────────────────

export class BaselineManager {
  private config: BaselineManagerConfig
  private cache: Map<string, Baseline[]> = new Map()

  constructor(config?: Partial<BaselineManagerConfig>) {
    this.config = { ...DEFAULT_BASELINE_CONFIG, ...config }
    mkdirSync(this.config.storeDir, { recursive: true })
  }

  /**
   * Save a report as a new baseline.
   */
  save(report: EvalReport, commitSha?: string): string {
    const sha = commitSha ?? this.captureGitSha()
    const model = report.model

    const baseline: Baseline = {
      id: `baseline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      model,
      agentType: report.agentType,
      suite: report.suite,
      timestamp: report.timestamp,
      commitSha: sha,
      report,
      summary: {
        totalTests: report.totalTests,
        passed: report.passed,
        avgScore: report.avgScore,
        byCategory: report.byCategory as Record<string, { total: number; passed: number; avgScore: number }>,
        totalCost: report.totalCost,
        totalDurationMs: report.totalDurationMs,
      },
      metadata: report.metadata,
    }

    this.writeBaseline(baseline)
    this.cache.delete(model)
    this.pruneOld(model)

    return baseline.id
  }

  /**
   * Load a specific baseline by ID.
   */
  load(id: string): Baseline | null {
    try {
      const dirs = this.listModelDirs()
      for (const dir of dirs) {
        const path = join(this.config.storeDir, dir, `${id}.json`)
        if (existsSync(path)) {
          return JSON.parse(readFileSync(path, "utf-8")) as Baseline
        }
      }
    } catch {
      // Not found
    }
    return null
  }

  /**
   * Load the latest baseline for a given model and suite.
   */
  loadLatest(model: string, suite?: string): Baseline | null {
    const baselines = this.list(model)
    const filtered = suite ? baselines.filter((b) => b.suite === suite) : baselines
    if (filtered.length === 0) return null
    // Return the most recent (sorted by filename timestamp)
    return filtered[filtered.length - 1]!
  }

  /**
   * List all baselines for a given model.
   */
  list(model?: string): Baseline[] {
    const cacheKey = model ?? "__all__"
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!
    }

    const baselines: Baseline[] = []
    const modelDirs = model ? [model] : this.listModelDirs()

    for (const m of modelDirs) {
      const modelDir = join(this.config.storeDir, m)
      if (!existsSync(modelDir)) continue
      try {
        const files = readdirSync(modelDir).filter((f) => f.endsWith(".json"))
        for (const file of files) {
          try {
            const data = readFileSync(join(modelDir, file), "utf-8")
            baselines.push(JSON.parse(data) as Baseline)
          } catch {
            // Skip corrupted files
          }
        }
      } catch {
        // Skip unreadable directories
      }
    }

    // Sort by timestamp ascending
    baselines.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    this.cache.set(cacheKey, baselines)
    return baselines
  }

  /**
   * Delete a baseline by ID.
   */
  delete(id: string): boolean {
    try {
      const dirs = this.listModelDirs()
      for (const dir of dirs) {
        const path = join(this.config.storeDir, dir, `${id}.json`)
        if (existsSync(path)) {
          unlinkSync(path)
          this.cache.delete(dir)
          return true
        }
      }
    } catch {
      // Not found
    }
    return false
  }

  /**
   * Compare a current report against a baseline.
   */
  compare(current: EvalReport, baseline: Baseline): BaselineComparison {
    const regressions: Regression[] = []
    const improvements: Regression[] = []

    for (const curResult of current.results) {
      const baseResult = baseline.report.results.find((r) => r.test.id === curResult.test.id)
      if (!baseResult) continue

      const delta = baseResult.score - curResult.score // positive = regression
      const absDelta = Math.abs(delta)

      const reg: Regression = {
        testId: curResult.test.id,
        testName: curResult.test.name,
        baselineScore: baseResult.score,
        currentScore: curResult.score,
        drop: delta,
        severity: absDelta >= 0.2 ? "critical" : absDelta >= 0.1 ? "major" : "minor",
      }

      if (delta > 0.01) {
        regressions.push(reg)
      } else if (delta < -0.01) {
        improvements.push(reg)
      }
    }

    // Sort by severity
    regressions.sort((a, b) => b.drop - a.drop)
    improvements.sort((a, b) => a.drop - b.drop)

    // Category deltas
    const categoryDeltas: Record<string, number> = {}
    const allCategories = new Set([...Object.keys(current.byCategory), ...Object.keys(baseline.report.byCategory)])
    for (const cat of allCategories) {
      const cur = current.byCategory[cat as keyof typeof current.byCategory]
      const base = baseline.report.byCategory[cat as keyof typeof baseline.report.byCategory]
      categoryDeltas[cat] = (cur?.avgScore ?? 0) - (base?.avgScore ?? 0)
    }

    return {
      baselineId: baseline.id,
      baselineDate: baseline.timestamp,
      overallScoreDelta: current.avgScore - baseline.report.avgScore,
      categoryDeltas,
      regressions,
      improvements,
    }
  }

  /**
   * Get score trend for a model over time.
   */
  getTrend(model: string, suite: string, days: number): ScoreTrend[] {
    const baselines = this.list(model).filter((b) => b.suite === suite)
    const cutoff = Date.now() - days * 86400000

    return baselines
      .filter((b) => new Date(b.timestamp).getTime() >= cutoff)
      .map((b) => ({
        timestamp: b.timestamp,
        score: b.summary.avgScore,
        commitSha: b.commitSha,
      }))
  }

  /**
   * Calculate burn rate: how fast is the score dropping?
   */
  getBurnRate(model: string, suite: string, threshold: number = 0.1): BurnRateReport | null {
    const baselines = this.list(model).filter((b) => b.suite === suite)
    if (baselines.length < 2) return null

    const latest = baselines[baselines.length - 1]!
    const first = baselines[0]!

    const totalDrop = first.summary.avgScore - latest.summary.avgScore
    const daysElapsed = (new Date(latest.timestamp).getTime() - new Date(first.timestamp).getTime()) / 86400000
    const dropRate = daysElapsed > 0 ? totalDrop / daysElapsed : 0
    const budgetRemaining = Math.max(0, threshold - totalDrop)
    const estimatedDaysToFailure = dropRate > 0 ? budgetRemaining / dropRate : Infinity

    return {
      baselineScore: first.summary.avgScore,
      currentScore: latest.summary.avgScore,
      totalDrop,
      dropRate,
      estimatedDaysToFailure: estimatedDaysToFailure === Infinity ? -1 : Math.round(estimatedDaysToFailure),
      budgetRemaining,
      threshold,
    }
  }

  /**
   * Generate a markdown comparison for PR comments.
   */
  formatComparisonMarkdown(current: EvalReport, comparison: BaselineComparison): string {
    const regs = comparison.regressions
    const imps = comparison.improvements
    const scoreDelta = comparison.overallScoreDelta
    const passRate = current.totalTests > 0 ? ((current.passed / current.totalTests) * 100).toFixed(1) : "0.0"

    let md = `## 🤖 Agent Eval Results\n\n`
    md += `| Metric | Current | Baseline | Δ |\n`
    md += `|--------|---------|----------|---|\n`
    md += `| Pass rate | ${passRate}% | — | — |\n`
    md += `| Avg score | ${current.avgScore.toFixed(2)} | ${comparison.baselineDate} | ${scoreDelta >= 0 ? "🟢" : "🔴"} ${scoreDelta >= 0 ? "+" : ""}${scoreDelta.toFixed(2)} |\n`
    md += `| Regressions | ${regs.length} | — | — |\n`
    md += `| Total cost | $${current.totalCost.toFixed(2)} | — | — |\n\n`

    if (regs.length > 0) {
      md += `### ⚠ Regressions (${regs.length})\n\n`
      md += `| Test | Before | After | Drop |\n`
      md += `|------|--------|-------|------|\n`
      for (const r of regs.slice(0, 10)) {
        const icon = r.severity === "critical" ? "🔴" : r.severity === "major" ? "🟡" : "🟢"
        md += `| ${r.testName} | ${r.baselineScore.toFixed(2)} | ${r.currentScore.toFixed(2)} | ${r.drop.toFixed(2)} ${icon} |\n`
      }
      if (regs.length > 10) {
        md += `| … and ${regs.length - 10} more | | | |\n`
      }
      md += "\n"
    }

    if (imps.length > 0) {
      md += `### ✅ Improvements (${imps.length})\n\n`
      md += `| Test | Before | After | Gain |\n`
      md += `|------|--------|-------|------|\n`
      for (const r of imps.slice(0, 5)) {
        md += `| ${r.testName} | ${r.baselineScore.toFixed(2)} | ${r.currentScore.toFixed(2)} | ${Math.abs(r.drop).toFixed(2)} 🟢 |\n`
      }
      md += "\n"
    }

    md += `Gate: ${regs.length > 0 ? "❌ BLOCKED" : "✅ PASSED"} — ${regs.length} regression(s) detected\n`

    return md
  }

  // ── Private ──────────────────────────────────────────────────

  private writeBaseline(baseline: Baseline): void {
    const modelDir = join(this.config.storeDir, baseline.model)
    mkdirSync(modelDir, { recursive: true })
    const path = join(modelDir, `${baseline.id}.json`)
    writeFileSync(path, JSON.stringify(baseline, null, 2), "utf-8")
  }

  private listModelDirs(): string[] {
    try {
      return readdirSync(this.config.storeDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
    } catch {
      return []
    }
  }

  private pruneOld(model: string): void {
    const baselines = this.list(model)
    if (baselines.length <= this.config.maxBaselines) return

    const sorted = baselines.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const toRemove = sorted.slice(this.config.maxBaselines)

    for (const b of toRemove) {
      this.delete(b.id)
    }
  }

  private captureGitSha(): string {
    try {
      return execSync("git rev-parse HEAD", { encoding: "utf-8", timeout: 3000 }).toString().trim().slice(0, 12)
    } catch {
      return "unknown"
    }
  }
}

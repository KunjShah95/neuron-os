/**
 * src/harness/reporter-comparison.ts
 *
 * ComparisonReportGenerator — detailed analysis of performance changes
 * between two eval runs, with per-test regression/improvement detection.
 */

import type { EvalReport, Regression } from "./types"

// ── Types ─────────────────────────────────────────────────────────

export interface ComparisonReport {
  scoreDelta: number
  passRateDelta: number
  costDelta: number
  categoryDeltas: Record<string, number>
  regressions: Regression[]
  improvements: Regression[]
  newTests: Array<{ id: string; name: string; score: number }>
  removedTests: Array<{ id: string; name: string; score: number }>
  summary: string
}

// ── Comparison Report Generator ──────────────────────────────────

export class ComparisonReportGenerator {
  /**
   * Generate a detailed comparison between current and baseline reports.
   */
  generate(current: EvalReport, baseline: EvalReport): ComparisonReport {
    const currentPassRate = current.totalTests > 0 ? current.passed / current.totalTests : 0
    const baselinePassRate = baseline.totalTests > 0 ? baseline.passed / baseline.totalTests : 0

    const regressions: Regression[] = []
    const improvements: Regression[] = []

    for (const curResult of current.results) {
      const baseResult = baseline.results.find((r) => r.test.id === curResult.test.id)
      if (!baseResult) continue

      const delta = baseResult.score - curResult.score
      const absDelta = Math.abs(delta)

      const reg: Regression = {
        testId: curResult.test.id,
        testName: curResult.test.name,
        baselineScore: baseResult.score,
        currentScore: curResult.score,
        drop: delta,
        severity: absDelta >= 0.2 ? "critical" : absDelta >= 0.1 ? "major" : "minor",
      }

      if (delta > 0.005) {
        regressions.push(reg)
      } else if (delta < -0.005) {
        improvements.push(reg)
      }
    }

    regressions.sort((a, b) => b.drop - a.drop)
    improvements.sort((a, b) => Math.abs(b.drop) - Math.abs(a.drop))

    // Category deltas
    const categoryDeltas: Record<string, number> = {}
    const allCategories = new Set([
      ...Object.keys(current.byCategory),
      ...Object.keys(baseline.byCategory),
    ])
    for (const cat of allCategories) {
      const cur = current.byCategory[cat as keyof typeof current.byCategory]
      const base = baseline.byCategory[cat as keyof typeof baseline.byCategory]
      categoryDeltas[cat] = (cur?.avgScore ?? 0) - (base?.avgScore ?? 0)
    }

    // New and removed tests
    const newTests = current.results
      .filter((r) => !baseline.results.find((br) => br.test.id === r.test.id))
      .map((r) => ({ id: r.test.id, name: r.test.name, score: r.score }))

    const removedTests = baseline.results
      .filter((r) => !current.results.find((cr) => cr.test.id === r.test.id))
      .map((r) => ({ id: r.test.id, name: r.test.name, score: r.score }))

    const scoreDelta = current.avgScore - baseline.avgScore
    const passRateDelta = currentPassRate - baselinePassRate
    const costDelta = current.totalCost - baseline.totalCost

    const summary = this.buildSummary({
      scoreDelta, passRateDelta, costDelta, regressions, improvements, newTests, removedTests,
    } as ComparisonReport)

    return {
      scoreDelta,
      passRateDelta,
      costDelta,
      categoryDeltas,
      regressions,
      improvements,
      newTests,
      removedTests,
      summary,
    }
  }

  /**
   * Generate an HTML report for the comparison.
   */
  generateHtml(current: EvalReport, comparison: ComparisonReport): string {
    const scoreIcon = comparison.scoreDelta >= 0 ? "🟢" : "🔴"
    const scoreSign = comparison.scoreDelta >= 0 ? "+" : ""

    const regRows = comparison.regressions.slice(0, 20).map((r) => {
      const icon = r.severity === "critical" ? "🔴" : r.severity === "major" ? "🟡" : "🟢"
      return `<tr class="reg-${r.severity}">
        <td>${this.escape(r.testName)}</td>
        <td>${r.baselineScore.toFixed(2)}</td>
        <td>${r.currentScore.toFixed(2)}</td>
        <td>${r.drop.toFixed(2)} ${icon}</td>
      </tr>`
    }).join("\n")

    const impRows = comparison.improvements.slice(0, 10).map((r) =>
      `<tr>
        <td>${this.escape(r.testName)}</td>
        <td>${r.baselineScore.toFixed(2)}</td>
        <td>${r.currentScore.toFixed(2)}</td>
        <td>${Math.abs(r.drop).toFixed(2)} 🟢</td>
      </tr>`
    ).join("\n")

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Evaluation Comparison</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e4e4e7; padding: 40px; }
    h1 { font-size: 24px; color: #fff; }
    .meta { color: #a1a1aa; font-size: 14px; margin-bottom: 24px; }
    .summary { font-size: 16px; margin-bottom: 24px; padding: 16px; background: #18181b; border: 1px solid #27272a; border-radius: 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; }
    .card .value { font-size: 24px; font-weight: 700; }
    .card .label { font-size: 12px; color: #a1a1aa; text-transform: uppercase; margin-top: 4px; }
    .positive { color: #22c55e; }
    .negative { color: #ef4444; }
    h2 { font-size: 18px; margin: 24px 0 12px; color: #fff; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px 12px; background: #18181b; border-bottom: 2px solid #27272a; color: #a1a1aa; font-size: 12px; text-transform: uppercase; }
    td { padding: 8px 12px; border-bottom: 1px solid #27272a; font-size: 14px; }
    .reg-critical td:first-child { color: #ef4444; }
    .reg-major td:first-child { color: #f59e0b; }
    .reg-minor td:first-child { color: #22c55e; }
  </style>
</head>
<body>
  <h1>📊 Evaluation Comparison</h1>
  <div class="meta">${current.timestamp} vs baseline</div>

  <div class="grid">
    <div class="card">
      <div class="value ${comparison.scoreDelta >= 0 ? 'positive' : 'negative'}">${scoreSign}${comparison.scoreDelta.toFixed(3)}</div>
      <div class="label">Score Delta ${scoreIcon}</div>
    </div>
    <div class="card">
      <div class="value ${comparison.passRateDelta >= 0 ? 'positive' : 'negative'}">${(comparison.passRateDelta >= 0 ? '+' : '')}${(comparison.passRateDelta * 100).toFixed(1)}%</div>
      <div class="label">Pass Rate Delta</div>
    </div>
    <div class="card">
      <div class="value ${comparison.costDelta <= 0 ? 'positive' : 'negative'}">${(comparison.costDelta >= 0 ? '+' : '')}$${comparison.costDelta.toFixed(2)}</div>
      <div class="label">Cost Delta</div>
    </div>
  </div>

  <div class="summary">${comparison.summary}</div>

  ${comparison.regressions.length > 0 ? `
  <h2>⚠ Regressions (${comparison.regressions.length})</h2>
  <table><tr><th>Test</th><th>Before</th><th>After</th><th>Drop</th></tr>
  ${regRows}
  </table>` : ""}

  ${comparison.improvements.length > 0 ? `
  <h2>✅ Improvements (${comparison.improvements.length})</h2>
  <table><tr><th>Test</th><th>Before</th><th>After</th><th>Gain</th></tr>
  ${impRows}
  </table>` : ""}

  ${comparison.newTests.length > 0 ? `<h2>🆕 New Tests (${comparison.newTests.length})</h2><p>${comparison.newTests.map(t => t.name).join(", ")}</p>` : ""}
  ${comparison.removedTests.length > 0 ? `<h2>🗑 Removed Tests (${comparison.removedTests.length})</h2><p>${comparison.removedTests.map(t => t.name).join(", ")}</p>` : ""}
</body>
</html>`
  }

  private buildSummary(comparison: ComparisonReport): string {
    const parts: string[] = []
    if (comparison.scoreDelta >= 0) {
      parts.push(`Score improved by ${comparison.scoreDelta.toFixed(3)}`)
    } else {
      parts.push(`Score dropped by ${Math.abs(comparison.scoreDelta).toFixed(3)}`)
    }
    if (comparison.regressions.length > 0) {
      parts.push(`${comparison.regressions.length} regression(s) detected`)
    }
    if (comparison.improvements.length > 0) {
      parts.push(`${comparison.improvements.length} improvement(s) detected`)
    }
    if (comparison.newTests.length > 0) {
      parts.push(`${comparison.newTests.length} new test(s) added`)
    }
    if (comparison.removedTests.length > 0) {
      parts.push(`${comparison.removedTests.length} test(s) removed`)
    }
    return parts.join(" | ")
  }

  private escape(str: string): string {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }
}

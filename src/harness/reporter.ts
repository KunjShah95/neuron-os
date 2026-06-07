import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import type { EvalResult, EvalReport, TestCategory } from "./types"

const REPORT_DIR = resolve(process.cwd(), ".aegis/harness")

function ensureDir(): void {
  mkdirSync(REPORT_DIR, { recursive: true })
}

// ── Report Generation ───────────────────────────────────────────

export function generateReport(
  results: EvalResult[],
  suite: string = "default",
): EvalReport {
  const passed = results.filter(r => r.passed)
  const failed = results.filter(r => !r.passed)
  const total = results.length

  // Compute by-category breakdown
  const categories = new Set(results.map(r => r.test.category ?? "capability"))
  const byCategory = {} as Record<TestCategory, { total: number; passed: number; avgScore: number }>

  for (const cat of categories as Set<string>) {
    const catResults = results.filter(r => (r.test.category ?? "capability") === cat)
    const catPassed = catResults.filter(r => r.passed)
    byCategory[cat as TestCategory] = {
      total: catResults.length,
      passed: catPassed.length,
      avgScore: catResults.reduce((s, r) => s + r.score, 0) / catResults.length || 0,
    }
  }

  return {
    id: `report-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    model: results[0]?.model ?? "unknown",
    agentType: results[0]?.agentType ?? "harness",
    suite,
    totalTests: total,
    passed: passed.length,
    failed: failed.length,
    avgScore: total > 0 ? results.reduce((s, r) => s + r.score, 0) / total : 0,
    totalCost: results.reduce((s, r) => s + r.totalCost, 0),
    totalDurationMs: results.reduce((s, r) => s + r.durationMs, 0),
    results,
    byCategory,
    regressions: [],
    metadata: {},
  }
}

// ── JSON Report ─────────────────────────────────────────────────

export function generateJsonReport(results: EvalResult[]): string {
  const report = generateReport(results)
  return JSON.stringify(report, null, 2)
}

// ── Markdown Report ─────────────────────────────────────────────

export function generateMarkdownReport(results: EvalResult[]): string {
  const report = generateReport(results)
  const passed = results.filter(r => r.passed)
  const failed = results.filter(r => !r.passed)
  const total = results.length

  let md = `# Harness Report\n\n`
  md += `**Date:** ${report.timestamp}\n`
  md += `**Suite:** ${report.suite}\n`
  md += `**Model:** ${report.model}\n\n`

  md += `## Summary\n\n`
  md += `| Metric | Value |\n`
  md += `|--------|-------|\n`
  md += `| Total | ${total} |\n`
  md += `| Passed | ${passed.length} |\n`
  md += `| Failed | ${failed.length} |\n`
  md += `| Avg Score | ${report.avgScore.toFixed(2)} |\n`
  md += `| Total Cost | $${report.totalCost.toFixed(2)} |\n`
  md += `| Duration | ${report.totalDurationMs}ms |\n\n`

  // Category breakdown
  if (Object.keys(report.byCategory).length > 0) {
    md += `## Categories\n\n`
    md += `| Category | Total | Passed | Avg Score |\n`
    md += `|----------|-------|--------|-----------|\n`
    for (const [cat, stats] of Object.entries(report.byCategory)) {
      md += `| ${cat} | ${stats.total} | ${stats.passed} | ${stats.avgScore.toFixed(2)} |\n`
    }
    md += "\n"
  }

  // Failures
  if (failed.length > 0) {
    md += `## Failures\n\n`
    for (const r of failed) {
      md += `### ❌ ${r.test.name}\n\n`
      md += `- **ID:** ${r.test.id}\n`
      md += `- **Error:** ${r.error || "No error"}\n`
      md += `- **Score:** ${r.score.toFixed(2)}\n`
      md += `- **Steps:** ${r.steps}\n`
      md += `- **Duration:** ${r.durationMs}ms\n`
      md += `- **Cost:** $${r.totalCost.toFixed(4)}\n\n`

      if (r.trace.length > 0) {
        md += `**Tool Calls:**\n\n`
        for (const t of r.trace) {
          md += `- \`${t.name}\`: ${t.durationMs}ms\n`
        }
        md += "\n"
      }
    }
  }

  // Passed summary
  if (passed.length > 0) {
    md += `## Passed\n\n`
    for (const r of passed) {
      md += `- ✅ ${r.test.name} (${r.durationMs}ms, ${r.steps} steps)\n`
    }
    md += "\n"
  }

  return md
}

// ── HTML Report ─────────────────────────────────────────────────

export function generateHtmlReport(results: EvalResult[]): string {
  const report = generateReport(results)
  const passed = results.filter(r => r.passed)
  const failed = results.filter(r => !r.passed)

  const passRate = report.totalTests > 0
    ? ((report.passed / report.totalTests) * 100).toFixed(1)
    : "0.0"

  const failureRows = failed.map(r => `
    <tr class="failure-row">
      <td>${escapeHtml(r.test.name)}</td>
      <td>${r.error ? escapeHtml(r.error) : "Unknown"}</td>
      <td>${r.steps}</td>
      <td>${r.durationMs}ms</td>
      <td>$${r.totalCost.toFixed(4)}</td>
    </tr>`).join("\n")

  const passedRows = passed.map(r => `
    <tr class="passed-row">
      <td>${escapeHtml(r.test.name)}</td>
      <td>${r.durationMs}ms</td>
      <td>${r.steps} steps</td>
      <td>$${r.totalCost.toFixed(4)}</td>
    </tr>`).join("\n")

  const categoryRows = Object.entries(report.byCategory).map(([cat, stats]) => `
    <tr>
      <td>${escapeHtml(cat)}</td>
      <td>${stats.total}</td>
      <td>${stats.passed}</td>
      <td>${stats.avgScore.toFixed(2)}</td>
    </tr>`).join("\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Harness Report - ${escapeHtml(report.suite)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e4e4e7; padding: 40px; }
    h1 { font-size: 24px; margin-bottom: 8px; color: #fff; }
    .meta { color: #a1a1aa; font-size: 14px; margin-bottom: 24px; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 32px; }
    .stat-card { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; }
    .stat-card .value { font-size: 28px; font-weight: 700; color: #fff; }
    .stat-card .label { font-size: 12px; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 4px; }
    .stat-card.pass .value { color: #22c55e; }
    .stat-card.fail .value { color: #ef4444; }
    .stat-card.warn .value { color: #f59e0b; }
    h2 { font-size: 18px; margin: 24px 0 12px; color: #fff; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { text-align: left; padding: 8px 12px; background: #18181b; border-bottom: 2px solid #27272a; color: #a1a1aa; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
    td { padding: 8px 12px; border-bottom: 1px solid #27272a; font-size: 14px; }
    .failure-row td:first-child { color: #ef4444; }
    .passed-row td:first-child { color: #22c55e; }
    .section { background: #18181b; border: 1px solid #27272a; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .badge-pass { background: rgba(34,197,94,0.15); color: #22c55e; }
    .badge-fail { background: rgba(239,68,68,0.15); color: #ef4444; }
  </style>
</head>
<body>
  <h1>🧪 ${escapeHtml(report.suite)}</h1>
  <div class="meta">${report.timestamp} &middot; ${report.model} &middot; ${report.agentType}</div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="value">${report.totalTests}</div>
      <div class="label">Total Tests</div>
    </div>
    <div class="stat-card pass">
      <div class="value">${report.passed}</div>
      <div class="label">Passed</div>
    </div>
    <div class="stat-card fail">
      <div class="value">${report.failed}</div>
      <div class="label">Failed</div>
    </div>
    <div class="stat-card warn">
      <div class="value">${passRate}%</div>
      <div class="label">Pass Rate</div>
    </div>
    <div class="stat-card">
      <div class="value">$${report.totalCost.toFixed(2)}</div>
      <div class="label">Cost</div>
    </div>
    <div class="stat-card">
      <div class="value">${(report.totalDurationMs / 1000).toFixed(1)}s</div>
      <div class="label">Duration</div>
    </div>
  </div>

  ${Object.keys(report.byCategory).length > 0 ? `
  <h2>Categories</h2>
  <table>
    <tr><th>Category</th><th>Total</th><th>Passed</th><th>Avg Score</th></tr>
    ${categoryRows}
  </table>` : ""}

  ${failed.length > 0 ? `
  <h2>Failures (${failed.length})</h2>
  <table>
    <tr><th>Test</th><th>Error</th><th>Steps</th><th>Duration</th><th>Cost</th></tr>
    ${failureRows}
  </table>` : ""}

  ${passed.length > 0 ? `
  <h2>Passed (${passed.length})</h2>
  <div class="section">
    <table>
      <tr><th>Test</th><th>Duration</th><th>Steps</th><th>Cost</th></tr>
      ${passedRows}
    </table>
  </div>` : ""}
</body>
</html>`
}

// ── Streaming ───────────────────────────────────────────────────

export function streamResult(result: EvalResult): string {
  return JSON.stringify({
    event: "test_result",
    testId: result.test.id,
    name: result.test.name,
    passed: result.passed,
    score: result.score,
    durationMs: result.durationMs,
    error: result.error ?? null,
  }) + "\n"
}

// ── File Writing ────────────────────────────────────────────────

export function writeReports(results: EvalResult[]): void {
  ensureDir()

  writeFileSync(
    resolve(REPORT_DIR, "harness-report.json"),
    generateJsonReport(results),
    "utf-8",
  )
  writeFileSync(
    resolve(REPORT_DIR, "harness-report.md"),
    generateMarkdownReport(results),
    "utf-8",
  )
  writeFileSync(
    resolve(REPORT_DIR, "harness-report.html"),
    generateHtmlReport(results),
    "utf-8",
  )
}

export function writeReport(report: EvalReport, outputDir?: string): void {
  const dir = outputDir ?? REPORT_DIR
  mkdirSync(dir, { recursive: true })

  writeFileSync(resolve(dir, "report.json"), JSON.stringify(report, null, 2), "utf-8")
}

// ── Helper ──────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

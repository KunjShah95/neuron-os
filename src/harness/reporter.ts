import type { EvalResult } from "./types"
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"

const REPORT_DIR = resolve(process.cwd(), ".aegis/harness")

function ensureDir() {
  mkdirSync(REPORT_DIR, { recursive: true })
}

export function generateJsonReport(results: EvalResult[]): string {
  const report = {
    timestamp: new Date().toISOString(),
    total: results.length,
    passed: results.filter(r => r.passed).length,
    failed: results.filter(r => !r.passed).length,
    results: results.map(r => ({
      name: r.test.name,
      passed: r.passed,
      steps: r.steps,
      durationMs: r.durationMs,
      error: r.error,
      trace: r.trace,
    })),
  }
  return JSON.stringify(report, null, 2)
}

export function generateMarkdownReport(results: EvalResult[]): string {
  const passed = results.filter(r => r.passed)
  const failed = results.filter(r => !r.passed)
  const total = results.length

  let md = `# Harness Report\n\n`
  md += `**Date:** ${new Date().toISOString()}\n\n`
  md += `## Summary\n\n`
  md += `| Metric | Value |\n|--------|-------|\n`
  md += `| Total | ${total} |\n`
  md += `| Passed | ${passed.length} |\n`
  md += `| Failed | ${failed.length} |\n\n`

  if (failed.length > 0) {
    md += `## Failures\n\n`
    for (const r of failed) {
      md += `### ${r.test.name}\n\n`
      md += `- Error: ${r.error || "No error"}\n`
      md += `- Steps: ${r.steps}\n`
      md += `- Duration: ${r.durationMs}ms\n\n`
      if (r.trace.length > 0) {
        for (const t of r.trace) {
          md += `- \`${t.name}\`: ${t.durationMs}ms\n`
        }
      }
      md += "\n"
    }
  }

  return md
}

export function writeReports(results: EvalResult[]): void {
  ensureDir()
  writeFileSync(resolve(REPORT_DIR, "harness-report.json"), generateJsonReport(results), "utf-8")
  writeFileSync(resolve(REPORT_DIR, "harness-report.md"), generateMarkdownReport(results), "utf-8")
}

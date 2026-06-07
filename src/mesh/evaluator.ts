/**
 * mesh/evaluator — Automated task completion evaluator.
 *
 * Measures whether an agent's output meets the success criteria.
 * Runs evaluation scripts, checks test results, and produces a
 * quantitative score. This enables the continuous improvement loop:
 * track pass rate over time, detect regressions, prioritize fixes.
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import type { EvaluationCriteria, EvaluationMetric } from "./types"

// ── Types ─────────────────────────────────────────────────────────────

export interface EvaluationResult {
  metric: EvaluationMetric
  passed: boolean
  score: number // 0.0 – 1.0
  output: string
  durationMs: number
  details?: string
}

export interface TaskEvaluation {
  taskId: string
  goal: string
  results: EvaluationResult[]
  overallPass: boolean
  overallScore: number
  summary: string
}

// ── Evaluator ─────────────────────────────────────────────────────────

export class Evaluator {
  private cwd: string

  constructor(cwd?: string) {
    this.cwd = cwd || process.cwd()
  }

  /**
   * Evaluate a completed task against a set of criteria.
   */
  async evaluate(
    taskId: string,
    goal: string,
    criteria: EvaluationCriteria[],
    _outputDir?: string,
  ): Promise<TaskEvaluation> {
    const results: EvaluationResult[] = []

    for (const criterion of criteria) {
      try {
        const result = await this.runEvaluation(criterion)
        results.push(result)
      } catch (err: any) {
        results.push({
          metric: criterion.metric,
          passed: false,
          score: 0,
          output: `Evaluation error: ${err.message}`,
          durationMs: 0,
        })
      }
    }

    const passedCount = results.filter((r) => r.passed).length
    const overallScore = results.length > 0 ? results.reduce((s, r) => s + r.score, 0) / results.length : 0

    return {
      taskId,
      goal,
      results,
      overallPass: passedCount === results.length,
      overallScore: Math.round(overallScore * 100) / 100,
      summary: this.formatSummary(passedCount, results.length, overallScore),
    }
  }

  /**
   * Quick evaluation — just run a single script and check exit code.
   */
  async quickEval(taskId: string, goal: string, script: string): Promise<TaskEvaluation> {
    return this.evaluate(taskId, goal, [{ metric: "custom-script", script }])
  }

  private async runEvaluation(criterion: EvaluationCriteria): Promise<EvaluationResult> {
    const startTime = Date.now()

    switch (criterion.metric) {
      case "tests-pass":
        return this.evalTests(startTime)
      case "lint-clean":
        return this.evalLint(startTime)
      case "typecheck":
        return this.evalTypecheck(startTime)
      case "build":
        return this.evalBuild(startTime)
      case "custom-script":
        return this.evalCustomScript(criterion.script, criterion.maxRetries, startTime)
      case "manual":
        return this.evalManual(startTime)
      default:
        return {
          metric: criterion.metric,
          passed: false,
          score: 0,
          output: `Unknown metric: ${criterion.metric}`,
          durationMs: Date.now() - startTime,
        }
    }
  }

  private async evalTests(startTime: number): Promise<EvaluationResult> {
    try {
      const cmd = "npm test 2>&1 || bun test 2>&1"
      const output = execSync(cmd, { cwd: this.cwd, encoding: "utf8", timeout: 120_000 })
      const passed = !output.includes("FAIL") && !output.includes("failed")
      const durationMs = Date.now() - startTime

      const passMatch = output.match(/(\d+)\s+pass/)
      const failMatch = output.match(/(\d+)\s+fail/)
      const passCount = passMatch ? parseInt(passMatch[1]!, 10) : 0
      const failCount = failMatch ? parseInt(failMatch[1]!, 10) : 0
      const total = passCount + failCount
      const score = total > 0 ? passCount / total : passed ? 1 : 0

      return {
        metric: "tests-pass",
        passed,
        score,
        output: output.slice(0, 500),
        durationMs,
        details: `${passCount} pass, ${failCount} fail`,
      }
    } catch (err: any) {
      return {
        metric: "tests-pass",
        passed: false,
        score: 0,
        output: err.stderr?.slice(0, 500) || err.message,
        durationMs: Date.now() - startTime,
      }
    }
  }

  private async evalLint(startTime: number): Promise<EvaluationResult> {
    try {
      const cmd = existsSync(this.cwd + "/node_modules/.bin/eslint")
        ? "npx eslint src --max-warnings 0 2>&1"
        : "echo 'No linter configured'"
      const output = execSync(cmd, { cwd: this.cwd, encoding: "utf8", timeout: 60_000 })
      const passed = !output.toLowerCase().includes("error") && !output.toLowerCase().includes("warning")
      return {
        metric: "lint-clean",
        passed,
        score: passed ? 1 : 0.5,
        output: output.slice(0, 500),
        durationMs: Date.now() - startTime,
      }
    } catch (err: any) {
      const output = err.stderr?.slice(0, 500) || err.stdout?.slice(0, 500) || err.message
      const errorCount = (output.match(/(\d+)\s+error/) || [])[1]
      const warningCount = (output.match(/(\d+)\s+warning/) || [])[1]
      const score = errorCount
        ? Math.max(0, 1 - parseInt(errorCount) * 0.2)
        : warningCount
          ? Math.max(0, 1 - parseInt(warningCount) * 0.1)
          : 0
      return {
        metric: "lint-clean",
        passed: false,
        score,
        output,
        durationMs: Date.now() - startTime,
      }
    }
  }

  private async evalTypecheck(startTime: number): Promise<EvaluationResult> {
    try {
      const cmd = "bun run --bun tsc --noEmit 2>&1"
      const output = execSync(cmd, { cwd: this.cwd, encoding: "utf8", timeout: 120_000 })
      const passed = !output.includes("error TS")
      return {
        metric: "typecheck",
        passed,
        score: passed ? 1 : 0,
        output: output.slice(0, 500),
        durationMs: Date.now() - startTime,
      }
    } catch (err: any) {
      const output = err.stdout?.slice(0, 500) || err.stderr?.slice(0, 500) || err.message
      return {
        metric: "typecheck",
        passed: false,
        score: 0,
        output,
        durationMs: Date.now() - startTime,
      }
    }
  }

  private async evalBuild(startTime: number): Promise<EvaluationResult> {
    try {
      const cmd = "bun run build 2>&1"
      const output = execSync(cmd, { cwd: this.cwd, encoding: "utf8", timeout: 120_000 })
      return {
        metric: "build",
        passed: true,
        score: 1,
        output: output.slice(0, 500),
        durationMs: Date.now() - startTime,
      }
    } catch (err: any) {
      return {
        metric: "build",
        passed: false,
        score: 0,
        output: err.stderr?.slice(0, 500) || err.message,
        durationMs: Date.now() - startTime,
      }
    }
  }

  private async evalCustomScript(
    script: string | undefined,
    maxRetries: number | undefined,
    startTime: number,
  ): Promise<EvaluationResult> {
    if (!script) {
      return {
        metric: "custom-script",
        passed: false,
        score: 0,
        output: "No script provided",
        durationMs: Date.now() - startTime,
      }
    }

    try {
      const output = execSync(script, {
        cwd: this.cwd,
        encoding: "utf8",
        timeout: maxRetries ? 120_000 : 60_000,
      })
      return {
        metric: "custom-script",
        passed: true,
        score: 1,
        output: output.slice(0, 500),
        durationMs: Date.now() - startTime,
      }
    } catch (err: any) {
      return {
        metric: "custom-script",
        passed: false,
        score: 0,
        output: err.stderr?.slice(0, 500) || err.message,
        durationMs: Date.now() - startTime,
      }
    }
  }

  private async evalManual(startTime: number): Promise<EvaluationResult> {
    return {
      metric: "manual",
      passed: false,
      score: 0,
      output: "Manual evaluation required",
      durationMs: Date.now() - startTime,
      details: "This criterion requires human review. Use `aegis evaluate approve <taskId>` to mark as passed.",
    }
  }

  private formatSummary(passed: number, total: number, score: number): string {
    if (total === 0) return "No evaluation criteria defined"
    const pct = Math.round(score * 100)
    return `${passed}/${total} criteria passed (${pct}%)`
  }
}

export const evaluator = new Evaluator()

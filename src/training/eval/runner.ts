/**
 * src/training/eval/runner.ts
 *
 * EvalRunner — replays tasks through agent workers and scores outcomes
 * via the LLM judge. Supports baseline comparison for regression detection.
 */

import { createLogger } from "../../cli/logger"
import type { EvalTask } from "./suite"

const log = createLogger("eval:runner")

export interface EvalResult {
  taskId: string
  category: string
  description: string
  score: number
  duration_ms: number
  passed: boolean
  error?: string
  transcript?: string
}

export interface EvalReport {
  suite: string
  model: string
  timestamp: string
  results: EvalResult[]
  summary: {
    total: number
    passed: number
    failed: number
    passRate: number
    avgScore: number
    byCategory: Record<string, { total: number; passed: number; passRate: number }>
  }
  regressions: Regression[]
}

export interface Regression {
  taskId: string
  baselineScore: number
  currentScore: number
  drop: number
}

export interface EvalConfig {
  suite: string
  model: string
  judgeModel: string
  judgeModelFallback?: string
  baseline?: string
  output: string
  regressionThreshold: number
}

export class EvalRunner {
  /**
   * Run a single task and score the output.
   * In production, this would spin up an agent worker, send the goal,
   * and wait for completion. For now, returns a simulated result.
   */
  async runTask(task: EvalTask, _config: EvalConfig): Promise<EvalResult> {
    const start = Date.now()

    try {
      log.info(`Running task: ${task.id}`)

      // Simulate task execution with timeout
      await Promise.race([
        this.simulateExecution(task),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), task.timeout_ms),
        ),
      ])

      const duration_ms = Date.now() - start

      // Score via LLM judge
      const { judge } = await import("./judge")
      const score = await judge(task, "", task.judge_prompt)
      const passed = score >= 0.7

      return {
        taskId: task.id,
        category: task.category,
        description: task.description,
        score,
        duration_ms,
        passed,
        transcript: `Task: ${task.id}\nCompleted in ${duration_ms}ms\nScore: ${score}`,
      }
    } catch (err: any) {
      const duration_ms = Date.now() - start
      const isTimeout = err.message === "timeout"

      return {
        taskId: task.id,
        category: task.category,
        description: task.description,
        score: 0,
        duration_ms,
        passed: false,
        error: isTimeout ? `timeout (${task.timeout_ms}ms)` : String(err.message ?? err),
      }
    }
  }

  private async simulateExecution(_task: EvalTask): Promise<void> {
    // Simulate some work — in production this spawns a real agent
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000))
  }

  /**
   * Run the full eval suite.
   */
  async runSuite(suite: EvalTask[], config: EvalConfig): Promise<EvalReport> {
    const results: EvalResult[] = []

    for (const task of suite) {
      const result = await this.runTask(task, config)
      results.push(result)
      log.info(`  ${result.passed ? "✓" : "✗"} ${task.id}: ${result.score.toFixed(2)}`)
    }

    // Compute summary
    const byCategory: Record<string, { total: number; passed: number; passRate: number }> = {}

    for (const result of results) {
      const cat = result.category
      if (!byCategory[cat]) {
        byCategory[cat] = { total: 0, passed: 0, passRate: 0 }
      }
      const entry = byCategory[cat]!
      entry.total++
      if (result.passed) entry.passed++
    }

    for (const cat of Object.keys(byCategory)) {
      const entry = byCategory[cat]!
      entry.passRate = entry.total > 0 ? entry.passed / entry.total : 0
    }

    const total = results.length
    const passed = results.filter((r) => r.passed).length
    const passRate = total > 0 ? passed / total : 0
    const avgScore = results.reduce((s, r) => s + r.score, 0) / Math.max(1, total)

    // Detect regressions
    const regressions: Regression[] = []
    if (config.baseline) {
      try {
        const { readFileSync, existsSync } = await import("node:fs")
        if (existsSync(config.baseline)) {
          const baselineReport = JSON.parse(readFileSync(config.baseline, "utf-8")) as EvalReport
          for (const baseline of baselineReport.results) {
            const current = results.find((r) => r.taskId === baseline.taskId)
            if (current) {
              const drop = baseline.score - current.score
              if (drop > config.regressionThreshold) {
                regressions.push({
                  taskId: baseline.taskId,
                  baselineScore: baseline.score,
                  currentScore: current.score,
                  drop,
                })
              }
            }
          }
        }
      } catch (err) {
        log.warn("Failed to load baseline", { error: String(err) })
      }
    }

    return {
      suite: config.suite,
      model: config.model,
      timestamp: new Date().toISOString(),
      results,
      summary: { total, passed, failed: total - passed, passRate, avgScore, byCategory },
      regressions,
    }
  }
}

export const evalRunner = new EvalRunner()

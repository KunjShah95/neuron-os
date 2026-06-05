/**
 * bench/runner — Execute bench tasks and produce run records.
 *
 * Each task is dispatched through runAgentOrchestrator with evaluation
 * criteria, then re-evaluated to compute the scalar reward for the
 * history record.
 */

import { randomUUID } from "node:crypto"
import { runAgentOrchestrator } from "../modes/agent-run"
import { Evaluator } from "../mesh/evaluator"
import type { EvaluationCriteria } from "../mesh/types"
import type {
  BenchTask,
  BenchTaskResult,
  BenchRunRecord,
} from "./types"

export interface BenchRunnerConfig {
  cwd?: string
  ratchet?: boolean
  onProgress?: (msg: string) => void
  /** Skip actual agent execution (for testing) */
  dryRun?: boolean
}

export async function runBenchTask(
  task: BenchTask,
  config?: BenchRunnerConfig,
): Promise<BenchTaskResult> {
  const start = Date.now()
  const cwd = config?.cwd ?? process.cwd()
  const log = (msg: string) => config?.onProgress?.(msg)

  try {
    log(`▶ ${task.id}: ${task.name}`)

    const criteria: EvaluationCriteria[] = task.criteria.map((m) => ({ metric: m }))
    const sessionId = `bench-${task.id}-${randomUUID().slice(0, 8)}`

    if (!config?.dryRun) {
      await runAgentOrchestrator(task.goal, undefined, undefined, {
        ratchet: config?.ratchet ?? true,
        evaluation: criteria,
      })
    }

    const evaluator = new Evaluator(cwd)
    const evalResult = await evaluator.evaluate(sessionId, task.goal, criteria)

    const result: BenchTaskResult = {
      taskId: task.id,
      score: evalResult.overallScore,
      passed: evalResult.overallPass,
      durationMs: Date.now() - start,
      sessionId,
    }
    log(
      `  ${result.passed ? "✅" : "❌"} score=${result.score.toFixed(2)} in ${(result.durationMs / 1000).toFixed(1)}s`,
    )
    return result
  } catch (err: any) {
    log(`  ❌ error: ${err.message ?? String(err)}`)
    return {
      taskId: task.id,
      score: 0,
      passed: false,
      durationMs: Date.now() - start,
      error: err.message ?? String(err),
    }
  }
}

export async function runBenchSuite(
  tasks: BenchTask[],
  config?: BenchRunnerConfig,
): Promise<BenchRunRecord> {
  const results: BenchTaskResult[] = []
  for (const task of tasks) {
    results.push(await runBenchTask(task, config))
  }
  const passed = results.filter((r) => r.passed).length
  const total = results.length
  const avgScore = total
    ? Math.round((results.reduce((s, r) => s + r.score, 0) / total) * 100) / 100
    : 0

  return {
    runId: `bench-${Date.now().toString(36)}`,
    timestamp: new Date().toISOString(),
    tasks: results,
    aggregate: { passed, total, avgScore },
  }
}

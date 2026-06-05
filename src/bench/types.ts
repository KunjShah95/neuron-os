/**
 * bench/types — Bench task and result type definitions.
 *
 * Bench tasks live in .aegis/bench/*.json. They are JSON files describing
 * a goal and the evaluation criteria for measuring success.
 */

import type { EvaluationMetric } from "../mesh/types"

export interface BenchTask {
  id: string
  name: string
  goal: string
  criteria: EvaluationMetric[]
  tags?: string[]
  timeout?: number
  baseline?: { score: number; recordedAt: string }
}

export interface BenchTaskResult {
  taskId: string
  score: number
  passed: boolean
  durationMs: number
  sessionId?: string
  error?: string
}

export interface BenchRunRecord {
  runId: string
  timestamp: string
  tasks: BenchTaskResult[]
  aggregate: { passed: number; total: number; avgScore: number }
}

export interface BenchHistory {
  version: number
  runs: BenchRunRecord[]
}

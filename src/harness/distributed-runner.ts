/**
 * src/harness/distributed-runner.ts
 *
 * DistributedEvalRunner — coordinates distributed test execution via WorkerPool.
 *
 * Leader flow:
 *   1. Shard tests based on strategy
 *   2. Dispatch shards to available workers via WorkerPool.sendTask()
 *   3. Handle timeouts; retry failed shards on different workers
 *   4. Stream results as JSONL (optional)
 *   5. Aggregate results into an EvalReport
 *
 * Worker flow:
 *   registerEvalWorker(pool, opts) — listens for "eval-shard" tasks,
 *   runs each test locally, returns results.
 */

import type { TestCase, EvalResult, EvalReport, RunnerConfig } from "./types"
import type { WorkerPool } from "../distributed"
import type { WorkerInfo, WorkerStatus } from "../distributed/types"
import { TestSharder, type ShardStrategy, type ShardStrategyType } from "./test-sharder"
import { runTest } from "./runner"

// ── Types ─────────────────────────────────────────────────────────

export interface DistributedEvalConfig {
  /** Number of shards to split tests into */
  shardCount: number

  /** Sharding strategy */
  shardStrategy?: ShardStrategyType

  /** Max time per worker shard (ms) */
  workerTimeout: number

  /** Whether to retry failed shards on other workers */
  retryFailedShards: boolean

  /** Max retry attempts per failed shard */
  maxRetries: number

  /** Path to write JSONL streaming results (optional) */
  resultStreamPath?: string

  /** Collect full traces from all workers */
  gatherTraces: boolean

  /** Runner config applied to each test execution */
  runnerConfig?: Partial<RunnerConfig>
}

export interface WorkerTaskPayload {
  shardIndex: number
  tests: TestCase[]
  config: {
    model?: string
    runnerConfig?: Partial<RunnerConfig>
  }
}

export interface WorkerTaskResult {
  shardIndex: number
  workerId: string
  results: EvalResult[]
  error?: string
  durationMs: number
  workerStatus: WorkerStatus
}

export const DEFAULT_DISTRIBUTED_CONFIG: DistributedEvalConfig = {
  shardCount: 4,
  shardStrategy: "round_robin",
  workerTimeout: 600_000,          // 10 minutes
  retryFailedShards: true,
  maxRetries: 2,
  gatherTraces: true,
}

// ── Leader: Distributed Eval Runner ──────────────────────────────

export class DistributedEvalRunner {
  private pool: WorkerPool
  private sharder: TestSharder
  private config: DistributedEvalConfig
  private results: EvalResult[] = []
  private failedShards: Array<{ shardIndex: number; workerId: string; error: string }> = []
  private streamWriter: { write: (line: string) => void; close: () => void } | null = null
  private startTime = 0

  constructor(pool: WorkerPool, config?: Partial<DistributedEvalConfig>) {
    this.pool = pool
    this.sharder = new TestSharder()
    this.config = { ...DEFAULT_DISTRIBUTED_CONFIG, ...config }
  }

  /**
   * Run a full eval suite across distributed workers.
   */
  async run(suiteName: string, tests: TestCase[], model?: string): Promise<EvalReport> {
    this.startTime = Date.now()
    this.results = []
    this.failedShards = []

    // 1. Prepare streaming output
    if (this.config.resultStreamPath) {
      const fs = await import("node:fs")
      const stream = fs.createWriteStream(this.config.resultStreamPath, { flags: "w" })
      this.streamWriter = {
        write: (line: string) => stream.write(line + "\n"),
        close: () => stream.end(),
      }
    }

    // 2. Shard tests
    const workers = this.pool.getReadyWorkers()
    const strategy: ShardStrategy = {
      type: this.config.shardStrategy ?? "round_robin",
      totalShards: Math.min(this.config.shardCount, Math.max(1, workers.length || 1)),
      workers: workers.length > 0 ? workers : undefined,
    }
    const shards = this.sharder.shard(tests, strategy)
    const activeShards = shards.filter((s) => s.tests.length > 0)

    this.streamEvent("suite_start", { suiteName, totalShards: activeShards.length, totalTests: tests.length })

    // 3. Dispatch shards to workers round-robin
    const dispatchResults = await this.dispatchShards(activeShards, workers, model)

    // 4. Handle failed shards with retry
    if (this.config.retryFailedShards && this.failedShards.length > 0) {
      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        const remaining = this.failedShards.splice(0)
        if (remaining.length === 0) break

        this.streamEvent("retry_start", { attempt, shards: remaining.map((s) => s.shardIndex) })

        const retryWorkers = this.pool.getReadyWorkers()
        const retryShards = remaining.map((f) => ({
          shardIndex: f.shardIndex,
          tests: tests.filter(
            (t) => f.shardIndex === shards.findIndex((s) => s.tests.includes(t)),
          ),
        }))

        const retryResults = await this.dispatchShards(retryShards, retryWorkers, model)
        dispatchResults.push(...retryResults)
      }
    }

    // 5. Aggregate into report
    const report = this.generateReport(suiteName, tests, model)

    // 6. Close stream
    this.streamEvent("suite_complete", {
      totalTests: report.totalTests,
      passed: report.passed,
      failed: report.failed,
      avgScore: report.avgScore,
      durationMs: report.totalDurationMs,
    })
    this.streamWriter?.close()

    return report
  }

  /**
   * Dispatch shards to available workers.
   */
  private async dispatchShards(
    shards: Array<{ shardIndex: number; tests: TestCase[] }>,
    workers: WorkerInfo[],
    model?: string,
  ): Promise<EvalResult[][]> {
    const allResults: EvalResult[][] = []
    const tasks: Promise<void>[] = []

    for (let i = 0; i < shards.length; i++) {
      const shard = shards[i]!
      const worker = workers.length > 0
        ? workers[i % workers.length]
        : null

      if (!worker) {
        // No workers available — run locally
        tasks.push(this.runShardLocally(shard, model, allResults))
      } else {
        tasks.push(this.dispatchToWorker(shard, worker, model, allResults))
      }
    }

    await Promise.allSettled(tasks)
    return allResults
  }

  /**
   * Dispatch a single shard to a specific worker.
   */
  private async dispatchToWorker(
    shard: { shardIndex: number; tests: TestCase[] },
    worker: WorkerInfo,
    model: string | undefined,
    allResults: EvalResult[][],
  ): Promise<void> {
    const taskId = `eval-${Date.now().toString(36)}-${shard.shardIndex}-${Math.random().toString(36).slice(2, 6)}`

    this.streamEvent("shard_start", {
      shardIndex: shard.shardIndex,
      workerId: worker.id,
      testCount: shard.tests.length,
      taskId,
    })

    try {
      const result = await withTimeout(
        this.pool.sendTask(worker.id, {
          id: taskId,
          type: "eval-shard",
          payload: {
            shardIndex: shard.shardIndex,
            tests: shard.tests,
            config: {
              model,
              runnerConfig: this.config.runnerConfig,
            },
          } satisfies WorkerTaskPayload,
        }),
        this.config.workerTimeout,
      )

      const workerResult = result as WorkerTaskResult
      allResults.push(workerResult.results)

      for (const evalResult of workerResult.results) {
        this.results.push(evalResult)
        this.streamEvent("test_result", {
          shardIndex: shard.shardIndex,
          testId: evalResult.test.id,
          testName: evalResult.test.name,
          passed: evalResult.passed,
          score: evalResult.score,
          durationMs: evalResult.durationMs,
        })
      }

      this.streamEvent("shard_complete", {
        shardIndex: shard.shardIndex,
        workerId: worker.id,
        testCount: shard.tests.length,
        passed: workerResult.results.filter((r) => r.passed).length,
        durationMs: workerResult.durationMs,
      })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      this.failedShards.push({ shardIndex: shard.shardIndex, workerId: worker.id, error: errorMsg })

      this.streamEvent("shard_failed", {
        shardIndex: shard.shardIndex,
        workerId: worker.id,
        error: errorMsg,
      })
    }
  }

  /**
   * Run a shard locally (fallback when no workers available).
   */
  private async runShardLocally(
    shard: { shardIndex: number; tests: TestCase[] },
    model: string | undefined,
    allResults: EvalResult[][],
  ): Promise<void> {
    this.streamEvent("shard_start", {
      shardIndex: shard.shardIndex,
      workerId: "local",
      testCount: shard.tests.length,
    })

    const shardResults: EvalResult[] = []

    for (const test of shard.tests) {
      try {
        const result = await runTest(test, {
          runnerConfig: { ...this.config.runnerConfig, mode: "sequential" },
        })
        shardResults.push(result)
        this.results.push(result)

        this.streamEvent("test_result", {
          shardIndex: shard.shardIndex,
          testId: test.id,
          testName: test.name,
          passed: result.passed,
          score: result.score,
          durationMs: result.durationMs,
        })
      } catch (err) {
        shardResults.push({
          test,
          passed: false,
          score: 0,
          grades: [],
          output: "",
          trace: [],
          steps: 0,
          totalTokens: 0,
          totalCost: 0,
          durationMs: 0,
          error: err instanceof Error ? err.message : String(err),
          model: model ?? "unknown",
          agentType: "harness",
          timestamp: new Date().toISOString(),
          metadata: {},
        })
      }
    }

    allResults.push(shardResults)

    this.streamEvent("shard_complete", {
      shardIndex: shard.shardIndex,
      workerId: "local",
      testCount: shard.tests.length,
      passed: shardResults.filter((r) => r.passed).length,
      durationMs: Date.now() - this.startTime,
    })
  }

  /**
   * Aggregate all results into a final EvalReport.
   */
  private generateReport(suiteName: string, _tests: TestCase[], model?: string): EvalReport {
    const totalTests = this.results.length
    const passed = this.results.filter((r) => r.passed).length
    const totalCost = this.results.reduce((s, r) => s + r.totalCost, 0)
    const totalDurationMs = Date.now() - this.startTime
    const avgScore = totalTests > 0
      ? this.results.reduce((s, r) => s + r.score, 0) / totalTests
      : 0

    // Group by category
    const byCategory: EvalReport["byCategory"] = {} as EvalReport["byCategory"]
    for (const r of this.results) {
      const cat = r.test.category ?? "smoke"
      if (!byCategory[cat]) {
        byCategory[cat] = { total: 0, passed: 0, avgScore: 0 }
      }
      byCategory[cat]!.total++
      if (r.passed) byCategory[cat]!.passed++
    }
    for (const [cat, info] of Object.entries(byCategory)) {
      info.avgScore = info.total > 0
        ? this.results
            .filter((r) => (r.test.category ?? "smoke") === cat)
            .reduce((s, r) => s + r.score, 0) / info.total
        : 0
    }

    return {
      id: `dist-eval-${Date.now().toString(36)}`,
      timestamp: new Date().toISOString(),
      model: model ?? "unknown",
      agentType: "harness",
      suite: suiteName,
      totalTests,
      passed,
      failed: totalTests - passed,
      avgScore,
      totalCost,
      totalDurationMs,
      results: this.results,
      byCategory,
      regressions: [],
      metadata: {
        distributed: true,
        shardCount: this.config.shardCount,
        shardStrategy: this.config.shardStrategy ?? "round_robin",
        failedShards: this.failedShards.length,
        retriesUsed: this.failedShards.length > 0 ? this.config.maxRetries : 0,
      },
    }
  }

  /**
   * Write a JSONL event to the stream.
   */
  private streamEvent(event: string, data: Record<string, unknown>): void {
    if (this.streamWriter) {
      this.streamWriter.write(JSON.stringify({ event, timestamp: new Date().toISOString(), ...data }))
    }
  }
}

// ── Worker: Eval Shard Handler ──────────────────────────────────

export interface EvalWorkerOptions {
  /** Function to run a single test. Defaults to harness's runTest. */
  runTestFn?: (test: TestCase, config?: { runnerConfig?: Partial<RunnerConfig> }) => Promise<EvalResult>
}

/**
 * Register an eval-shard task handler on a worker pool.
 * Call this on each worker node to enable it to receive and execute eval shards.
 */
export function registerEvalWorker(
  pool: WorkerPool,
  opts?: EvalWorkerOptions,
): void {
  const executeTest = opts?.runTestFn ?? runTest

  pool.on("task", async (event: { taskId: string; taskType: string; taskPayload: WorkerTaskPayload; sourceWorkerId: string }) => {
    if (event.taskType !== "eval-shard") return

    const { shardIndex, tests, config } = event.taskPayload
    const shardStart = Date.now()

    const results: EvalResult[] = []
    for (const test of tests) {
      try {
        const result = await executeTest(test, {
          runnerConfig: config.runnerConfig,
        })
        results.push(result)
      } catch (err) {
        results.push({
          test,
          passed: false,
          score: 0,
          grades: [],
          output: "",
          trace: [],
          steps: 0,
          totalTokens: 0,
          totalCost: 0,
          durationMs: 0,
          error: err instanceof Error ? err.message : String(err),
          model: config.model ?? "unknown",
          agentType: "harness",
          timestamp: new Date().toISOString(),
          metadata: {},
        })
      }
    }

    const workerResult: WorkerTaskResult = {
      shardIndex,
      workerId: pool.getLocalInfo().id,
      results,
      durationMs: Date.now() - shardStart,
      workerStatus: "ready",
    }

    pool.sendTaskResult(event.taskId, workerResult)
  })
}

// ── Utility ──────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms)
    promise.then(
      (val) => { clearTimeout(timer); resolve(val) },
      (err) => { clearTimeout(timer); reject(err) },
    )
  })
}

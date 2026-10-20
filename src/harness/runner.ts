import { createAgentRuntime } from "../agent"
import { AIProviderManager, type AIConfig } from "../ai"
import { AgentEngine } from "../agent"
import { estimateTokens } from "../tools/precompact"
import type { AIProviderType } from "../ai/models"
import type { TestCase, EvalResult, ToolTrace, RunnerConfig } from "./types"
import { BudgetController } from "./budget-controller"
import { FlakyManager } from "./flaky-manager"
import { HarnessSandboxManager } from "./sandbox"
import { GraderSuite } from "./grader"
import { RUN_OBSERVATION_TRACE } from "./grader/deterministic"
import type { GraderSuiteConfig } from "./grader/types"

const DEFAULT_MODEL = process.env.HARNESS_MODEL || "claude-sonnet-4-20250514"
const DEFAULT_TEST_TIMEOUT_MS = 120000

const sandboxManager = new HarnessSandboxManager()

export class HarnessTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "HarnessTimeoutError"
  }
}

export interface HarnessRunnerConfig {
  aiConfig?: Partial<AIConfig>
  runnerConfig?: Partial<RunnerConfig>
  signal?: AbortSignal
  budgetController?: BudgetController
  graderConfig?: Partial<GraderSuiteConfig>
}

export function resolveTestTimeout(testTimeout?: number, runnerTimeout?: number): number {
  const test = typeof testTimeout === "number" && testTimeout > 0 ? testTimeout : 0
  const runner = typeof runnerTimeout === "number" && runnerTimeout > 0 ? runnerTimeout : 0
  if (test > 0 && runner > 0) return Math.min(test, runner)
  return test || runner || DEFAULT_TEST_TIMEOUT_MS
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new HarnessTimeoutError(`"${label}" timed out after ${timeoutMs}ms`))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export function withBudgetController(
  config: HarnessRunnerConfig | undefined,
  budgetController: BudgetController,
): HarnessRunnerConfig {
  return { ...config, budgetController }
}

// ── Single Test Runner ──────────────────────────────────────────

export async function runTest(test: TestCase, config?: HarnessRunnerConfig): Promise<EvalResult> {
  const start = Date.now()
  const sessionId = `harness-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const model = test.model ?? DEFAULT_MODEL
  const timeout = resolveTestTimeout(test.timeout, config?.runnerConfig?.timeout)

  const traces: ToolTrace[] = []
  let observedExitCode: number | undefined
  let totalTokens = 0

  try {
    // Create sandbox
    const sandbox = await sandboxManager.create(test)
    const baselineSnapshot = await sandboxManager.snapshot(sandbox)
    sandboxManager.storeBaseline(sandbox, baselineSnapshot)

    // Create agent runtime
    const runtime = createAgentRuntime("harness", "build")
    const ai = new AIProviderManager({
      provider: "anthropic" as AIProviderType,
      model,
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      temperature: 0.5,
      ...config?.aiConfig,
    })
    const engine = new AgentEngine(runtime, ai, {
      maxSteps: test.expected?.maxSteps ?? 20,
      sessionId,
      sessionName: test.name ?? `harness-${sessionId}`,
      goal: test.prompt.slice(0, 200),
    })

    // Trace instrumentation
    const originalExecute = runtime.executeTool.bind(runtime)
    runtime.executeTool = async (name: string, params: Record<string, unknown>) => {
      const tStart = Date.now()
      const result = await originalExecute(name, params)
      const exitCode = result.metadata?.exitCode
      if (typeof exitCode === "number") observedExitCode = exitCode
      const tokenCost = result.metadata?.tokenCost
      const trace: ToolTrace = {
        name,
        params,
        result: result.output,
        durationMs: Date.now() - tStart,
      }
      if (typeof tokenCost === "number") trace.tokenCost = tokenCost
      traces.push(trace)
      return result
    }

    // Execute with timeout — the abort signal and the timer both bound the call
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeout)
    let output: { text: string }
    try {
      output = await withTimeout(engine.chat([{ role: "user", content: test.prompt }]), timeout, test.name ?? test.id)
    } finally {
      clearTimeout(timer)
      ac.abort()
    }

    // Capture sandbox diff
    const sandboxSnapshot = await sandboxManager.snapshotDiff(sandbox)

    // Record cost (if budget controller provided via suite runner, or use local)
    const tokenCounts = splitRunTokens(output.text, traces)
    const totalCost = estimateCost(model, tokenCounts.inputTokens, tokenCounts.outputTokens)
    const bc = config?.budgetController ?? new BudgetController()
    bc.recordCost(totalCost)

    totalTokens = tokenCounts.totalTokens
    const steps = traces.length
    traces.push({
      name: RUN_OBSERVATION_TRACE,
      params: {
        totalTokens,
        ...(observedExitCode !== undefined ? { exitCode: observedExitCode } : {}),
      },
      result: "",
      durationMs: 0,
    })

    // Build raw EvalResult without grades yet
    const rawResult: EvalResult = {
      test,
      passed: false,
      score: 0,
      grades: [],
      output: output.text,
      trace: traces,
      steps,
      totalTokens,
      totalCost,
      durationMs: Date.now() - start,
      model,
      agentType: "harness",
      timestamp: new Date().toISOString(),
      metadata: {},
      sandboxSnapshot,
    }

    // Run grader suite (Phase 2 integration)
    const graderSuite = config?.graderConfig
      ? new GraderSuite({ ...config.graderConfig, workDir: sandbox.workDir })
      : new GraderSuite({ workDir: sandbox.workDir })
    const gradedResult = await graderSuite.grade(rawResult)

    await engine.completeSession(gradedResult.passed ? "completed" : "failed")

    // Cleanup sandbox
    if (test.cleanup !== false) {
      await sandboxManager.cleanup(sandbox)
    }

    return gradedResult
  } catch (err) {
    return {
      test,
      passed: false,
      score: 0,
      grades: [],
      output: "",
      trace: traces,
      steps: traces.length,
      totalTokens,
      totalCost: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
      model,
      agentType: "harness",
      timestamp: new Date().toISOString(),
      metadata: {},
    }
  }
}

// ── Parallel Suite Runner ────────────────────────────────────────

export async function runSuite(tests: TestCase[], config?: HarnessRunnerConfig): Promise<EvalResult[]> {
  const runnerConfig: RunnerConfig = {
    concurrency: config?.runnerConfig?.concurrency ?? 4,
    mode: config?.runnerConfig?.mode ?? "parallel",
    timeout: config?.runnerConfig?.timeout ?? 120000,
    retryCount: config?.runnerConfig?.retryCount ?? 0,
    retryDelay: config?.runnerConfig?.retryDelay ?? 1000,
    failureThreshold: config?.runnerConfig?.failureThreshold ?? Infinity,
    signal: config?.signal,
  }

  const budgetController = config?.budgetController ?? new BudgetController()
  const attemptConfig = withBudgetController(config, budgetController)
  const flakyManager = new FlakyManager()
  const results: EvalResult[] = []
  let failures = 0
  let skipped = 0

  // Run in batches of `concurrency`
  for (let i = 0; i < tests.length; i += runnerConfig.concurrency) {
    if (runnerConfig.signal?.aborted) break

    const batch = tests.slice(i, i + runnerConfig.concurrency)
    const batchResults = await Promise.all(
      batch.map(async (test) => {
        if (runnerConfig.signal?.aborted) return null

        // Skip quarantined tests
        if (flakyManager.isQuarantined(test.id)) {
          console.warn(`[SKIP] Quarantined test: "${test.name}" (${test.id})`)
          skipped++
          return null
        }

        // First attempt
        let result = await runTest(test, attemptConfig)

        // Retry if failed and retries configured
        if (!result.passed && runnerConfig.retryCount > 0) {
          for (let attempt = 1; attempt <= runnerConfig.retryCount; attempt++) {
            await new Promise((r) => setTimeout(r, runnerConfig.retryDelay * attempt))
            const retryResult = await runTest(test, attemptConfig)
            if (retryResult.passed) {
              flakyManager.recordRun(test.id, result, retryResult)
              result = retryResult
              break
            }
            if (attempt === runnerConfig.retryCount) {
              flakyManager.recordRun(test.id, result, undefined)
            }
          }
        }

        return result
      }),
    )

    for (const result of batchResults) {
      if (result === null) continue
      results.push(result)
      if (!result.passed) {
        failures++
        if (failures >= runnerConfig.failureThreshold) {
          console.warn(`[HALT] Failure threshold (${runnerConfig.failureThreshold}) reached`)
          return results
        }
      }
    }
  }

  if (skipped > 0) {
    console.log(`[HARNESS] ${skipped} test(s) were quarantined and skipped`)
  }

  return results
}

// ── Legacy backward compat ──────────────────────────────────────

/**
 * Legacy runTest signature for backward compatibility.
 */
/** @deprecated Use runTest instead */
export async function runTestLegacy(test: TestCase, config?: HarnessRunnerConfig): Promise<EvalResult> {
  return runTest(test, config)
}

// ── Helpers ─────────────────────────────────────────────────────

export interface ModelRate {
  promptPer1k: number
  completionPer1k: number
}

const MODEL_RATES: Record<string, ModelRate> = {
  "claude-sonnet-4-20250514": { promptPer1k: 0.003, completionPer1k: 0.015 },
  "claude-sonnet-4-6": { promptPer1k: 0.003, completionPer1k: 0.015 },
  "gpt-4o": { promptPer1k: 0.0025, completionPer1k: 0.01 },
  "gpt-4o-mini": { promptPer1k: 0.00015, completionPer1k: 0.0006 },
  "deepseek-v3": { promptPer1k: 0.00014, completionPer1k: 0.00028 },
}

const DEFAULT_MODEL_RATE: ModelRate = { promptPer1k: 0.003, completionPer1k: 0.015 }

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rate = MODEL_RATES[model] ?? DEFAULT_MODEL_RATE
  const input = Number.isFinite(inputTokens) ? Math.max(0, inputTokens) : 0
  const output = Number.isFinite(outputTokens) ? Math.max(0, outputTokens) : 0
  return (input / 1000) * rate.promptPer1k + (output / 1000) * rate.completionPer1k
}

export function countRunTokens(output: string, traces: ToolTrace[]): number {
  let total = estimateTokens(output)
  for (const trace of traces) {
    if (typeof trace.tokenCost === "number") total += trace.tokenCost
  }
  return total
}

export function splitRunTokens(
  output: string,
  traces: ToolTrace[],
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const outputTokens = estimateTokens(output)
  const totalTokens = countRunTokens(output, traces)
  const inputTokens = Math.max(0, totalTokens - outputTokens)
  return { inputTokens, outputTokens, totalTokens }
}

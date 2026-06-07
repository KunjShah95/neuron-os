import { createAgentRuntime } from "../agent"
import { AIProviderManager, type AIConfig } from "../ai"
import { AgentEngine } from "../agent"
import type { AIProviderType } from "../ai/models"
import type { TestCase, EvalResult, ToolTrace, RunnerConfig } from "./types"
import { BudgetController } from "./budget-controller"
import { FlakyManager } from "./flaky-manager"
import { HarnessSandboxManager } from "./sandbox"
import { GraderSuite } from "./grader"
import type { GraderSuiteConfig } from "./grader/types"

const DEFAULT_MODEL = process.env.HARNESS_MODEL || "claude-sonnet-4-20250514"

const sandboxManager = new HarnessSandboxManager()

export interface HarnessRunnerConfig {
  aiConfig?: Partial<AIConfig>
  runnerConfig?: Partial<RunnerConfig>
  signal?: AbortSignal
  budgetController?: BudgetController
  graderConfig?: Partial<GraderSuiteConfig>
}

// ── Single Test Runner ──────────────────────────────────────────

export async function runTest(test: TestCase, config?: HarnessRunnerConfig): Promise<EvalResult> {
  const start = Date.now()
  const sessionId = `harness-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const model = test.model ?? DEFAULT_MODEL

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
    const traces: ToolTrace[] = []
    const originalExecute = runtime.executeTool.bind(runtime)
    runtime.executeTool = async (name: string, params: Record<string, unknown>) => {
      const tStart = Date.now()
      const result = await originalExecute(name, params)
      traces.push({ name, params, result: result.output, durationMs: Date.now() - tStart })
      return result
    }

    // Execute with timeout
    const timeout = test.timeout || 120000
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeout)

    const output = await engine.chat([{ role: "user", content: test.prompt }])
    clearTimeout(timer)

    // Capture sandbox diff
    const sandboxSnapshot = await sandboxManager.snapshotDiff(sandbox)

    // Record cost (if budget controller provided via suite runner, or use local)
    const totalCost = estimateCost(model, traces, output.text)
    const bc = config?.budgetController ?? new BudgetController()
    bc.recordCost(totalCost)

    // Build raw EvalResult without grades yet
    const rawResult: EvalResult = {
      test,
      passed: false,
      score: 0,
      grades: [],
      output: output.text,
      trace: traces,
      steps: traces.length,
      totalTokens: 0,
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
      trace: [],
      steps: 0,
      totalTokens: 0,
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

export async function runSuite(
  tests: TestCase[],
  config?: HarnessRunnerConfig,
): Promise<EvalResult[]> {
  const runnerConfig: RunnerConfig = {
    concurrency: config?.runnerConfig?.concurrency ?? 4,
    mode: config?.runnerConfig?.mode ?? "parallel",
    timeout: config?.runnerConfig?.timeout ?? 120000,
    retryCount: config?.runnerConfig?.retryCount ?? 0,
    retryDelay: config?.runnerConfig?.retryDelay ?? 1000,
    failureThreshold: config?.runnerConfig?.failureThreshold ?? Infinity,
    signal: config?.signal,
  }

  const budgetController = new BudgetController()
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
        let result = await runTest(test, { ...config, budgetController })

        // Retry if failed and retries configured
        if (!result.passed && runnerConfig.retryCount > 0) {
          for (let attempt = 1; attempt <= runnerConfig.retryCount; attempt++) {
            await new Promise(r => setTimeout(r, runnerConfig.retryDelay * attempt))
            const retryResult = await runTest(test, config)
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

function estimateCost(model: string, _traces: ToolTrace[], _output: string): number {
  // Simple cost estimation based on model
  const rates: Record<string, number> = {
    "claude-sonnet-4-20250514": 0.003,
    "claude-sonnet-4-6": 0.003,
    "gpt-4o": 0.005,
    "gpt-4o-mini": 0.0015,
    "deepseek-v3": 0.0005,
  }
  return rates[model] ?? 0.003
}

import type { TestCase, EvalResult, ToolTrace } from "./types"
import { createAgentRuntime } from "../agent"
import { AIProviderManager, type AIConfig } from "../ai"
import { AgentEngine } from "../agent"
import type { AIProviderType } from "../ai/models"

const DEFAULT_MODEL = process.env.HARNESS_MODEL || "claude-sonnet-4-20250514"

export interface HarnessRunnerConfig {
  aiConfig?: Partial<AIConfig>
  signal?: AbortSignal
}

export async function runTest(test: TestCase, config?: HarnessRunnerConfig): Promise<EvalResult> {
  const start = Date.now()

  try {
    const runtime = createAgentRuntime("harness", "build")
    const ai = new AIProviderManager({
      provider: "anthropic" as AIProviderType,
      model: DEFAULT_MODEL,
      apiKey: process.env.ANTHROPIC_API_KEY || "",
      temperature: 0.5,
      ...config?.aiConfig,
    })
    const engine = new AgentEngine(runtime, ai, { maxSteps: 20 })

    const traces: ToolTrace[] = []
    const originalExecute = runtime.executeTool.bind(runtime)
    runtime.executeTool = async (name: string, params: Record<string, unknown>) => {
      const tStart = Date.now()
      const result = await originalExecute(name, params)
      traces.push({ name, params, result: result.output, durationMs: Date.now() - tStart })
      return result
    }

    const timeout = test.timeout || 120000
    const timer = setTimeout(() => { throw new Error("Timeout") }, timeout)

    const output = await engine.chat([{ role: "user", content: test.prompt }])

    clearTimeout(timer)

    const passed = test.expected ? output.text.includes(test.expected) : true

    return {
      test,
      passed,
      output: output.text,
      trace: traces,
      steps: traces.length,
      totalTokens: 0,
      durationMs: Date.now() - start,
    }
  } catch (err) {
    return {
      test,
      passed: false,
      output: "",
      trace: [],
      steps: 0,
      totalTokens: 0,
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function runSuite(tests: TestCase[], config?: HarnessRunnerConfig): Promise<EvalResult[]> {
  const results: EvalResult[] = []
  for (const test of tests) {
    if (config?.signal?.aborted) break
    const result = await runTest(test, config)
    results.push(result)
  }
  return results
}

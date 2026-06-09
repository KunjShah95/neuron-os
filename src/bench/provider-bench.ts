import { generateText } from "ai"
import { getProviderFactory, listProviders } from "../ai/providers"
import { resolveApiKey } from "../ai/provider"
import type { AIConfig } from "../ai/provider"
import type { AIProviderType } from "../ai/models"
import { getDefaultModel } from "../ai/models"
import { estimateModelCost } from "../economy/cost-router"

export interface ProviderBenchResult {
  provider: string
  model: string
  success: boolean
  durationMs: number
  outputLength: number
  inputTokens?: number
  outputTokens?: number
  costUsd?: number
  error?: string
}

export interface ProviderBenchReport {
  task: string
  results: ProviderBenchResult[]
  fastest: ProviderBenchResult | null
  cheapest: ProviderBenchResult | null
  highestQuality: ProviderBenchResult | null
  timestamp: string
}

function resolveModel(provider: string): string {
  try {
    return getDefaultModel(provider as AIProviderType)
  } catch {
    return "gpt-4o"
  }
}

export class ProviderBenchmark {
  runAgainstAllProviders(
    task: string,
    options?: {
      providers?: string[]
      timeoutMs?: number
      modelPerProvider?: Record<string, string>
    },
  ): Promise<ProviderBenchReport> {
    const providers = options?.providers ?? listProviders()
    return this.runAgainstProviders(task, providers, options)
  }

  async runAgainstProviders(
    task: string,
    providers: string[],
    options?: {
      timeoutMs?: number
      modelPerProvider?: Record<string, string>
    },
  ): Promise<ProviderBenchReport> {
    const results: ProviderBenchResult[] = []

    for (const provider of providers) {
      const model = options?.modelPerProvider?.[provider] ?? resolveModel(provider)
      const result = await this.runAgainstProvider(provider, task, model, options?.timeoutMs)
      results.push(result)
    }

    const successful = results.filter((r) => r.success)

    let fastest: ProviderBenchResult | null = null
    if (successful.length > 0) {
      fastest = successful.reduce((a, b) => (a.durationMs < b.durationMs ? a : b))
    }

    let cheapest: ProviderBenchResult | null = null
    if (successful.length > 0) {
      cheapest = successful.reduce((a, b) => ((a.costUsd ?? Infinity) < (b.costUsd ?? Infinity) ? a : b))
    }

    return {
      task,
      results,
      fastest,
      cheapest,
      highestQuality: null,
      timestamp: new Date().toISOString(),
    }
  }

  async runAgainstProvider(
    provider: string,
    task: string,
    model?: string,
    timeoutMs?: number,
  ): Promise<ProviderBenchResult> {
    const modelName = model ?? resolveModel(provider)
    const apiKey = resolveApiKey(provider)

    if (!apiKey) {
      return {
        provider,
        model: modelName,
        success: false,
        durationMs: 0,
        outputLength: 0,
        error: "No API key configured",
      }
    }

    const factory = getProviderFactory(provider)
    if (!factory) {
      return {
        provider,
        model: modelName,
        success: false,
        durationMs: 0,
        outputLength: 0,
        error: `Unknown provider: ${provider}`,
      }
    }

    const config: AIConfig = {
      provider: provider as AIProviderType,
      model: modelName,
      apiKey,
    }

    let lm: ReturnType<typeof factory>
    try {
      lm = factory(config)
    } catch (err: unknown) {
      return {
        provider,
        model: modelName,
        success: false,
        durationMs: 0,
        outputLength: 0,
        error: `Factory error: ${err instanceof Error ? err.message : String(err)}`,
      }
    }

    const start = Date.now()
    try {
      const runPromise = generateText({
        model: lm,
        messages: [{ role: "user" as const, content: task }],
      })

      const result = timeoutMs
        ? await Promise.race([
            runPromise,
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
            ),
          ])
        : await runPromise

      const durationMs = Date.now() - start
      const outputLength = result.text.length

      const usage = result.usage as
        | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
        | undefined
      const inputTokens = usage?.promptTokens
      const outputTokens = usage?.completionTokens

      let costUsd: number | undefined
      if (inputTokens !== undefined && outputTokens !== undefined) {
        const est = estimateModelCost(modelName, inputTokens, outputTokens)
        if (isFinite(est)) costUsd = Math.round(est * 1_000_000) / 1_000_000
      }

      return {
        provider,
        model: modelName,
        success: true,
        durationMs,
        outputLength,
        inputTokens,
        outputTokens,
        costUsd,
      }
    } catch (err: unknown) {
      return {
        provider,
        model: modelName,
        success: false,
        durationMs: Date.now() - start,
        outputLength: 0,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  estimateCost(_provider: string, model: string, inputTokens: number, outputTokens: number): number {
    const est = estimateModelCost(model, inputTokens, outputTokens)
    return isFinite(est) ? est : 0
  }
}

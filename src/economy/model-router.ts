import { loadPricing } from "./pricing-registry"
import { route as costRoute, estimateModelCost } from "./cost-router"
import { listProviders } from "../ai/providers"
import { resolveApiKey } from "../ai/provider"

export interface RouterTask {
  taskType?: string
  estimatedInputTokens?: number
  estimatedOutputTokens?: number
  budgetUsd?: number
  preferredTier?: "cheap" | "balanced" | "premium"
  minQuality?: number
}

export interface RouterResult {
  provider: string
  model: string
  estimatedCost: number
  tier: "cheap" | "balanced" | "premium"
  apiKey: string | undefined
  reasoning: string
}

const MODEL_PREFIX_PROVIDER: Array<[RegExp, string]> = [
  [/^claude-/, "anthropic"],
  [/^gpt-/, "openai"],
  [/^deepseek-/, "deepseek"],
  [/^gemini-/, "gemini"],
  [/^mistral-/, "mistral"],
  [/^command-/, "cohere"],
  [/^grok-/, "xai"],
  [/^llama-/, "groq"],
  [/^mixtral-/, "mistral"],
]

const TASK_DEFAULTS: Record<
  string,
  {
    tier: "cheap" | "balanced" | "premium"
    inputTokens: number
    outputTokens: number
    budget: number
  }
> = {
  build: { tier: "balanced", inputTokens: 4000, outputTokens: 2000, budget: 0.5 },
  plan: { tier: "premium", inputTokens: 3000, outputTokens: 1000, budget: 0.3 },
  read: { tier: "cheap", inputTokens: 1000, outputTokens: 500, budget: 0.05 },
  write: { tier: "balanced", inputTokens: 2000, outputTokens: 1000, budget: 0.1 },
  test: { tier: "balanced", inputTokens: 2000, outputTokens: 1000, budget: 0.1 },
  validate: { tier: "cheap", inputTokens: 1500, outputTokens: 500, budget: 0.05 },
  review: { tier: "premium", inputTokens: 4000, outputTokens: 1000, budget: 0.3 },
  debug: { tier: "premium", inputTokens: 3000, outputTokens: 1500, budget: 0.5 },
  document: { tier: "balanced", inputTokens: 2000, outputTokens: 1000, budget: 0.1 },
  refactor: { tier: "balanced", inputTokens: 2000, outputTokens: 1000, budget: 0.15 },
  deploy: { tier: "balanced", inputTokens: 1500, outputTokens: 500, budget: 0.1 },
  monitor: { tier: "cheap", inputTokens: 500, outputTokens: 200, budget: 0.02 },
  explore: { tier: "cheap", inputTokens: 500, outputTokens: 200, budget: 0.02 },
  adversarial: { tier: "premium", inputTokens: 3000, outputTokens: 1500, budget: 0.5 },
}

function resolveModelProvider(modelName: string): string {
  for (const [pattern, provider] of MODEL_PREFIX_PROVIDER) {
    if (pattern.test(modelName)) return provider
  }
  return "openai"
}

function isProviderRegistered(name: string): boolean {
  return listProviders().includes(name)
}

export class ModelRouter {
  static route(task: RouterTask): RouterResult {
    const defs = task.taskType ? TASK_DEFAULTS[task.taskType] : undefined

    const inputTokens = task.estimatedInputTokens ?? defs?.inputTokens ?? 2000
    const outputTokens = task.estimatedOutputTokens ?? defs?.outputTokens ?? 1000
    const budget = task.budgetUsd ?? defs?.budget ?? 0.5
    const preferredTier = task.preferredTier ?? defs?.tier ?? "balanced"

    const result = costRoute({
      inputTokens,
      outputTokens,
      budget,
      minQuality: task.minQuality ?? 0,
      preferredTier,
    })

    const modelName = result.selected_model
    const tier = result.selected

    let provider = resolveModelProvider(modelName)
    let apiKey = resolveApiKey(provider)

    if (!apiKey || !isProviderRegistered(provider)) {
      const fallback = "openrouter"
      const fallbackKey = resolveApiKey(fallback)
      if (fallbackKey && isProviderRegistered(fallback)) {
        provider = fallback
        apiKey = fallbackKey
      }
    }

    const costMap: Record<string, number> = {
      cheap: result.cheap,
      balanced: result.balanced,
      premium: result.premium,
    }
    const estimatedCost = costMap[tier] ?? 0

    return {
      provider,
      model: modelName,
      estimatedCost,
      tier,
      apiKey,
      reasoning: `${result.reasoning}; routed via ${provider}`,
    }
  }

  static routeWithOverride(task: RouterTask, preferredProvider: string, preferredModel: string): RouterResult {
    const apiKey = resolveApiKey(preferredProvider)
    const pricing = loadPricing()
    const modelInfo = pricing.models[preferredModel]

    let estimatedCost = 0
    if (modelInfo) {
      const inputTokens = task.estimatedInputTokens ?? 2000
      const outputTokens = task.estimatedOutputTokens ?? 1000
      estimatedCost =
        (inputTokens / 1000) * modelInfo.prompt_usd_per_1k + (outputTokens / 1000) * modelInfo.completion_usd_per_1k
    }

    const tier = (modelInfo?.quality_tier ?? "balanced") as "cheap" | "balanced" | "premium"

    return {
      provider: preferredProvider,
      model: preferredModel,
      estimatedCost,
      tier,
      apiKey,
      reasoning: `Override: ${preferredProvider}/${preferredModel} ($${estimatedCost.toFixed(4)})${apiKey ? "" : " [WARNING: no API key configured]"}`,
    }
  }

  static getPricing(
    _provider: string,
    model: string,
  ): {
    costPer1kInput: number
    costPer1kOutput: number
    tier: string
  } | null {
    const pricing = loadPricing()
    const info = pricing.models[model]
    if (!info) return null
    return {
      costPer1kInput: info.prompt_usd_per_1k,
      costPer1kOutput: info.completion_usd_per_1k,
      tier: info.quality_tier,
    }
  }

  static suggestBudget(agentType: string): number {
    const defs = TASK_DEFAULTS[agentType]
    if (defs) return defs.budget
    return 0.1
  }

  static listAvailable(options?: {
    tier?: "cheap" | "balanced" | "premium"
    provider?: string
  }): Array<{ provider: string; model: string; tier: string; cost: number }> {
    const pricing = loadPricing()
    const results: Array<{ provider: string; model: string; tier: string; cost: number }> = []

    for (const [name, model] of Object.entries(pricing.models)) {
      if (options?.tier && model.quality_tier !== options.tier) continue

      const provider = resolveModelProvider(name)
      if (options?.provider && provider !== options.provider) continue

      if (!isProviderRegistered(provider)) continue

      const cost = estimateModelCost(name, 1000, 500)
      results.push({
        provider,
        model: name,
        tier: model.quality_tier,
        cost: cost === Infinity ? 0 : cost,
      })
    }

    results.sort((a, b) => a.cost - b.cost)
    return results
  }
}

import { loadPricing } from "./pricing-registry"
import type { CostEstimate } from "./types"

export class NoViableProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "NoViableProviderError"
  }
}

export interface RouteCandidate {
  name: string
  estimatedCost: number
  qualityTier: "free" | "cheap" | "balanced" | "premium"
  benchmarkScore: number
}

export function estimateModelCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const pricing = loadPricing()
  const model = pricing.models[modelName]
  if (!model) return Infinity

  const inputCost = (inputTokens / 1000) * model.prompt_usd_per_1k
  const outputCost = (outputTokens / 1000) * model.completion_usd_per_1k
  return inputCost + outputCost
}

export function route(options: {
  inputTokens: number
  outputTokens: number
  budget: number
  minQuality?: number
  preferredTier?: "free" | "cheap" | "balanced" | "premium"
}): CostEstimate {
  const { inputTokens, outputTokens, budget, minQuality = 0, preferredTier } = options
  const pricing = loadPricing()

  const models = Object.entries(pricing.models)
  const estimates: Array<{ name: string; cost: number; tier: "free" | "cheap" | "balanced" | "premium"; score: number }> = []

  for (const [name, model] of models) {
    const score = model.benchmark_score ?? 0.8
    if (score < minQuality) continue

    const cost = estimateModelCost(name, inputTokens, outputTokens)
    estimates.push({ name, cost, tier: model.quality_tier, score })
  }

  // Filter by preferred tier if specified
  const tierFiltered = preferredTier ? estimates.filter((e) => e.tier === preferredTier) : estimates

  // Within budget
  const affordable = tierFiltered.filter((e) => e.cost <= budget)

  if (affordable.length === 0) {
    const available = estimates.map((e) => `${e.name} ($${e.cost.toFixed(4)}, ${e.tier}, score=${e.score})`).join(", ")
    throw new NoViableProviderError(
      `No provider meets quality >=${minQuality} within budget $${budget}. ` + `Available: ${available}`,
    )
  }

  // Cheapest first
  affordable.sort((a, b) => a.cost - b.cost)

  const cheapest = affordable[0] as (typeof affordable)[0]
  const freeModels = estimates.filter((e) => e.tier === "free").sort((a, b) => a.cost - b.cost)
  const cheapModels = estimates.filter((e) => e.tier === "cheap").sort((a, b) => a.cost - b.cost)
  const balancedModels = estimates.filter((e) => e.tier === "balanced").sort((a, b) => a.cost - b.cost)
  const premiumModels = estimates.filter((e) => e.tier === "premium").sort((a, b) => a.cost - b.cost)

  const free = freeModels.length > 0 ? (freeModels[0] as (typeof freeModels)[0]).cost : Infinity
  const cheap = cheapModels.length > 0 ? (cheapModels[0] as (typeof cheapModels)[0]).cost : Infinity
  const balanced = balancedModels.length > 0 ? (balancedModels[0] as (typeof balancedModels)[0]).cost : Infinity
  const premium = premiumModels.length > 0 ? (premiumModels[0] as (typeof premiumModels)[0]).cost : Infinity

  return {
    free,
    cheap,
    balanced,
    premium,
    selected: cheapest.tier,
    selected_model: cheapest.name,
    reasoning: `Selected ${cheapest.name} (${cheapest.tier}) at $${cheapest.cost.toFixed(4)} — cheapest meeting quality >=${minQuality} within $${budget} budget`,
  }
}

export function estimateCost(
  task: { inputTokens: number; outputTokens: number; tools?: string[]; toolCalls?: number },
  options?: { budget?: number; minQuality?: number },
): CostEstimate {
  const pricing = loadPricing()
  const base = route({
    inputTokens: task.inputTokens,
    outputTokens: task.outputTokens,
    budget: options?.budget ?? 100,
    minQuality: options?.minQuality ?? 0,
  })

  // Add tool costs
  let toolCost = 0
  if (task.tools && task.toolCalls) {
    for (const toolName of task.tools) {
      const toolPricing = pricing.tools[toolName]
      if (toolPricing?.api_usd) {
        toolCost += toolPricing.api_usd * task.toolCalls
      }
    }
  }

  return {
    ...base,
    free: base.free + toolCost,
    cheap: base.cheap + toolCost,
    balanced: base.balanced + toolCost,
    premium: base.premium + toolCost,
  }
}

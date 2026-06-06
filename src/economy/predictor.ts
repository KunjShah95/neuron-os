import { estimateModelCost } from "./cost-router"
import { loadPricing } from "./pricing-registry"
import type { CostEstimate } from "./types"

export interface TaskProfile {
  inputTokens: number
  outputTokens: number
  tools: string[]
  toolCalls: number
  complexity: "simple" | "moderate" | "complex"
}

export function predictCost(
  task: TaskProfile,
): CostEstimate {
  const pricing = loadPricing()

  // Scale by complexity
  const complexityMultiplier = { simple: 1, moderate: 2, complex: 4 }
  const multiplier = complexityMultiplier[task.complexity]

  const scaledInput = task.inputTokens * multiplier
  const scaledOutput = task.outputTokens * multiplier

  const models = Object.entries(pricing.models)
  const cheapModels = models.filter(([, m]) => m.quality_tier === "cheap")
  const balancedModels = models.filter(([, m]) => m.quality_tier === "balanced")
  const premiumModels = models.filter(([, m]) => m.quality_tier === "premium")

  function bestOfCategory(candidates: Array<[string, typeof pricing.models[string]]>): number {
    const costs = candidates.map(([name]) => estimateModelCost(name, scaledInput, scaledOutput))
    return costs.length > 0 ? Math.min(...costs) : Infinity
  }

  const cheap = bestOfCategory(cheapModels)
  const balanced = bestOfCategory(balancedModels)
  const premium = bestOfCategory(premiumModels)

  // Add tool costs
  let toolCost = 0
  for (const toolName of task.tools) {
    const tp = pricing.tools[toolName]
    if (tp?.api_usd) toolCost += tp.api_usd * task.toolCalls * multiplier
  }

  const result: CostEstimate = {
    cheap: cheap + toolCost,
    balanced: balanced + toolCost,
    premium: premium + toolCost,
    selected: "balanced",
    selected_model: "",
    reasoning: `Estimated cost for ${task.complexity} task: ` +
      `cheap $${(cheap + toolCost).toFixed(4)}, ` +
      `balanced $${(balanced + toolCost).toFixed(4)}, ` +
      `premium $${(premium + toolCost).toFixed(4)}`,
  }

  return result
}

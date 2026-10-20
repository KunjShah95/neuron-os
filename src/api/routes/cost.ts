import { jsonResponse } from "../security"
import type { ApiRequest, ApiServerConfig } from "../types"

export interface CostSummary {
  total_spend_usd: number
  model_spend_usd: number
  tool_spend_usd: number
  budget_usd: number
  remaining_usd: number
  exceeded_budget: boolean
  percent_of_budget: number
  by_model: Array<{ model: string; totalCost: number; totalTokens: number; callCount: number }>
  by_session: Array<{ sessionId: string; totalCost: number; model: string; callCount: number }>
  history: Array<{ date: string; totalCost: number }>
}

export async function handleCostRoutes(req: ApiRequest, config: ApiServerConfig): Promise<Response | null> {
  const { method, pathname, searchParams } = req

  if (pathname === "/api/v1/cost" && method === "GET") {
    const { billingTracker } = await import("../../billing/tracker")

    const daysParam = Number(searchParams?.get("days") ?? "7")
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(Math.floor(daysParam), 365) : 7

    const totalSpend = billingTracker.getTotalSpend()
    const budgetLimit = billingTracker.getBudgetLimit()
    const remaining = Math.max(0, budgetLimit - totalSpend)

    const summary: CostSummary = {
      total_spend_usd: totalSpend,
      model_spend_usd: billingTracker.getModelSpend(),
      tool_spend_usd: billingTracker.getToolSpend(),
      budget_usd: budgetLimit,
      remaining_usd: remaining,
      exceeded_budget: billingTracker.hasExceededBudget(),
      percent_of_budget: budgetLimit > 0 ? (totalSpend / budgetLimit) * 100 : 0,
      by_model: billingTracker.getCostByModel(),
      by_session: billingTracker.getCostBySession(),
      history: billingTracker.getCostHistory(days),
    }

    return jsonResponse(200, summary, config, req)
  }

  return null
}

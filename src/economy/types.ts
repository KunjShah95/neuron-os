import { z } from "zod"

export const ToolPricing = z.object({
  tools: z.record(
    z.string(),
    z.object({
      api_usd: z.number().nonnegative().optional(),
      compute_usd_per_second: z.number().nonnegative().optional(),
      io_usd_per_mb: z.number().nonnegative().optional(),
      latency_p50_ms: z.number().nonnegative().optional(),
      latency_p99_ms: z.number().nonnegative().optional(),
      provider_specific: z
        .record(
          z.string(),
          z.object({
            api_usd: z.number().optional(),
          }),
        )
        .optional(),
    }),
  ),
  models: z.record(
    z.string(),
    z.object({
      prompt_usd_per_1k: z.number().nonnegative(),
      completion_usd_per_1k: z.number().nonnegative(),
      context_window: z.number().int().positive(),
      quality_tier: z.enum(["free", "cheap", "balanced", "premium"]),
      benchmark_score: z.number().min(0).max(1).optional(),
    }),
  ),
})

export type ToolPricing = z.infer<typeof ToolPricing>

export const CostEstimate = z.object({
  free: z.number(),
  cheap: z.number(),
  balanced: z.number(),
  premium: z.number(),
  selected: z.enum(["free", "cheap", "balanced", "premium"]),
  selected_model: z.string(),
  reasoning: z.string(),
})

export type CostEstimate = z.infer<typeof CostEstimate>

export const BudgetStatus = z.object({
  budget_usd: z.number(),
  spent_usd: z.number(),
  remaining_usd: z.number(),
  estimated_remaining_cost_usd: z.number(),
  over_budget: z.boolean(),
  recommendation: z.enum(["continue", "skip_optional", "abort"]),
})

export type BudgetStatus = z.infer<typeof BudgetStatus>

export const LeaderboardSubmission = z.object({
  run_id: z.string(),
  aegis_version: z.string(),
  model: z.string(),
  provider: z.string(),
  suite_version: z.string(),
  category_scores: z.record(z.string(), z.number().min(0).max(1)),
  total_cost_usd: z.number().nonnegative(),
  total_tasks: z.number().int().positive(),
  submitted_at: z.number(),
  submitter_github: z.string().optional(),
  git_hash: z.string().optional(),
})

export type LeaderboardSubmission = z.infer<typeof LeaderboardSubmission>

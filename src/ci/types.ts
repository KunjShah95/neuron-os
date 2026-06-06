import { z } from "zod"

export const RepoConfig = z.object({
  owner: z.string(),
  name: z.string(),
  auto_merge: z.boolean().default(false),
  model: z.string().default("claude-sonnet-4-6"),
  budget_usd: z.number().min(0).default(0.50),
  notify: z.array(z.string()).default([]),
  allowed_paths: z.array(z.string()).default([]),
  require_human_approval_comment: z.boolean().default(true),
})

export type RepoConfig = z.infer<typeof RepoConfig>

export const CiConfig = z.object({
  repos: z.array(RepoConfig).default([]),
  port: z.number().default(7117),
  hmac_key: z.string().optional(),
})

export type CiConfig = z.infer<typeof CiConfig>

export const CiFixRequest = z.object({
  repo: z.string(),
  run_id: z.string(),
  head_sha: z.string().optional(),
  logs_url: z.string().optional(),
  budget_usd: z.number().optional(),
})

export type CiFixRequest = z.infer<typeof CiFixRequest>

export const CiFixStatus = z.object({
  run_id: z.string(),
  repo: z.string(),
  status: z.enum(["queued", "investigating", "fixing", "pr_created", "merged", "failed", "stuck"]),
  pr_url: z.string().optional(),
  pr_number: z.number().optional(),
  branch: z.string().optional(),
  cost_usd: z.number().default(0),
  error: z.string().optional(),
  started_at: z.number(),
  completed_at: z.number().optional(),
})

export type CiFixStatus = z.infer<typeof CiFixStatus>

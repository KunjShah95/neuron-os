import { z } from "zod"

export const Finding = z.object({
  id: z.string(),
  task_id: z.string(),
  session_id: z.string(),
  finding_type: z.enum(["correctness", "security", "performance", "completeness", "style"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string(),
  reproduction: z.string(),
  reproduction_verified: z.boolean().default(false),
  suggested_fix: z.string().optional(),
  red_team_agent_id: z.string(),
  red_team_model: z.string(),
  ts: z.number(),
  ratcheted: z.boolean().default(false),
  ratchet_case_path: z.string().optional(),
  incomplete: z.boolean().default(false),
  parse_error: z.boolean().default(false),
})

export const FindingInput = z.object({
  id: z.string(),
  task_id: z.string(),
  session_id: z.string(),
  finding_type: z.enum(["correctness", "security", "performance", "completeness", "style"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string(),
  reproduction: z.string(),
  reproduction_verified: z.boolean().default(false),
  suggested_fix: z.string().optional(),
  red_team_agent_id: z.string(),
  red_team_model: z.string(),
  ts: z.number(),
  ratcheted: z.boolean().default(false),
  ratchet_case_path: z.string().optional(),
})

export type Finding = z.infer<typeof Finding>

export const AdversarialConfig = z.object({
  enabled: z.boolean().default(false),
  red_team_agent_type: z.string().default("adversarial"),
  red_team_model: z.string().default("claude-opus-4-6"),
  cost_budget_ratio: z.number().min(0).max(1).default(0.2),
  ratchet: z.boolean().default(true),
  classify_severity_threshold: z.enum(["low", "medium", "high"]).default("medium"),
  notify_severity: z.enum(["medium", "high", "critical"]).default("high"),
})

export type AdversarialConfig = z.infer<typeof AdversarialConfig>

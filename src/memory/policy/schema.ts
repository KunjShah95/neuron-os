import { z } from "zod"

export const AllowRule = z.object({
  principal: z.string(),
  path_filter: z.string().optional(),
  tools_allowed: z.array(z.string()).default(["*"]),
  expires_at: z.number().optional(),
})

export const DenyRule = z.object({
  principal: z.string(),
  path_filter: z.string().optional(),
  reason: z.string().optional(),
})

export const MemoryPolicy = z.object({
  namespace: z.string(),
  owner: z.string(),
  default: z.enum(["allow", "deny"]).default("deny"),
  allow: z.array(AllowRule).default([]),
  deny: z.array(DenyRule).default([]),
})

export type MemoryPolicy = z.infer<typeof MemoryPolicy>
export type AllowRule = z.infer<typeof AllowRule>
export type DenyRule = z.infer<typeof DenyRule>

export const Principal = z.object({
  team: z.string().optional(),
  agent: z.string().optional(),
  role: z.string().optional(),
  group: z.string().optional(),
})

export type Principal = z.infer<typeof Principal>

export const AuditEntry = z.object({
  ts: z.number(),
  event: z.enum(["read", "grant", "revoke", "grant_expired", "deny"]),
  requester: z.string(),
  namespace: z.string(),
  path: z.string().optional(),
  tool: z.string().optional(),
  allowed: z.boolean(),
  rule_id: z.string().optional(),
  reason: z.string().optional(),
  result_count: z.number().optional(),
})

export type AuditEntry = z.infer<typeof AuditEntry>

export interface Decision {
  allowed: boolean
  reason: string
  rule_id?: string
}

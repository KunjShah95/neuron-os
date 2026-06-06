import { z } from "zod"

const TriggerManual = z.object({ type: z.literal("manual") })
const TriggerCron = z.object({ type: z.literal("cron"), schedule: z.string() })
const TriggerFs = z.object({ type: z.literal("fs"), watch: z.array(z.string()) })
const TriggerWebhook = z.object({ type: z.literal("webhook"), path: z.string(), auth: z.enum(["hmac", "none"]).default("hmac") })

export const AgentSpec = z.object({
  apiVersion: z.literal("aegis/v1"),
  kind: z.literal("Agent"),
  from: z.string().optional(),
  metadata: z.object({
    name: z.string().regex(/^[a-z0-9-]+$/),
    labels: z.record(z.string(), z.string()).default({}),
    annotations: z.record(z.string(), z.string()).default({}),
  }),
  spec: z.object({
    type: z.enum(["build", "plan", "read", "write", "test", "validate", "review", "debug", "document", "refactor", "deploy", "monitor", "explore", "main"]),
    model: z.object({
      provider: z.string(),
      name: z.string(),
      temperature: z.number().min(0).max(2).default(0),
      max_tokens: z.number().optional(),
      top_p: z.number().min(0).max(1).optional(),
    }),
    system_prompt: z.object({
      template: z.string().optional(),
      file: z.string().optional(),
      append_skills: z.boolean().default(true),
      append_user_model: z.boolean().default(true),
    }).default({ append_skills: true, append_user_model: true }),
    tools: z.object({
      allow: z.array(z.string()).default([]),
      deny: z.array(z.string()).default([]),
      toolset: z.string().optional(),
    }).default({ allow: [], deny: [] }),
    context_files: z.array(z.string()).default([]),
    skills: z.array(z.string()).default([]),
    memory: z.object({
      namespace: z.string().default("default"),
      ttl_days: z.number().optional(),
      recall_top_k: z.number().default(3),
    }).default({ namespace: "default", recall_top_k: 3 }),
    hooks: z.array(z.object({
      event: z.enum(["spawn", "kill", "message", "error", "exit"]),
      phase: z.enum(["pre", "post"]),
      command: z.string(),
    })).default([]),
    env: z.record(z.string(), z.string()).default({}),
    budget: z.object({
      usd: z.number().positive().optional(),
      tokens: z.number().positive().optional(),
    }).optional(),
    triggers: z.array(z.discriminatedUnion("type", [TriggerManual, TriggerCron, TriggerFs, TriggerWebhook])).default([{ type: "manual" }]),
  }),
})

export type AgentSpec = z.infer<typeof AgentSpec>

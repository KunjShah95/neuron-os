/**
 * marketplace/schema — Zod validation for agent configurations.
 *
 * Validates agent.yaml files against the AgentConfig schema,
 * providing clear error messages for invalid configurations.
 */

import { z } from "zod"
import type { AgentConfig } from "./types"

const AgentTypeSchema = z.enum([
  "coder",
  "reviewer",
  "planner",
  "researcher",
  "analyst",
  "creator",
  "custom",
])

const SandboxTypeSchema = z.enum(["none", "docker", "local", "remote"])

const ToolSpecSchema = z.object({
  name: z.string().min(1, "Tool name is required"),
  description: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
})

export const AgentConfigSchema = z.object({
  name: z
    .string()
    .min(1, "Agent name is required")
    .max(64, "Agent name must be ≤64 characters")
    .regex(
      /^[a-z0-9][a-z0-9._-]*$/,
      "Name must be lowercase alphanumeric with dots, hyphens, or underscores",
    ),
  type: AgentTypeSchema.default("custom"),
  description: z
    .string()
    .min(10, "Description must be at least 10 characters")
    .max(512, "Description must be ≤512 characters"),
  tools: z.array(ToolSpecSchema).default([]),
  prompt_template: z
    .string()
    .min(1, "Prompt template is required")
    .max(32768, "Prompt template must be ≤32KB"),
  budget_usd: z
    .number()
    .min(0, "Budget must be non-negative")
    .max(1000, "Budget must be ≤$1000")
    .default(0.1),
  sandbox: SandboxTypeSchema.default("none"),
  provider: z.string().min(1, "Provider is required").default("local"),
  tags: z.array(z.string().max(32)).max(20, "Maximum 20 tags").default([]),
})

export type ValidatedAgentConfig = z.infer<typeof AgentConfigSchema>

/**
 * Validate raw data against the AgentConfig schema.
 * Returns a result object with either the parsed config or validation errors.
 */
export function validateAgentConfig(data: unknown): {
  success: boolean
  config?: AgentConfig
  errors?: string[]
} {
  const result = AgentConfigSchema.safeParse(data)

  if (result.success) {
    return { success: true, config: result.data as AgentConfig }
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "<root>"
    return `${path}: ${issue.message}`
  })

  return { success: false, errors }
}

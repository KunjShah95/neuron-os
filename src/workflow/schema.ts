/**
 * workflow/schema — Zod validation schemas for workflow YAML.
 *
 * Provides runtime validation of workflow configuration files with
 * detailed error messages for each field.
 */

import { z } from "zod"
import type { WorkflowValidationError } from "./types"
import { AGENT_TYPES } from "../agent/agent-types"
import type { MeshTopology } from "../mesh/types"

const VALID_AGENT_TYPES = Object.keys(AGENT_TYPES) as [string, ...string[]]
const VALID_TOPOLOGIES: [MeshTopology, ...MeshTopology[]] = [
  "sequential",
  "fan-out",
  "debate",
  "ensemble",
  "supervisor",
]

// ── Schemas ────────────────────────────────────────────────────────────

export const WorkflowSandboxSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(["none", "filesystem", "process", "docker"]).optional(),
  allowedPaths: z.array(z.string()).optional(),
  allowedCommands: z.array(z.string()).optional(),
})

export const WorkflowNodeSchema = z.object({
  id: z
    .string()
    .min(1, "Node id is required")
    .regex(/^[a-zA-Z0-9_-]+$/, "Node id must be alphanumeric with hyphens/underscores"),
  type: z.enum(VALID_AGENT_TYPES, {
    message: `Must be one of: ${VALID_AGENT_TYPES.join(", ")}`,
  }),
  tools: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  budget_usd: z.number().min(0).optional(),
  prompt_template: z.string().optional(),
  sandbox: WorkflowSandboxSchema.optional(),
})

export const WorkflowEdgeSchema = z.object({
  from: z.string().min(1, "Edge 'from' is required"),
  to: z.string().min(1, "Edge 'to' is required"),
  condition: z.string().optional(),
})

export const WorkflowConfigSchema = z.object({
  name: z.string().min(1, "Workflow name is required"),
  description: z.string().optional(),
  topology: z.enum(VALID_TOPOLOGIES, {
    message: `Must be one of: ${VALID_TOPOLOGIES.join(", ")}`,
  }),
  budget_usd: z.number().min(0).optional(),
  timeout_minutes: z.number().min(1).optional(),
  nodes: z.array(WorkflowNodeSchema).min(1, "At least one node is required"),
  edges: z.array(WorkflowEdgeSchema).optional(),
})

// ── Validate function ──────────────────────────────────────────────────

export function validateWorkflowConfig(data: unknown): {
  valid: boolean
  errors: WorkflowValidationError[]
  warnings: WorkflowValidationError[]
} {
  const result = WorkflowConfigSchema.safeParse(data)

  if (result.success) {
    return { valid: true, errors: [], warnings: [] }
  }

  const errors: WorkflowValidationError[] = result.error.issues.map((issue) => ({
    message: issue.message,
    severity: "error" as const,
    field: issue.path.join("."),
  }))

  return { valid: false, errors, warnings: [] }
}

export function validateWorkflowNode(data: unknown): {
  valid: boolean
  errors: WorkflowValidationError[]
  warnings: WorkflowValidationError[]
} {
  const result = WorkflowNodeSchema.safeParse(data)

  if (result.success) {
    return { valid: true, errors: [], warnings: [] }
  }

  const errors: WorkflowValidationError[] = result.error.issues.map((issue) => ({
    message: issue.message,
    severity: "error" as const,
    field: issue.path.join("."),
  }))

  return { valid: false, errors, warnings: [] }
}

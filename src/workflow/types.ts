/**
 * workflow/types — Type definitions for the workflow builder.
 *
 * Workflows are YAML-defined agent pipelines that map directly to mesh
 * topologies. Each node is an agent with tools and dependencies; edges
 * define the execution order. The executor builds a DAG and maps it to
 * MeshConfig for the orchestrator.
 */

import type { AgentTypeName } from "../agent/agent-types"
import type { MeshTopology } from "../mesh/types"

// ── Workflow Config ────────────────────────────────────────────────────

export interface WorkflowConfig {
  name: string
  description?: string
  topology: MeshTopology
  budget_usd?: number
  timeout_minutes?: number
  nodes: WorkflowNode[]
  edges?: WorkflowEdge[]
}

// ── Workflow Node ──────────────────────────────────────────────────────

export interface WorkflowNode {
  id: string
  type: AgentTypeName
  tools?: string[]
  depends_on?: string[]
  provider?: string
  model?: string
  budget_usd?: number
  prompt_template?: string
  sandbox?: WorkflowSandbox
}

// ── Workflow Edge ──────────────────────────────────────────────────────

export type WorkflowEdge = {
  from: string
  to: string
  condition?: string
}

// ── Sandbox Config ─────────────────────────────────────────────────────

export interface WorkflowSandbox {
  enabled: boolean
  type?: "none" | "filesystem" | "process" | "docker"
  allowedPaths?: string[]
  allowedCommands?: string[]
}

// ── Validation ─────────────────────────────────────────────────────────

export type ValidationErrorSeverity = "error" | "warning"

export interface WorkflowValidationError {
  message: string
  severity: ValidationErrorSeverity
  nodeId?: string
  field?: string
}

export interface WorkflowValidationResult {
  valid: boolean
  errors: WorkflowValidationError[]
  warnings: WorkflowValidationError[]
}

// ── Execution ──────────────────────────────────────────────────────────

export type WorkflowNodeStatus = "pending" | "running" | "completed" | "failed" | "skipped"

export interface WorkflowNodeResult {
  nodeId: string
  status: WorkflowNodeStatus
  output?: string
  error?: string
  durationMs: number
  startedAt?: string
  completedAt?: string
}

export interface WorkflowRunResult {
  workflowName: string
  status: "running" | "completed" | "failed"
  startedAt: string
  completedAt?: string
  totalDurationMs: number
  nodeResults: WorkflowNodeResult[]
  summary: string
}

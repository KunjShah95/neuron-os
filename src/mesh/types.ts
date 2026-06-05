/**
 * mesh/types — Topology and type definitions for multi-agent coordination.
 *
 * Defines the communication patterns agents can use to collaborate:
 * - Sequential: Agent A runs, then Agent B, then Agent C
 * - Fan-out: One agent spawns N parallel agents, waits for all
 * - Debate: Multiple agents solve the same problem, compare results
 * - Ensemble: Run same task with different models, vote on output
 * - Supervisor: One agent delegates work to sub-agents and reviews
 */

import type { Outcome } from "../experience/store"

// ── Agent Roles ───────────────────────────────────────────────────────

export type AgentRole =
  | "researcher"    // Explores codebase, gathers context
  | "implementer"   // Makes changes to the codebase
  | "reviewer"      // Reviews changes for quality
  | "tester"        // Verifies changes work
  | "architect"     // Designs the approach
  | "debugger"      // Fixes specific issues
  | "coordinator"   // Orchestrates other agents

// ── Topologies ────────────────────────────────────────────────────────

export type MeshTopology =
  | "sequential"
  | "fan-out"
  | "debate"
  | "ensemble"
  | "supervisor"

// ── Agent Node ────────────────────────────────────────────────────────

export interface MeshAgent {
  id: string
  role: AgentRole
  goal: string
  model?: string           // Specific model for this agent
  provider?: string        // Specific provider for this agent
  dependsOn: string[]      // IDs of agents that must complete first
  timeout?: number         // Max execution time in ms
  config?: Record<string, unknown>
}

// ── Topology Configuration ────────────────────────────────────────────

export interface SequentialConfig {
  topology: "sequential"
  agents: MeshAgent[]
}

export interface FanOutConfig {
  topology: "fan-out"
  coordinator: MeshAgent
  workers: MeshAgent[]
  strategy: "all" | "first-past" | "majority"
}

export interface DebateConfig {
  topology: "debate"
  question: string
  debaters: MeshAgent[]
  rounds: number
  synthesis: "pick-best" | "merge" | "vote"
}

export interface EnsembleConfig {
  topology: "ensemble"
  task: string
  runs: Array<{
    agent: MeshAgent
    model: string
  }>
  aggregation: "vote" | "merge" | "pick-best"
}

export interface SupervisorConfig {
  topology: "supervisor"
  supervisor: MeshAgent
  subAgents: MeshAgent[]
  reviewRequired: boolean
}

export type MeshConfig =
  | SequentialConfig
  | FanOutConfig
  | DebateConfig
  | EnsembleConfig
  | SupervisorConfig

// ── Results ───────────────────────────────────────────────────────────

export interface MeshAgentResult {
  agentId: string
  role: AgentRole
  goal: string
  outcome: Outcome
  summary: string
  output: string
  durationMs: number
  error?: string
  actions?: number
}

export interface MeshRunResult {
  id: string
  topology: MeshTopology
  startedAt: string
  completedAt: string
  totalDurationMs: number
  agentResults: MeshAgentResult[]
  overallOutcome: Outcome
  summary: string
}

// ── Evaluator ─────────────────────────────────────────────────────────

export type EvaluationMetric =
  | "tests-pass"      // Test suite passed/failed
  | "lint-clean"      // Linter produced no errors
  | "typecheck"       // TypeScript compilation passed
  | "build"           // Build succeeded
  | "custom-script"   // Custom evaluation script
  | "manual"          // Human review

export interface EvaluationCriteria {
  metric: EvaluationMetric
  script?: string      // For custom-script metric
  threshold?: number   // Success threshold (e.g., 80% test pass)
  maxRetries?: number
}

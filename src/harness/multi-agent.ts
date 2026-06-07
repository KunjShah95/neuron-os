/**
 * src/harness/multi-agent.ts
 *
 * Multi-Agent Orchestration Harness — defines types, coordination
 * patterns, and metrics for evaluating multi-agent systems.
 *
 * Phase 7: Supports sequential, parallel, debate, hierarchical,
 * voting, and refine coordination patterns.
 */

import type { TestCase } from "./types"

// ── Coordination Patterns ───────────────────────────────────────

export type CoordinationPattern =
  | "sequential" // Agent A → Agent B → Agent C (pipeline)
  | "parallel" // Agents A, B, C run simultaneously, results merged
  | "debate" // Multiple agents discuss, reach consensus
  | "hierarchical" // Orchestrator delegates to sub-agents
  | "voting" // Each agent votes, majority wins
  | "refine" // Agent A produces, Agent B critiques, Agent A refines

// ── Agent Role Definition ───────────────────────────────────────

export interface MultiAgentRole {
  /** Role identifier (e.g. "planner", "coder", "reviewer") */
  role: string
  /** Optional system prompt override */
  systemPrompt?: string
  /** Model override per agent */
  model?: string
  /** Tools this agent is allowed to use */
  tools?: string[]
}

// ── Handoff Configuration ───────────────────────────────────────

export interface HandoffConfig {
  /** Communication protocol */
  protocol: "message" | "shared_context" | "file"
  /** Maximum back-and-forth rounds (for debate/refine) */
  maxRounds?: number
  /** Per-handoff timeout in ms */
  timeout?: number
}

// ── Consensus Configuration ─────────────────────────────────────

export interface ConsensusConfig {
  /** Whether consensus is required */
  required: boolean
  /** Agreement threshold (e.g. 0.7 = 70% agreement) */
  threshold: number
  /** Agent role that breaks ties */
  tiebreaker?: string
}

// ── Multi-Agent Test ────────────────────────────────────────────

export interface MultiAgentTest extends TestCase {
  /** Coordination pattern */
  coordinationPattern: CoordinationPattern
  /** Agent role definitions */
  agentRoles: MultiAgentRole[]
  /** Handoff configuration */
  handoff: HandoffConfig
  /** Consensus requirements */
  consensus?: ConsensusConfig
  /** Metrics to track during evaluation */
  trackMetrics?: MultiAgentMetric[]
}

export type MultiAgentMetric =
  | "handoff_accuracy"
  | "context_preservation"
  | "consensus_quality"
  | "parallel_efficiency"
  | "task_decomposition"
  | "agent_contribution"
  | "convergence_speed"

// ── Coordination Metrics Result ─────────────────────────────────

export interface CoordinationMetrics {
  /** Pattern used */
  pattern: CoordinationPattern
  /** How many handoffs occurred */
  totalHandoffs: number
  /** % of handoffs where context passed correctly */
  handoffAccuracy: number
  /** How much context was lost per handoff (0.0–1.0) */
  contextLossScore: number

  // Consensus metrics
  /** Rounds to reach consensus (if applicable) */
  convergenceRounds: number | null
  /** How stable the consensus was */
  consensusStability: number | null
  /** % of time agents disagreed */
  disagreementRate: number | null

  // Efficiency metrics
  /** Speedup vs sequential execution */
  parallelSpeedup: number | null
  /** % of agents actually contributing */
  agentUtilization: number
  /** Extra time spent coordinating vs working */
  coordinationOverhead: number | null

  // Quality metrics
  /** How well sub-results combine */
  outputCoherence: number | null
  /** Task decomposition quality (hierarchical only) */
  decompositionQuality: number | null
  /** Gini coefficient of agent contributions */
  contributionBalance: number
}

// ── Multi-Agent Evaluation Report ───────────────────────────────

export interface MultiAgentEvalReport {
  testId: string
  testName: string
  pattern: CoordinationPattern
  agentCount: number
  totalRounds: number
  totalDurationMs: number
  totalCost: number
  coordinationMetrics: CoordinationMetrics
  perAgentMetrics: AgentMetrics[]
  consensusReached: boolean | null
  finalOutput: string
  errors: string[]
}

export interface AgentMetrics {
  role: string
  model: string
  calls: number
  durationMs: number
  tokensUsed: number
  cost: number
  contribution: number // 0.0–1.0 share of total work
  handoffsInitiated: number
  handoffsReceived: number
  errors: number
}

// ── Predefined Test Scenarios ───────────────────────────────────

export const MULTI_AGENT_SCENARIOS: Array<{
  name: string
  pattern: CoordinationPattern
  description: string
  roles: string[]
}> = [
  {
    name: "Spec → Code → Review",
    pattern: "sequential",
    description: "Architect writes spec, engineer implements, reviewer critiques",
    roles: ["architect", "engineer", "reviewer"],
  },
  {
    name: "Parallel Generation",
    pattern: "parallel",
    description: "Multiple writers generate solutions, selector picks best",
    roles: ["writer-a", "writer-b", "writer-c", "selector"],
  },
  {
    name: "Technical Debate",
    pattern: "debate",
    description: "Two agents argue competing approaches, judge decides",
    roles: ["proponent", "opponent", "judge"],
  },
  {
    name: "Task Decomposition",
    pattern: "hierarchical",
    description: "Supervisor decomposes task, sub-agents execute, synthesizer merges",
    roles: ["supervisor", "sub-agent-1", "sub-agent-2", "synthesizer"],
  },
  {
    name: "Majority Vote",
    pattern: "voting",
    description: "Multiple agents generate answers independently, majority wins",
    roles: ["voter-1", "voter-2", "voter-3", "tally"],
  },
  {
    name: "Critique Loop",
    pattern: "refine",
    description: "Producer generates, critic provides feedback, producer improves",
    roles: ["producer", "critic"],
  },
]

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Create a multi-agent test case from a scenario definition.
 */
export function createMultiAgentTest(
  scenario: (typeof MULTI_AGENT_SCENARIOS)[number],
  prompt: string,
  overrides?: Partial<MultiAgentTest>,
): MultiAgentTest {
  return {
    id: `multi-${scenario.pattern}-${Date.now().toString(36)}`,
    name: scenario.name,
    prompt,
    category: "capability",
    priority: "high",
    tags: ["multi-agent", scenario.pattern, ...scenario.roles],
    timeout: 300000,
    coordinationPattern: scenario.pattern,
    agentRoles: scenario.roles.map((role) => ({
      role,
      tools:
        role === "supervisor" || role === "selector" || role === "judge"
          ? ["read", "write", "think"]
          : ["read", "write", "bash", "glob"],
    })),
    handoff: {
      protocol: "message",
      maxRounds: scenario.pattern === "debate" || scenario.pattern === "refine" ? 5 : 1,
      timeout: 60000,
    },
    consensus:
      scenario.pattern === "debate" || scenario.pattern === "voting" ? { required: true, threshold: 0.6 } : undefined,
    trackMetrics: ["handoff_accuracy", "context_preservation", "consensus_quality"],
    ...overrides,
  }
}

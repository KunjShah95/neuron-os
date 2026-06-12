import type { Subprocess } from "bun"
import type { AgentTypeName, ToolPermission } from "./agent-types"
import type { IsolationLevel } from "../sandbox/types"

// ── Lifecycle states ──────────────────────────────────────────────────
export type AgentStatus = "spawning" | "running" | "idle" | "busy" | "hung" | "stopping" | "stopped" | "error"

// ── Agent definition ──────────────────────────────────────────────────
export interface AgentDef {
  name: string
  /** Path to the worker script (relative to project root) */
  script: string
  /** Agent type (build, plan, read, write, test, etc.) */
  agentType?: AgentTypeName
  /** Tool permissions (overrides agent type defaults) */
  tools?: ToolPermission[]
  /** Environment variables to set */
  env?: Record<string, string>
  /** Arguments to pass to the worker */
  args?: string[]
  /** Graceful shutdown timeout in ms before SIGKILL */
  stopTimeout?: number
  /** Resource limits */
  limits?: { cpu?: number; memoryMB?: number }
  /** Tags for filtering / grouping */
  tags?: string[]
  /** Auto-recovery config (empty = no recovery) */
  recovery?: RecoveryConfig
  /** Zero-trust isolation level (overrides agent type default) */
  isolationLevel?: IsolationLevel
  /** Agent goal / task description */
  goal?: string
  /**
   * Budget cap in USD for this agent's entire lifecycle.
   * When set, the agent self-throttles: if cumulative spend exceeds
   * the budget, optional tool calls are skipped and the agent may
   * abort expensive operations.
   * @default undefined (unlimited)
   */
  budgetUsd?: number
}

// ── Auto-recovery ─────────────────────────────────────────────────────
export interface RecoveryConfig {
  /** Max consecutive retries before giving up (default 5) */
  maxRetries?: number
  /** Base backoff delay in ms (default 1000) */
  backoffMs?: number
  /** Backoff multiplier per retry (default 2) */
  backoffMultiplier?: number
  /** Max backoff delay cap in ms (default 60000) */
  backoffMax?: number
}

export interface RecoveryState {
  /** Current retry attempt (0 = first) */
  attempt: number
  /** Whether recovery is active */
  active: boolean
  /** Timer handle for delayed retry */
  timerId: ReturnType<typeof setTimeout> | null
  /** Timestamp of the last recovery trigger */
  lastRecoveryAt: number | null
}

// ── Runtime instance ──────────────────────────────────────────────────
export interface AgentInstance {
  id: string
  def: AgentDef
  status: AgentStatus
  process: Subprocess
  spawnTime: number
  lastActivity: number
  log: AgentLogEntry[]
  pid: number
  exitCode: number | null
  metadata: Record<string, string>
}

// ── Logging ───────────────────────────────────────────────────────────
export type AgentLogLevel = "info" | "success" | "warn" | "error" | "debug" | "data"

export interface AgentLogEntry {
  level: AgentLogLevel
  text: string
  timestamp: number
  stream?: "stdout" | "stderr"
}

// ── IPC message protocol (JSON-line over stdin/stdout) ────────────────
export type AgentIpcDirection = "from-parent" | "from-child"

export interface AgentIpcMessage {
  type: string
  id?: string
  payload?: unknown
  timestamp: number
}

// ── Events emitted by AgentManager ────────────────────────────────────
export type AgentEventType =
  | "agent:spawned"
  | "agent:ready"
  | "agent:stopped"
  | "agent:error"
  | "agent:log"
  | "agent:heartbeat"
  | "agent:exit"
  | "agent:recovering"
  | "agent:recovered"
  | "agent:maxRetries"
  | "agent:result"

export interface AgentEvent {
  type: AgentEventType
  agentId: string
  data?: unknown
}

// ── Lifecycle hook types ──────────────────────────────────────────────
export type HookPhase = "pre" | "post"
export type HookPoint = "spawn" | "kill" | "message" | "error" | "exit" | "result"

export type HookFn = (ctx: HookContext) => void | Promise<void>

export interface HookContext {
  agentId: string
  instance: AgentInstance
  phase: HookPhase
  point: HookPoint
  /** Optional data from the triggering event */
  data?: unknown
  /** Mutable metadata that hooks can read/write */
  meta: Record<string, unknown>
}

// ── Dispatch message types (worker-to-worker routing) ────────────────

/**
 * Payload for a dispatched task to another agent worker.
 * The target agent executes the goal and replies with dispatch-result.
 */
export interface DispatchPayload {
  goal: string
  context?: string
  sourceAgentId: string
  timeoutMs?: number
}

/**
 * Result payload returned after a dispatched task completes.
 */
export interface DispatchResultPayload {
  success: boolean
  output: string
  durationMs: number
  error?: string
}

// ── Manager options ───────────────────────────────────────────────────
export interface AgentManagerOptions {
  /** Called for every agent event (e.g. to bridge to TUI store) */
  onEvent?: (event: AgentEvent) => void
  /** Heartbeat interval in ms (0 to disable) */
  heartbeatMs?: number
  /** Default stop timeout in ms */
  defaultStopTimeout?: number
}

import type {
  AgentDef,
  AgentInstance,
  AgentLogEntry,
  AgentLogLevel,
  AgentIpcMessage,
  AgentEvent,
  AgentEventType,
  RecoveryConfig,
  RecoveryState,
} from "../types"
import type { HookRegistry } from "../hooks"
import { createLogger } from "../../cli/logger"
import { DockerSandbox } from "../../sandbox/docker"
import type { BudgetGuard } from "../../economy/budget-guard"

export const log = createLogger("agent:manager")

let dockerSandbox: DockerSandbox | null = null

export function getDockerSandbox(): DockerSandbox {
  if (!dockerSandbox) {
    dockerSandbox = new DockerSandbox({
      enabled: true,
      networkEnabled: false,
      memoryLimit: "2g",
      readOnlyRoot: true,
    })
  }
  return dockerSandbox
}

export function cleanupSandbox(id: string): void {
  if (dockerSandbox) {
    dockerSandbox.destroyContainer(id)
  }
}

export function cleanupAllSandboxes(): void {
  if (dockerSandbox) {
    dockerSandbox.cleanup()
  }
}

export function now(): number {
  return Date.now()
}

export const DEFAULT_RECOVERY: Required<RecoveryConfig> = {
  maxRetries: 5,
  backoffMs: 1_000,
  backoffMultiplier: 2,
  backoffMax: 60_000,
}

export interface ManagerContext {
  agents: Map<string, AgentInstance>
  hooks: HookRegistry
  recoveryStates: Map<string, RecoveryState>
  listeners: Set<(event: AgentEvent) => void>
  prewarmedTypes: Map<string, number>
  PREWARM_TTL: number
  PREWARM_MAX_CONCURRENT: number
  PREWARM_BACKOFF_BASE_MS: number
  PREWARM_BACKOFF_MAX_MS: number
  PREWARM_SCRIPT: string
  prewarmShutdownTimers: Map<string, ReturnType<typeof setTimeout>>
  prewarmStats: { hits: number; misses: number; promotions: number }
  prewarmBackoff: Map<string, number>
  prewarmFailedAttempts: Map<string, number>
  abortControllers: Map<string, AbortController>
  budgetGuards: Map<string, BudgetGuard>
  emit(type: AgentEventType, agentId: string, data?: unknown): void
  makeLog(level: AgentLogLevel, text: string): AgentLogEntry
  createPendingInstance(id: string, def: AgentDef): AgentInstance
  spawn(def: AgentDef): Promise<string>
  spawnDistributed(def: AgentDef): Promise<string | null>
  kill(id: string, timeoutMs?: number): Promise<void>
  sendIpc(id: string, msg: AgentIpcMessage): Promise<void>
  cancelRecovery(id: string): void
  cancelPrewarmTimeout(id: string): void
  tryPromoteWarmAgent(agentType: string): boolean
  triggerRecovery(id: string, exitCode: number): boolean
  readStream(id: string, stream: ReadableStream<Uint8Array>, label: "stdout" | "stderr"): void
  waitForReady(id: string, timeoutMs: number): Promise<void>
}

import type { Subprocess } from "bun"
import type {
  AgentDef,
  AgentInstance,
  AgentLogEntry,
  AgentLogLevel,
  AgentIpcMessage,
  AgentEvent,
  AgentManagerOptions,
  AgentEventType,
  RecoveryConfig,
  RecoveryState,
} from "../types"
import { HookRegistry } from "../hooks"
import { getAllAgentTypes, type AgentType } from "../agent-types"
import type { IsolationLevel } from "../../sandbox/types"
import type { BudgetGuard } from "../../economy/budget-guard"
import { cleanupAllSandboxes, now, type ManagerContext } from "./state"
import { getIsolationLevelFor, killAgent, spawnAgent, spawnDistributedAgent } from "./lifecycle"
import { handleIpcMessage, readAgentStream, routeIpcMessage, sendIpcMessage, waitForAgentReady } from "./ipc"
import { calculateBackoffDelay, cancelAgentRecovery, performAgentRecovery, triggerAgentRecovery } from "./recovery"
import {
  computePrewarmStats,
  listPrewarmedTypes,
  promoteWarmAgent,
  runPrewarmTick,
  scheduleWarmAgentShutdown,
} from "./prewarm"

export class AgentManager {
  readonly agents = new Map<string, AgentInstance>()

  readonly hooks = new HookRegistry()

  private recoveryStates = new Map<string, RecoveryState>()

  private listeners: Set<(event: AgentEvent) => void> = new Set()

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  private dreamTickTimer: ReturnType<typeof setInterval> | null = null

  private prewarmTimer: ReturnType<typeof setInterval> | null = null

  private prewarmedTypes = new Map<string, number>()

  private readonly PREWARM_TTL = 30 * 60 * 1000

  private readonly PREWARM_MAX_CONCURRENT = 2

  private prewarmShutdownTimers = new Map<string, ReturnType<typeof setTimeout>>()

  private prewarmStats = { hits: 0, misses: 0, promotions: 0 }

  private prewarmBackoff = new Map<string, number>()

  private prewarmFailedAttempts = new Map<string, number>()

  private readonly PREWARM_BACKOFF_BASE_MS = 60_000

  private readonly PREWARM_BACKOFF_MAX_MS = 3_600_000

  private readonly PREWARM_SCRIPT = "src/agent/warm-worker.ts"

  private abortControllers = new Map<string, AbortController>()

  private budgetGuards = new Map<string, BudgetGuard>()

  constructor(opts: AgentManagerOptions = {}) {
    if (opts.onEvent) {
      this.listeners.add(opts.onEvent)
    }
    const hbMs = opts.heartbeatMs ?? 5_000

    if (hbMs > 0) {
      this.heartbeatTimer = setInterval(() => this.checkHeartbeats(), hbMs * 2)
      this.heartbeatTimer.unref()
    }

    this.dreamTickTimer = setInterval(() => this.dreamTick(), 60_000)
    this.dreamTickTimer.unref()

    this.prewarmTimer = setInterval(() => this.prewarmTick(), 300_000)
    this.prewarmTimer.unref()

    void [
      this.prewarmedTypes,
      this.PREWARM_TTL,
      this.PREWARM_MAX_CONCURRENT,
      this.PREWARM_BACKOFF_BASE_MS,
      this.PREWARM_BACKOFF_MAX_MS,
      this.PREWARM_SCRIPT,
      this.prewarmStats,
      this.prewarmBackoff,
      this.prewarmFailedAttempts,
      this.abortControllers,
      this.budgetGuards,
      this.getIsolationLevel,
      this.autoShutdownWarmAgent,
      this.tryPromoteWarmAgent,
      this.calculateBackoff,
      this.triggerRecovery,
      this.performRecovery,
      this.createPendingInstance,
      this.readStream,
      this.handleIpcMessage,
      this.waitForReady,
    ]
  }

  private ctx(): ManagerContext {
    return this as unknown as ManagerContext
  }

  onEvent(cb: (event: AgentEvent) => void): void {
    this.listeners.add(cb)
  }

  offEvent(cb: (event: AgentEvent) => void): void {
    this.listeners.delete(cb)
  }

  private getIsolationLevel(def: AgentDef): IsolationLevel {
    return getIsolationLevelFor(def)
  }

  async spawn(def: AgentDef): Promise<string> {
    return spawnAgent(this.ctx(), def)
  }

  private async dreamTick(): Promise<void> {
    try {
      const { dreamEngine } = await import("../../dream/engine")
      dreamEngine.tick()
    } catch {
      /* non-fatal */
    }
  }

  private async prewarmTick(): Promise<void> {
    await runPrewarmTick(this.ctx())
  }

  private autoShutdownWarmAgent(agentId: string, agentType: string): void {
    scheduleWarmAgentShutdown(this.ctx(), agentId, agentType)
  }

  cancelPrewarmTimeout(agentId: string): void {
    const timer = this.prewarmShutdownTimers.get(agentId)
    if (timer) {
      clearTimeout(timer)
      this.prewarmShutdownTimers.delete(agentId)
    }
  }

  private tryPromoteWarmAgent(agentType: string): boolean {
    return promoteWarmAgent(this.ctx(), agentType)
  }

  getPrewarmStats(): { hits: number; misses: number; promotions: number; hitRate: number; hitRateFormatted: string } {
    return computePrewarmStats(this.ctx())
  }

  getPrewarmedTypes(): Array<{ type: string; ttlRemainingMs: number }> {
    return listPrewarmedTypes(this.ctx())
  }

  async runPrewarmAnalysis(): Promise<void> {
    await this.prewarmTick()
  }

  private calculateBackoff(cfg: Required<RecoveryConfig>, attempt: number): number {
    return calculateBackoffDelay(cfg, attempt)
  }

  private triggerRecovery(id: string, exitCode: number): boolean {
    return triggerAgentRecovery(this.ctx(), id, exitCode)
  }

  private async performRecovery(id: string, cfg: Required<RecoveryConfig>): Promise<void> {
    await performAgentRecovery(this.ctx(), id, cfg)
  }

  cancelRecovery(id: string): void {
    cancelAgentRecovery(this.ctx(), id)
  }

  hasPendingRecovery(id: string): boolean {
    const rs = this.recoveryStates.get(id)
    return rs?.active ?? false
  }

  async kill(id: string, timeoutMs?: number): Promise<void> {
    await killAgent(this.ctx(), id, timeoutMs)
  }

  async sendIpc(id: string, msg: AgentIpcMessage): Promise<void> {
    await sendIpcMessage(this.ctx(), id, msg)
  }

  async routeIpc(fromId: string, toId: string, msg: AgentIpcMessage): Promise<unknown> {
    return routeIpcMessage(this.ctx(), fromId, toId, msg)
  }

  findAgentByName(name: string): AgentInstance | undefined {
    return Array.from(this.agents.values()).find((a) => a.def.name === name)
  }

  findAgentByType(agentType: string): AgentInstance | undefined {
    return Array.from(this.agents.values()).find((a) => a.def.agentType === agentType)
  }

  lookupAgent(opts: {
    name?: string
    agentType?: string
  }): { id: string; name: string; agentType?: string; status: string } | null {
    const agent = opts.name
      ? this.findAgentByName(opts.name)
      : opts.agentType
        ? this.findAgentByType(opts.agentType)
        : undefined
    if (!agent) return null
    return {
      id: agent.id,
      name: agent.def.name,
      agentType: agent.def.agentType,
      status: agent.status,
    }
  }

  async ping(id: string): Promise<void> {
    await this.sendIpc(id, { type: "ping", id: "ping", payload: {}, timestamp: now() })
  }

  get(id: string): AgentInstance | undefined {
    return this.agents.get(id)
  }

  list(filter?: { status?: string; tag?: string; agentType?: string }): AgentInstance[] {
    const all = Array.from(this.agents.values())
    if (!filter) return all
    return all.filter((a) => {
      if (filter.status && a.status !== filter.status) return false
      if (filter.tag && !a.def.tags?.includes(filter.tag)) return false
      if (filter.agentType && a.def.agentType !== filter.agentType) return false
      return true
    })
  }

  getLogs(id: string, opts?: { level?: AgentLogLevel; tail?: number }): AgentLogEntry[] {
    const instance = this.agents.get(id)
    if (!instance) return []
    let logs = instance.log
    if (opts?.level) logs = logs.filter((l) => l.level === opts.level)
    if (opts?.tail) logs = logs.slice(-opts.tail)
    return logs
  }

  getAvailableTypes(): AgentType[] {
    return getAllAgentTypes()
  }

  async destroy(): Promise<void> {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)

    for (const [id] of this.recoveryStates) {
      this.cancelRecovery(id)
    }

    const kills: Promise<void>[] = []
    for (const [id, inst] of this.agents) {
      const terminalStates = new Set(["stopped", "error"])
      if (!terminalStates.has(inst.status)) {
        kills.push(this.kill(id, 3_000).catch(() => {}))
      }
    }
    await Promise.allSettled(kills)

    cleanupAllSandboxes()

    this.agents.clear()
    this.hooks.clear()
    this.listeners.clear()
    this.recoveryStates.clear()
  }

  async spawnDistributed(def: AgentDef): Promise<string | null> {
    return spawnDistributedAgent(def)
  }

  private createPendingInstance(id: string, def: AgentDef): AgentInstance {
    const stub = {
      pid: 0,
      kill: () => {},
      exited: Promise.resolve(0),
      stdin: null,
      stdout: null,
      stderr: null,
    } as unknown as Subprocess
    return {
      id,
      def,
      status: "spawning",
      process: stub,
      spawnTime: now(),
      lastActivity: now(),
      log: [],
      pid: 0,
      exitCode: null,
      metadata: {},
    }
  }

  private readStream(id: string, stream: ReadableStream<Uint8Array>, label: "stdout" | "stderr"): void {
    readAgentStream(this.ctx(), id, stream, label)
  }

  private async handleIpcMessage(id: string, msg: AgentIpcMessage): Promise<void> {
    await handleIpcMessage(this.ctx(), id, msg)
  }

  private async waitForReady(id: string, timeoutMs: number): Promise<void> {
    return waitForAgentReady(this.ctx(), id, timeoutMs)
  }

  private checkHeartbeats(): void {
    const nowTime = now()
    for (const [id, inst] of this.agents) {
      const terminalStates = new Set(["stopped", "error"])
      if (terminalStates.has(inst.status)) continue
      if (nowTime - inst.lastActivity > 30_000) {
        inst.status = "error"
        inst.log.push(this.makeLog("error", "Agent heartbeat timeout"))
        this.emit("agent:error", id, { message: "Heartbeat timeout" })
      }
    }
  }

  private emit(type: AgentEventType, agentId: string, data?: unknown): void {
    const event: AgentEvent = { type, agentId, data }
    for (const cb of this.listeners) {
      try {
        cb(event)
      } catch {
        /* isolate listener failures */
      }
    }
  }

  private makeLog(level: AgentLogLevel, text: string): AgentLogEntry {
    return { level, text, timestamp: now() }
  }
}

let _agentManager: AgentManager | null = null
function getAgentManager(): AgentManager {
  if (!_agentManager) _agentManager = new AgentManager()
  return _agentManager
}

export const agentManager = new Proxy({} as AgentManager, {
  get(_, prop: PropertyKey) {
    return getAgentManager()[prop as keyof AgentManager]
  },
  set(_, prop: PropertyKey, value: unknown) {
    ;(getAgentManager() as unknown as Record<PropertyKey, unknown>)[prop] = value
    return true
  },
  has(_, prop: PropertyKey) {
    return prop in getAgentManager()
  },
  ownKeys() {
    return Reflect.ownKeys(getAgentManager())
  },
  getOwnPropertyDescriptor(_, prop: PropertyKey) {
    return Reflect.getOwnPropertyDescriptor(getAgentManager(), prop)
  },
})

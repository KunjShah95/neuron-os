/**
 * agent-pool — Concurrent agent execution pool with task queuing.
 *
 * Features:
 * - Bounded concurrency (max N agents running simultaneously)
 * - Priority task queue with FIFO ordering within priority levels
 * - Per-agent timeout and resource limits
 * - Queue stats for monitoring
 * - Graceful drain on shutdown
 *
 * Architecture:
 *   submit(task) → queue → dispatcher → spawn worker → callback
 *                        ↑                     │
 *                        └── retry on failure ──┘
 */

import { agentManager } from "./manager"
import type { AgentDef, AgentEvent, AgentIpcMessage } from "./types"

// ── Types ─────────────────────────────────────────────────────────────

export type TaskPriority = "low" | "normal" | "high" | "critical"

export interface PoolTask {
  id: string
  name: string
  goal: string
  priority: TaskPriority
  agentDef: Omit<AgentDef, "name">
  createdAt: number
  timeoutMs?: number
  tags?: string[]
}

export interface PoolTaskResult {
  taskId: string
  agentId: string
  success: boolean
  summary: string
  startedAt: number
  completedAt: number
  durationMs: number
  error?: string
}

export interface PoolStats {
  running: number
  queued: number
  completed: number
  failed: number
  maxConcurrency: number
  utilizationPercent: number
}

export function computePoolResult(opts: {
  taskId: string
  agentId: string
  taskName: string
  exitCode: number | null
  startedAt: number
  completedAt?: number
}): PoolTaskResult {
  const completedAt = opts.completedAt ?? Date.now()
  const durationMs = completedAt - opts.startedAt
  const success = opts.exitCode === 0

  const result: PoolTaskResult = {
    taskId: opts.taskId,
    agentId: opts.agentId,
    success,
    summary: success
      ? `Task "${opts.taskName}" completed in ${durationMs}ms`
      : `Task "${opts.taskName}" failed after ${durationMs}ms`,
    startedAt: opts.startedAt,
    completedAt,
    durationMs,
  }

  if (!success) {
    result.error =
      opts.exitCode === null
        ? `Agent "${opts.agentId}" exited without a status code`
        : `Agent "${opts.agentId}" exited with code ${opts.exitCode}`
  }

  return result
}

export interface PoolConfig {
  /** Max agents running simultaneously (default: 5) */
  maxConcurrency?: number
  /** Default timeout per task in ms (default: 300000 = 5 min) */
  defaultTimeoutMs?: number
  /** Whether to enable auto-recovery for pool agents (default: true) */
  enableRecovery?: boolean
  /** Callback when a task completes */
  onComplete?: (result: PoolTaskResult) => void
}

export interface PoolAgentManager {
  spawn(def: AgentDef): Promise<string>
  sendIpc(id: string, msg: AgentIpcMessage): Promise<void>
  kill(id: string, timeoutMs?: number): Promise<void>
  onEvent(cb: (event: AgentEvent) => void): void
  offEvent(cb: (event: AgentEvent) => void): void
}

// ── Priority queue ────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
}

class PriorityQueue {
  private queues: Record<number, PoolTask[]> = { 0: [], 1: [], 2: [], 3: [] }

  enqueue(task: PoolTask): void {
    const level = PRIORITY_ORDER[task.priority] ?? 2
    const q = this.queues[level]
    if (q) {
      q.push(task)
    }
  }

  dequeue(): PoolTask | undefined {
    for (let i = 0; i <= 3; i++) {
      const q = this.queues[i]
      if (q && q.length > 0) return q.shift()
    }
    return undefined
  }

  remove(taskId: string): boolean {
    for (let i = 0; i <= 3; i++) {
      const q = this.queues[i]
      if (!q) continue
      const idx = q.findIndex((t) => t.id === taskId)
      if (idx >= 0) {
        q.splice(idx, 1)
        return true
      }
    }
    return false
  }

  size(): number {
    return Object.values(this.queues).reduce((sum, q) => sum + q.length, 0)
  }

  clear(): void {
    for (let i = 0; i <= 3; i++) this.queues[i] = []
  }
}

// ── AgentPool ─────────────────────────────────────────────────────────

let nextTaskId = 1

export class AgentPool {
  private config: Required<PoolConfig>
  private manager: PoolAgentManager
  private queue = new PriorityQueue()
  private running = new Map<
    string,
    { task: PoolTask; agentId: string; startedAt: number; cancelled: boolean }
  >()
  private completed: PoolTaskResult[] = []
  private dispatcherTimer: ReturnType<typeof setInterval> | null = null
  private _draining = false

  constructor(config?: PoolConfig, manager?: PoolAgentManager) {
    this.config = {
      maxConcurrency: config?.maxConcurrency ?? 5,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 300_000,
      enableRecovery: config?.enableRecovery ?? true,
      onComplete: config?.onComplete ?? (() => {}),
    }
    this.manager = manager ?? agentManager

    // Start dispatcher — checks queue every 500ms
    this.dispatcherTimer = setInterval(() => this.dispatch(), 500)
    this.dispatcherTimer.unref()
  }

  // ── Public API ──────────────────────────────────────────────────────

  /**
   * Submit a task to the pool. Returns the task ID.
   * The task will be executed when a slot opens up.
   */
  submit(
    goal: string,
    opts?: {
      name?: string
      priority?: TaskPriority
      agentDef?: Partial<Omit<AgentDef, "name">>
      timeoutMs?: number
      tags?: string[]
    },
  ): string {
    const id = `pool-task-${nextTaskId++}-${Date.now().toString(36)}`
    const task: PoolTask = {
      id,
      name: opts?.name ?? `task-${id}`,
      goal,
      priority: opts?.priority ?? "normal",
      agentDef: {
        script: opts?.agentDef?.script ?? "src/agent/agent-worker.ts",
        agentType: opts?.agentDef?.agentType,
        tools: opts?.agentDef?.tools,
        env: opts?.agentDef?.env,
        tags: opts?.tags,
        recovery: this.config.enableRecovery ? { maxRetries: 2 } : undefined,
      },
      createdAt: Date.now(),
      timeoutMs: opts?.timeoutMs ?? this.config.defaultTimeoutMs,
      tags: opts?.tags,
    }

    this.queue.enqueue(task)
    return id
  }

  /**
   * Cancel a queued task (cannot cancel running tasks).
   * Returns true if the task was found and removed from the queue.
   */
  cancel(taskId: string): boolean {
    if (this.running.has(taskId)) {
      const entry = this.running.get(taskId)
      if (entry) {
        entry.cancelled = true
        if (entry.agentId) {
          this.manager.kill(entry.agentId).catch(() => {})
        }
      }
      this.running.delete(taskId)
      return true
    }
    return this.queue.remove(taskId)
  }

  /**
   * Wait for a specific task to complete, or all tasks to drain.
   */
  async waitForTask(taskId: string, timeoutMs = 120_000): Promise<PoolTaskResult> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const result = this.completed.find((r) => r.taskId === taskId)
      if (result) return result
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error(`Task ${taskId} did not complete within ${timeoutMs}ms`)
  }

  async waitForDrain(timeoutMs = 300_000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (this.queue.size() === 0 && this.running.size === 0) return
      await new Promise((r) => setTimeout(r, 200))
    }
    throw new Error(`Pool did not drain within ${timeoutMs}ms`)
  }

  /**
   * Get current pool statistics.
   */
  getStats(): PoolStats {
    const total = this.completed.length
    const failed = this.completed.filter((r) => !r.success).length
    return {
      running: this.running.size,
      queued: this.queue.size(),
      completed: total,
      failed,
      maxConcurrency: this.config.maxConcurrency,
      utilizationPercent:
        this.config.maxConcurrency > 0 ? Math.round((this.running.size / this.config.maxConcurrency) * 100) : 0,
    }
  }

  /**
   * Shut down the pool gracefully. Drains queue, kills running tasks.
   */
  async destroy(): Promise<void> {
    this._draining = true
    if (this.dispatcherTimer) clearInterval(this.dispatcherTimer)

    const kills: Promise<void>[] = []
    for (const [, entry] of this.running) {
      entry.cancelled = true
      if (entry.agentId) {
        kills.push(this.manager.kill(entry.agentId).catch(() => {}))
      }
    }
    await Promise.allSettled(kills)

    this.queue.clear()
    this.running.clear()
  }

  // ── Dispatcher ──────────────────────────────────────────────────────

  private async dispatch(): Promise<void> {
    if (this._draining) return
    if (this.running.size >= this.config.maxConcurrency) return

    const task = this.queue.dequeue()
    if (!task) return

    const startedAt = Date.now()
    const entry = { task, agentId: "", startedAt, cancelled: false }
    this.running.set(task.id, entry)

    try {
      const id = await this.manager.spawn({
        name: task.name,
        ...task.agentDef,
        env: {
          ...task.agentDef.env,
          AEGIS_STDIN_MODE: "true",
        },
      })

      entry.agentId = id

      if (entry.cancelled) {
        await this.manager.kill(id).catch(() => {})
        return
      }

      await this.manager.sendIpc(id, {
        type: "run-task",
        id,
        payload: { goal: task.goal },
        timestamp: Date.now(),
      })

      const timeoutHandle = setTimeout(() => {
        this.manager.kill(id).catch(() => {})
      }, task.timeoutMs ?? this.config.defaultTimeoutMs)

      let exitCode: number | null = null

      await new Promise<void>((resolve) => {
        const handler = (event: { type: string; agentId?: string; data?: unknown }) => {
          if (event.type === "agent:exit" && event.agentId === id) {
            const data = event.data as { code?: number } | undefined
            exitCode = typeof data?.code === "number" ? data.code : null
            this.manager.offEvent(handler)
            clearTimeout(timeoutHandle)
            resolve()
          }
        }
        this.manager.onEvent(handler)
      })

      const result = computePoolResult({
        taskId: task.id,
        agentId: id,
        taskName: task.name,
        exitCode,
        startedAt,
      })

      this.completed.push(result)
      this.config.onComplete(result)
    } catch (err: unknown) {
      const result = computePoolResult({
        taskId: task.id,
        agentId: entry.agentId,
        taskName: task.name,
        exitCode: -1,
        startedAt,
      })
      result.success = false
      result.summary = `Task "${task.name}" failed`
      result.error = err instanceof Error ? err.message : String(err)

      this.completed.push(result)
      this.config.onComplete(result)
    } finally {
      this.running.delete(task.id)
    }
  }
}

/** Singleton pool instance */
export const agentPool = new AgentPool({
  maxConcurrency: 5,
  defaultTimeoutMs: 300_000,
  enableRecovery: true,
})

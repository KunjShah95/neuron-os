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
import type { AgentDef } from "./types"

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
    this.queues[level]!.push(task)
  }

  dequeue(): PoolTask | undefined {
    for (let i = 0; i <= 3; i++) {
      const q = this.queues[i]!
      if (q.length > 0) return q.shift()
    }
    return undefined
  }

  remove(taskId: string): boolean {
    for (let i = 0; i <= 3; i++) {
      const idx = this.queues[i]!.findIndex((t) => t.id === taskId)
      if (idx >= 0) {
        this.queues[i]!.splice(idx, 1)
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
  private queue = new PriorityQueue()
  private running = new Map<string, { task: PoolTask; agentId: string; startedAt: number }>()
  private completed: PoolTaskResult[] = []
  private dispatcherTimer: ReturnType<typeof setInterval> | null = null
  private _draining = false

  constructor(config?: PoolConfig) {
    this.config = {
      maxConcurrency: config?.maxConcurrency ?? 5,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 300_000,
      enableRecovery: config?.enableRecovery ?? true,
      onComplete: config?.onComplete ?? (() => {}),
    }

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
      // Kill the running agent
      const entry = this.running.get(taskId)!
      agentManager.kill(entry.agentId).catch(() => {})
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

    // Kill all running tasks
    const kills: Promise<void>[] = []
    for (const [, entry] of this.running) {
      kills.push(agentManager.kill(entry.agentId).catch(() => {}))
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
    const agentId = `pool-${task.name}-${Date.now().toString(36)}`

    this.running.set(task.id, { task, agentId, startedAt })

    try {
      const id = await agentManager.spawn({
        name: task.name,
        ...task.agentDef,
      })

      agentManager.sendIpc(id, {
        type: "run-task",
        id: agentId,
        payload: { goal: task.goal },
        timestamp: Date.now(),
      })

      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        agentManager.kill(id).catch(() => {})
      }, task.timeoutMs ?? this.config.defaultTimeoutMs)

      // Wait for completion
      await new Promise<void>((resolve) => {
        const handler = (event: any) => {
          if (event.type === "agent:exit" && event.agentId === id) {
            agentManager.offEvent(handler)
            clearTimeout(timeoutHandle)
            resolve()
          }
        }
        agentManager.onEvent(handler)
      })

      const completedAt = Date.now()
      const durationMs = completedAt - startedAt
      const result: PoolTaskResult = {
        taskId: task.id,
        agentId: id,
        success: true,
        summary: `Task "${task.name}" completed in ${durationMs}ms`,
        startedAt,
        completedAt,
        durationMs,
      }

      this.completed.push(result)
      this.config.onComplete(result)
    } catch (err: any) {
      const completedAt = Date.now()
      const result: PoolTaskResult = {
        taskId: task.id,
        agentId,
        success: false,
        summary: `Task "${task.name}" failed`,
        startedAt,
        completedAt,
        durationMs: completedAt - startedAt,
        error: err.message ?? String(err),
      }

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

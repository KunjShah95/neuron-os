import { Database } from "bun:sqlite"
import { join } from "node:path"
import { existsSync, mkdirSync } from "node:fs"
import { createLogger } from "../cli/logger"
import { getProjectSessionDb } from "../project/context"

const log = createLogger("task-queue")

export type TaskPriority = "low" | "normal" | "high" | "critical"

export interface QueuedTask {
  id: string
  goal: string
  priority: TaskPriority
  status: "queued" | "running" | "completed" | "failed"
  agentId: string | null
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  result: string | null
}

interface QueueRow {
  id: string
  goal: string
  priority: string
  priority_level: number
  status: string
  agent_id: string | null
  created_at: number
  started_at: number | null
  completed_at: number | null
  result: string | null
}

export class TaskQueue {
  private db: Database
  private initialized = false

  constructor(project?: string) {
    const dbPath = project
      ? join(getProjectSessionDb(project), "..", "queue.db")
      : join(process.cwd(), "data", "sessions", "queue.db")

    const dir = join(dbPath, "..")
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(dbPath)
    this.db.exec("PRAGMA journal_mode = WAL")
    this.init()
  }

  private init() {
    if (this.initialized) return
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS queue (
        id TEXT PRIMARY KEY,
        goal TEXT NOT NULL,
        priority TEXT NOT NULL,
        priority_level INTEGER NOT NULL,
        status TEXT NOT NULL,
        agent_id TEXT,
        created_at INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        result TEXT
      )
    `)
    this.initialized = true
  }

  private getPriorityLevel(p: TaskPriority): number {
    switch (p) {
      case "critical":
        return 0
      case "high":
        return 1
      case "normal":
        return 2
      case "low":
        return 3
      default:
        return 2
    }
  }

  public submit(goal: string, priority: TaskPriority = "normal"): string {
    const id = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const stmt = this.db.prepare(`
      INSERT INTO queue (id, goal, priority, priority_level, status, created_at)
      VALUES (?, ?, ?, ?, 'queued', ?)
    `)
    stmt.run(id, goal, priority, this.getPriorityLevel(priority), Date.now())
    log.info(`Task submitted to queue`, { taskId: id, priority })
    return id
  }

  /**
   * Pulls the highest priority queued task and marks it as running.
   */
  public pull(agentId: string): QueuedTask | null {
    // We use an immediate transaction to safely pull exactly one task
    const pulledTask = this.db.transaction(() => {
      const task = this.db
        .prepare(
          `
        SELECT * FROM queue 
        WHERE status = 'queued' 
        ORDER BY priority_level ASC, created_at ASC 
        LIMIT 1
      `,
        )
        .get() as QueueRow | null

      if (task) {
        this.db
          .prepare(
            `
          UPDATE queue 
          SET status = 'running', agent_id = ?, started_at = ? 
          WHERE id = ?
        `,
          )
          .run(agentId, Date.now(), task.id)

        return { ...task, status: "running", agent_id: agentId }
      }
      return null
    })() as QueueRow | null

    if (!pulledTask) return null

    return {
      id: pulledTask.id as string,
      goal: pulledTask.goal as string,
      priority: pulledTask.priority as TaskPriority,
      status: "running",
      agentId,
      createdAt: pulledTask.created_at as number,
      startedAt: Date.now(),
      completedAt: null,
      result: null,
    }
  }

  public complete(id: string, success: boolean, resultStr?: string): void {
    const status = success ? "completed" : "failed"
    this.db
      .prepare(
        `
      UPDATE queue 
      SET status = ?, completed_at = ?, result = ? 
      WHERE id = ?
    `,
      )
      .run(status, Date.now(), resultStr || null, id)

    log.info(`Task finished`, { taskId: id, status })
  }

  public getStats() {
    const queued = (this.db.prepare("SELECT COUNT(*) as c FROM queue WHERE status = 'queued'").get() as { c: number }).c
    const running = (this.db.prepare("SELECT COUNT(*) as c FROM queue WHERE status = 'running'").get() as { c: number }).c
    const completed = (this.db.prepare("SELECT COUNT(*) as c FROM queue WHERE status = 'completed'").get() as { c: number }).c
    const failed = (this.db.prepare("SELECT COUNT(*) as c FROM queue WHERE status = 'failed'").get() as { c: number }).c
    return { queued, running, completed, failed }
  }

  public getTask(id: string): QueuedTask | null {
    const row = this.db.prepare("SELECT * FROM queue WHERE id = ?").get(id) as QueueRow | null
    if (!row) return null
    return {
      id: row.id,
      goal: row.goal,
      priority: row.priority as TaskPriority,
      status: row.status as QueuedTask["status"],
      agentId: row.agent_id,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      result: row.result,
    }
  }
}

export const taskQueue = new TaskQueue()

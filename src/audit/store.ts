/**
 * audit/store — Append-only audit log for agent actions.
 *
 * Records every agent step: what the agent thought, what action it took,
 * what context it had, and how it was resolved. This provides full
 * interpretability — you can replay any session and understand why
 * every decision was made.
 *
 * The audit log is append-only (no deletes, no updates) to maintain
 * integrity. It's stored in SQLite for efficient querying.
 *
 * Integration points:
 * - AgentEngine hooks record thoughts + actions during chat()
 * - AgentToolExecutor records file mutations with before/after
 * - Approval system records human decisions
 */

import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdirSync, existsSync } from "node:fs"
import { createLogger } from "../cli/logger"

const log = createLogger("audit")

// ── Types ─────────────────────────────────────────────────────────────

export type AuditEventType =
  | "thought"          // Agent's internal reasoning
  | "tool_call"        // Agent invoked a tool
  | "tool_result"      // Tool returned a result
  | "file_read"        // Agent read a file
  | "file_write"       // Agent wrote/created a file
  | "file_delete"      // Agent deleted a file
  | "shell_command"    // Agent ran a shell command
  | "approval_request" // Human approval was requested
  | "approval_result"  // Human approved/rejected
  | "error"            // An error occurred
  | "session_start"    // Session began
  | "session_end"      // Session ended
  | "policy_check"     // Policy was evaluated
  | "policy_violation" // Policy was violated
  | "ratchet_revert"   // Git ratchet reverted files due to regression

export interface AuditEntry {
  id: number
  sessionId: string
  project: string
  stepIndex: number
  eventType: AuditEventType
  /** Free-text description of what happened */
  summary: string
  /** Full detail (thought text, file content, command output, etc.) */
  detail: string
  /** JSON context snapshot (files in scope, env vars, etc.) */
  context: string
  /** Agent's raw message at this step */
  agentThought: string
  /** Duration of this step in ms */
  durationMs: number
  /** ISO timestamp */
  timestamp: string
}

export interface AuditFilter {
  sessionId?: string
  project?: string
  eventType?: AuditEventType
  limit?: number
  offset?: number
  since?: string
}

// ── AuditStore ────────────────────────────────────────────────────────

export class AuditStore {
  private db: Database
  private initialized = false

  constructor(project?: string) {
    const dataDir = project
      ? join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "projects", project)
      : join(process.cwd(), "data")
    const dir = join(dataDir, "audit")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(join(dir, "audit.log.db"))
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA synchronous = NORMAL")
    this.init()
  }

  private init(): void {
    if (this.initialized) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        project TEXT NOT NULL DEFAULT '',
        step_index INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        context TEXT NOT NULL DEFAULT '{}',
        agent_thought TEXT NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_session
      ON audit_log(session_id, step_index)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_project
      ON audit_log(project, timestamp DESC)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_audit_type
      ON audit_log(event_type, timestamp DESC)
    `)

    this.initialized = true
    log.info("Audit store initialized")
  }

  // ── Record (append-only) ────────────────────────────────────────────

  record(entry: Omit<AuditEntry, "id">): number {
    const stmt = this.db.prepare(`
      INSERT INTO audit_log (session_id, project, step_index, event_type, summary, detail, context, agent_thought, duration_ms, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      entry.sessionId,
      entry.project,
      entry.stepIndex,
      entry.eventType,
      entry.summary,
      entry.detail,
      entry.context,
      entry.agentThought,
      entry.durationMs,
      entry.timestamp,
    )

    const result = this.db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }
    return result.id
  }

  // ── Query ───────────────────────────────────────────────────────────

  query(filter: AuditFilter): AuditEntry[] {
    const conditions: string[] = []
    const queryParams: unknown[] = []

    if (filter.sessionId) {
      conditions.push("session_id = ?")
      queryParams.push(filter.sessionId)
    }
    if (filter.project) {
      conditions.push("project = ?")
      queryParams.push(filter.project)
    }
    if (filter.eventType) {
      conditions.push("event_type = ?")
      queryParams.push(filter.eventType)
    }
    if (filter.since) {
      conditions.push("timestamp >= ?")
      queryParams.push(filter.since)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""
    const limit = filter.limit ?? 50
    const offset = filter.offset ?? 0

    const sql = `SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`
    const rows = this.db.prepare(sql).all(...(queryParams as any[])) as Record<string, unknown>[]

    return rows.reverse().map((r) => this.rowToEntry(r))
  }

  getSessionAudit(sessionId: string): AuditEntry[] {
    return this.query({ sessionId, limit: 1000 })
  }

  getRecent(limit = 50, project?: string): AuditEntry[] {
    return this.query({ project, limit })
  }

  getByType(eventType: AuditEventType, limit = 50): AuditEntry[] {
    return this.query({ eventType, limit })
  }

  // ── Stats ───────────────────────────────────────────────────────────

  getStats(): { totalEntries: number; totalSessions: number; byType: Record<string, number> } {
    const total = this.db.prepare("SELECT COUNT(*) as c FROM audit_log").get() as { c: number }
    const sessions = this.db.prepare("SELECT COUNT(DISTINCT session_id) as c FROM audit_log").get() as { c: number }
    const typeRows = this.db.prepare(
      "SELECT event_type, COUNT(*) as c FROM audit_log GROUP BY event_type ORDER BY c DESC",
    ).all() as { event_type: string; c: number }[]

    const byType: Record<string, number> = {}
    for (const r of typeRows) {
      byType[r.event_type] = r.c
    }

    return {
      totalEntries: total.c,
      totalSessions: sessions.c,
      byType,
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  close(): void {
    this.db.close()
    log.info("Audit store closed")
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private rowToEntry(row: Record<string, unknown>): AuditEntry {
    return {
      id: row.id as number,
      sessionId: row.session_id as string,
      project: row.project as string,
      stepIndex: row.step_index as number,
      eventType: row.event_type as AuditEventType,
      summary: row.summary as string,
      detail: row.detail as string,
      context: row.context as string,
      agentThought: row.agent_thought as string,
      durationMs: row.duration_ms as number,
      timestamp: row.timestamp as string,
    }
  }
}

export const auditStore = new AuditStore()

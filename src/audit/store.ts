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
import { join, resolve } from "node:path"
import { createHash } from "node:crypto"
import { createLogger } from "../cli/logger"
import { openDatabase } from "../utils/sqlite"

const log = createLogger("audit")

const DEFAULT_QUERY_LIMIT = 50
const MAX_QUERY_LIMIT = 10_000
const MAX_QUERY_OFFSET = 1_000_000
const HASH_FIELD_SEPARATOR = "\u001f"

// ── Types ─────────────────────────────────────────────────────────────

export type AuditEventType =
  | "thought" // Agent's internal reasoning
  | "tool_call" // Agent invoked a tool
  | "tool_result" // Tool returned a result
  | "file_read" // Agent read a file
  | "file_write" // Agent wrote/created a file
  | "file_delete" // Agent deleted a file
  | "shell_command" // Agent ran a shell command
  | "approval_request" // Human approval was requested
  | "approval_result" // Human approved/rejected
  | "error" // An error occurred
  | "session_start" // Session began
  | "session_end" // Session ended
  | "policy_check" // Policy was evaluated
  | "policy_violation" // Policy was violated
  | "ratchet_revert" // Git ratchet reverted files due to regression

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

export interface AuditIntegrityReport {
  /** True when every chained row verifies against its predecessor */
  valid: boolean
  /** Total number of rows in the log */
  totalRows: number
  /** Number of rows that were part of the verified hash chain */
  verifiedRows: number
  /** Number of legacy rows that predate the hash chain and cannot be verified */
  unverifiablePrefix: number
  /** Id of the first row whose hash does not match, if any */
  brokenAt: number | null
  /** Human readable reason for the first broken link */
  reason: string | null
}

// ── AuditStore ────────────────────────────────────────────────────────

export class AuditStore {
  private db: Database
  private initialized = false
  private options: { dbPath?: string }

  constructor(project?: string | { dbPath?: string }, options: { dbPath?: string } = {}) {
    const projectName = typeof project === "string" ? project : undefined
    const inlineOptions = typeof project === "object" && project !== null ? project : {}
    this.options = { ...inlineOptions, ...options }
    const dbPath = this.options.dbPath
    const dataDir = projectName
      ? join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "projects", projectName)
      : join(process.cwd(), "data")
    const dir = dbPath
      ? dbPath.endsWith(".db")
        ? resolve(dbPath, "..")
        : dbPath
      : join(dataDir, "audit")
    const dbFile = dbPath === ":memory:" ? dbPath : dbPath && dbPath.endsWith(".db") ? dbPath : join(dir, "audit.log.db")
    this.db = openDatabase(dbFile)
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
        timestamp TEXT NOT NULL,
        hash TEXT NOT NULL DEFAULT ''
      )
    `)

    this.ensureHashColumn()

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

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS audit_log_block_update
      BEFORE UPDATE ON audit_log
      BEGIN
        SELECT RAISE(ABORT, 'audit_log is append-only');
      END
    `)

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS audit_log_block_delete
      BEFORE DELETE ON audit_log
      BEGIN
        SELECT RAISE(ABORT, 'audit_log is append-only');
      END
    `)

    this.initialized = true
    log.debug("Audit store initialized")
  }

  /**
   * Add the hash column to a pre-existing database.
   * Legacy rows keep an empty hash and form an unverifiable prefix.
   */
  private ensureHashColumn(): void {
    const columns = this.db.prepare("PRAGMA table_info(audit_log)").all() as Array<{ name: string }>
    if (columns.some((c) => c.name === "hash")) return
    this.db.exec("ALTER TABLE audit_log ADD COLUMN hash TEXT NOT NULL DEFAULT ''")
    log.info("Migrated audit_log with hash column")
  }

  // ── Record (append-only) ────────────────────────────────────────────

  private scrubSecrets(text: string | undefined | null): string {
    if (text === undefined || text === null) return ""
    let result = text
    const secretKeys = Object.keys(process.env).filter((key) => {
      const upperKey = key.toUpperCase()
      return (
        upperKey.endsWith("_KEY") ||
        upperKey.endsWith("_SECRET") ||
        upperKey.endsWith("_TOKEN")
      )
    })

    for (const key of secretKeys) {
      const val = process.env[key]
      if (val && val.length >= 8) {
        result = result.split(val).join("[REDACTED]")
      }
    }
    result = result.replace(/(?:[A-Za-z0-9_]+=|Bearer |sk-)[A-Za-z0-9_\-]{20,}/g, "[REDACTED]")
    return result
  }

  record(entry: Omit<AuditEntry, "id">): number {
    const summary = this.scrubSecrets(entry.summary)
    const detail = this.scrubSecrets(entry.detail)
    const context = this.scrubSecrets(entry.context)
    const agentThought = this.scrubSecrets(entry.agentThought)

    const content = {
      sessionId: entry.sessionId,
      project: entry.project,
      stepIndex: entry.stepIndex,
      eventType: entry.eventType,
      summary,
      detail,
      context,
      agentThought,
      durationMs: entry.durationMs,
      timestamp: entry.timestamp,
    }

    const hash = this.computeHash(this.tailHash(), content)

    const stmt = this.db.prepare(`
      INSERT INTO audit_log (session_id, project, step_index, event_type, summary, detail, context, agent_thought, duration_ms, timestamp, hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      content.sessionId,
      content.project,
      content.stepIndex,
      content.eventType,
      content.summary,
      content.detail,
      content.context,
      content.agentThought,
      content.durationMs,
      content.timestamp,
      hash,
    )

    const result = this.db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }
    return result.id
  }

  /**
   * Hash of the most recent row, or an empty string for an empty log.
   */
  private tailHash(): string {
    const row = this.db.prepare("SELECT hash FROM audit_log ORDER BY id DESC LIMIT 1").get() as
      | { hash?: string }
      | null
    return row?.hash ?? ""
  }

  private computeHash(
    previousHash: string,
    content: {
      sessionId: string
      project: string
      stepIndex: number
      eventType: string
      summary: string
      detail: string
      context: string
      agentThought: string
      durationMs: number
      timestamp: string
    },
  ): string {
    const payload = [
      previousHash,
      content.sessionId,
      content.project,
      String(content.stepIndex),
      content.eventType,
      content.summary,
      content.detail,
      content.context,
      content.agentThought,
      String(content.durationMs),
      content.timestamp,
    ].join(HASH_FIELD_SEPARATOR)
    return createHash("sha256").update(payload, "utf-8").digest("hex")
  }

  /**
   * Verify the hash chain of the audit log.
   * Rows written before the chain existed keep an empty hash and are reported
   * as an unverifiable prefix instead of failing the whole read.
   */
  verifyIntegrity(): AuditIntegrityReport {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, project, step_index, event_type, summary, detail, context, agent_thought, duration_ms, timestamp, hash
         FROM audit_log ORDER BY id ASC`,
      )
      .all() as Array<Record<string, unknown>>

    const startIndex = rows.findIndex((r) => typeof r.hash === "string" && r.hash !== "")
    if (startIndex === -1) {
      return {
        valid: true,
        totalRows: rows.length,
        verifiedRows: 0,
        unverifiablePrefix: rows.length,
        brokenAt: null,
        reason: null,
      }
    }

    let previousHash = startIndex > 0 ? ((rows[startIndex - 1]?.hash as string | undefined) ?? "") : ""
    let verifiedRows = 0

    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>
      const stored = typeof row.hash === "string" ? row.hash : ""
      if (!stored) {
        return {
          valid: false,
          totalRows: rows.length,
          verifiedRows,
          unverifiablePrefix: startIndex,
          brokenAt: row.id as number,
          reason: `row ${String(row.id)} has no hash`,
        }
      }

      const expected = this.computeHash(previousHash, {
        sessionId: row.session_id as string,
        project: row.project as string,
        stepIndex: row.step_index as number,
        eventType: row.event_type as string,
        summary: row.summary as string,
        detail: row.detail as string,
        context: row.context as string,
        agentThought: row.agent_thought as string,
        durationMs: row.duration_ms as number,
        timestamp: row.timestamp as string,
      })

      if (expected !== stored) {
        return {
          valid: false,
          totalRows: rows.length,
          verifiedRows,
          unverifiablePrefix: startIndex,
          brokenAt: row.id as number,
          reason: `hash mismatch at row ${String(row.id)}`,
        }
      }

      previousHash = stored
      verifiedRows++
    }

    return {
      valid: true,
      totalRows: rows.length,
      verifiedRows,
      unverifiablePrefix: startIndex,
      brokenAt: null,
      reason: null,
    }
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
    const limit = this.safeLimit(filter.limit)
    const offset = this.safeOffset(filter.offset)

    const sql = `SELECT * FROM audit_log ${where} ORDER BY id DESC LIMIT ? OFFSET ?`
    const rows = this.db
      .prepare(sql)
      .all(...(queryParams as (string | number | null)[]), limit, offset) as Record<string, unknown>[]

    this.assertChainIntact()

    return rows.reverse().map((r) => this.rowToEntry(r))
  }

  private safeLimit(value: number | undefined): number {
    if (value === undefined || value === null) return DEFAULT_QUERY_LIMIT
    if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_QUERY_LIMIT
    const int = Math.floor(value)
    if (int <= 0) return DEFAULT_QUERY_LIMIT
    return Math.min(int, MAX_QUERY_LIMIT)
  }

  private safeOffset(value: number | undefined): number {
    if (value === undefined || value === null) return 0
    if (typeof value !== "number" || !Number.isFinite(value)) return 0
    const int = Math.floor(value)
    if (int <= 0) return 0
    return Math.min(int, MAX_QUERY_OFFSET)
  }

  /**
   * Cheap tail check of the hash chain performed on every read.
   * A broken tail means the log was edited outside the append-only API.
   */
  private assertChainIntact(): void {
    try {
      const tail = this.db
        .prepare(
          `SELECT id, hash FROM audit_log ORDER BY id DESC LIMIT 1`,
        )
        .get() as { id?: number; hash?: string } | null
      if (!tail || !tail.hash || tail.id === undefined) return
      const prev = this.db
        .prepare(`SELECT hash FROM audit_log WHERE id < ? ORDER BY id DESC LIMIT 1`)
        .get(tail.id) as { hash?: string } | null
      const previousHash = prev?.hash ?? ""
      const row = this.db
        .prepare(
          `SELECT session_id, project, step_index, event_type, summary, detail, context, agent_thought, duration_ms, timestamp
           FROM audit_log WHERE id = ?`,
        )
        .get(tail.id) as Record<string, unknown> | null
      if (!row) return
      const expected = this.computeHash(previousHash, {
        sessionId: row.session_id as string,
        project: row.project as string,
        stepIndex: row.step_index as number,
        eventType: row.event_type as string,
        summary: row.summary as string,
        detail: row.detail as string,
        context: row.context as string,
        agentThought: row.agent_thought as string,
        durationMs: row.duration_ms as number,
        timestamp: row.timestamp as string,
      })
      if (expected !== tail.hash) {
        log.warn("Audit log integrity check failed — the log was modified outside the append-only API")
      }
    } catch {
      /* integrity checks must never break a read */
    }
  }

  searchRecords(keyword: string, limit = 50, offset = 0): AuditEntry[] {
    const pattern = `%${keyword.toLowerCase()}%`
    const sql = `
      SELECT * FROM audit_log
      WHERE lower(summary) LIKE ? OR lower(detail) LIKE ? OR lower(agent_thought) LIKE ?
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `
    const rows = this.db
      .prepare(sql)
      .all(pattern, pattern, pattern, this.safeLimit(limit), this.safeOffset(offset)) as Record<string, unknown>[]
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
    const typeRows = this.db
      .prepare("SELECT event_type, COUNT(*) as c FROM audit_log GROUP BY event_type ORDER BY c DESC")
      .all() as { event_type: string; c: number }[]

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

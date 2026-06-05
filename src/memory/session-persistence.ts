/**
 * session-persistence — SQLite-based session store for agent persistence.
 *
 * Persists agent sessions to a local SQLite database so they survive
 * process restarts. Uses bun:sqlite for zero-dependency operation.
 *
 * Schema:
 *   sessions — core session metadata
 *   session_messages — message history per session
 *   session_state — key-value state for agent context
 *
 * Integration points:
 * - AgentEngine stores each chat()/streamChat() message exchange
 * - AgentManager hooks persist agent lifecycle events
 * - Startup restores last N active sessions for visibility/resumption
 */

import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdirSync, existsSync } from "node:fs"
import { createLogger } from "../cli/logger"
import { getProjectSessionDb } from "../project/context"

const log = createLogger("session-persistence")

// ── Types ─────────────────────────────────────────────────────────────

export interface SessionRecord {
  id: string
  name: string
  agentType: string
  goal: string
  status: "active" | "completed" | "failed" | "paused"
  createdAt: number
  updatedAt: number
  metadata: Record<string, string>
}

export interface SessionMessage {
  id: number
  sessionId: string
  role: "user" | "assistant" | "system" | "tool"
  content: string
  timestamp: number
  toolCalls?: string // JSON string of tool calls
}

export interface SessionState {
  key: string
  value: string
  sessionId: string
}

// ── SessionStore ──────────────────────────────────────────────────────

export class SessionStore {
  private db: Database
  private initialized = false

  /**
   * @param dbPath - Explicit path to the SQLite DB file (overrides all other options)
   * @param project - Optional project name for project-scoped storage
   */
  constructor(dbPath?: string, project?: string) {
    // Resolve DB path: explicit > project-scoped > default (cwd-based)
    const resolvedPath = dbPath
      ?? (project ? getProjectSessionDb(project) : undefined)
      ?? join(process.cwd(), "data", "sessions", "sessions.db")

    const dir = join(resolvedPath, "..")
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    this.db = new Database(resolvedPath)
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA synchronous = NORMAL")
    this.init()
  }

  private init(): void {
    if (this.initialized) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        agent_type TEXT NOT NULL DEFAULT 'default',
        goal TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active'
          CHECK (status IN ('active', 'completed', 'failed', 'paused')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        tool_calls TEXT
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_state (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (session_id, key)
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_session
      ON session_messages(session_id, timestamp)
    `)

    this.initialized = true
    log.info("Session store initialized")
  }

  // ── Session CRUD ──────────────────────────────────────────────────

  createSession(record: Omit<SessionRecord, "createdAt" | "updatedAt">): void {
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, name, agent_type, goal, status, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      record.id,
      record.name,
      record.agentType,
      record.goal,
      record.status,
      now,
      now,
      JSON.stringify(record.metadata),
    )
  }

  updateSession(id: string, updates: Partial<Omit<SessionRecord, "id" | "createdAt">>): void {
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.name !== undefined) { fields.push("name = ?"); values.push(updates.name) }
    if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status) }
    if (updates.goal !== undefined) { fields.push("goal = ?"); values.push(updates.goal) }
    if (updates.metadata !== undefined) { fields.push("metadata = ?"); values.push(JSON.stringify(updates.metadata)) }
    if (updates.agentType !== undefined) { fields.push("agent_type = ?"); values.push(updates.agentType) }

    if (fields.length === 0) return

    fields.push("updated_at = ?")
    values.push(Date.now())
    values.push(id)

    // @ts-expect-error - bun:sqlite variadic param type limitation
    this.db.prepare(`UPDATE sessions SET ${fields.join(", ")} WHERE id = ?`).run(...values)
  }

  getSession(id: string): SessionRecord | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | null
    if (!row) return null
    return this.rowToSession(row)
  }

  listSessions(status?: SessionRecord["status"]): SessionRecord[] {
    let rows: Record<string, unknown>[]
    if (status) {
      rows = this.db.prepare(
        "SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC",
      ).all(status) as Record<string, unknown>[]
    } else {
      rows = this.db.prepare(
        "SELECT * FROM sessions ORDER BY updated_at DESC",
      ).all() as Record<string, unknown>[]
    }
    return rows.map((r) => this.rowToSession(r))
  }

  deleteSession(id: string): void {
    // CASCADE will delete messages and state
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id as any)
  }

  // ── Messages ───────────────────────────────────────────────────────

  addMessage(sessionId: string, msg: Omit<SessionMessage, "id" | "timestamp">): number {
    const now = Date.now()
    const stmt = this.db.prepare(`
      INSERT INTO session_messages (session_id, role, content, timestamp, tool_calls)
      VALUES (?, ?, ?, ?, ?)
    `)
    stmt.run(sessionId as any, msg.role as any, msg.content as any, now as any, (msg.toolCalls ?? null) as any)

    // Update session timestamp
    this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(now as any, sessionId as any)

    // Return the last_insert_rowid
    const result = this.db.prepare("SELECT last_insert_rowid() as id").get() as { id: number }
    return result.id
  }

  getMessages(sessionId: string, limit = 50): SessionMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM session_messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `)
    const rows = stmt.all(sessionId, limit) as Record<string, unknown>[]

    return rows.map((r) => ({
      id: r.id as number,
      sessionId: r.session_id as string,
      role: r.role as SessionMessage["role"],
      content: r.content as string,
      timestamp: r.timestamp as number,
      toolCalls: r.tool_calls as string | undefined,
    }))
  }

  // ── State ──────────────────────────────────────────────────────────

  setState(sessionId: string, key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO session_state (session_id, key, value)
      VALUES (?, ?, ?)
      ON CONFLICT(session_id, key) DO UPDATE SET value = excluded.value
    `).run(sessionId, key, value)
  }

  getState(sessionId: string, key: string): string | null {
    const row = this.db.prepare(
      "SELECT value FROM session_state WHERE session_id = ? AND key = ?",
    ).get(sessionId, key) as { value: string } | null
    return row?.value ?? null
  }

  getAllState(sessionId: string): Record<string, string> {
    const rows = this.db.prepare(
      "SELECT key, value FROM session_state WHERE session_id = ?",
    ).all(sessionId) as { key: string; value: string }[]

    const result: Record<string, string> = {}
    for (const row of rows) result[row.key] = row.value
    return result
  }

  deleteState(sessionId: string, key: string): void {
    this.db.prepare("DELETE FROM session_state WHERE session_id = ? AND key = ?").run(sessionId, key)
  }

  // ── Restore ────────────────────────────────────────────────────────

  /**
   * Restore the most recent sessions, optionally filtered by status.
   * Useful on startup to see what agents were doing before restart.
   */
  restoreRecentSessions(count = 10, status?: SessionRecord["status"]): SessionRecord[] {
    let rows: Record<string, unknown>[]
    if (status) {
      rows = this.db.prepare(
        "SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC LIMIT ?",
      ).all(status, count) as Record<string, unknown>[]
    } else {
      rows = this.db.prepare(
        "SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?",
      ).all(count) as Record<string, unknown>[]
    }

    return rows.map((r) => this.rowToSession(r))
  }

  /**
   * Resume a session by ID — returns session + last N messages.
   * Sets the session status back to 'active'.
   */
  resumeSession(id: string, messageLimit = 50): { session: SessionRecord; messages: SessionMessage[] } | null {
    const session = this.getSession(id)
    if (!session) return null

    const messages = this.getMessages(id, messageLimit)

    // Mark as active if it was paused
    if (session.status === "paused") {
      this.updateSession(id, { status: "active" })
    }

    return { session, messages }
  }

  // ── Search ─────────────────────────────────────────────────────────

  /**
   * Search session messages by content (LIKE query).
   * Returns matching messages with associated session metadata.
   *
   * @param query - The text to search for (case-insensitive)
   * @param limit - Maximum results to return (default 20)
   * @param role - Optional role filter (user, assistant, system, tool)
   */
  searchMessages(
    query: string,
    limit = 20,
    role?: SessionMessage["role"],
  ): Array<{ message: SessionMessage; session: Pick<SessionRecord, "id" | "name" | "goal" | "status"> }> {
    if (!query || query.trim().length === 0) return []

    // Escape LIKE wildcards so user input is matched literally
    const escaped = query.replace(/[%_]/g, "\\$&")
    const pattern = `%${escaped}%`

    const sql = role
      ? `SELECT m.id, m.session_id, m.role, m.content, m.timestamp, m.tool_calls,
                s.name as s_name, s.goal as s_goal, s.status as s_status
         FROM session_messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE m.content LIKE ? ESCAPE '\\' AND m.role = ?
         ORDER BY m.timestamp DESC
         LIMIT ?`
      : `SELECT m.id, m.session_id, m.role, m.content, m.timestamp, m.tool_calls,
                s.name as s_name, s.goal as s_goal, s.status as s_status
         FROM session_messages m
         JOIN sessions s ON s.id = m.session_id
         WHERE m.content LIKE ? ESCAPE '\\'
         ORDER BY m.timestamp DESC
         LIMIT ?`

    const rows = role
      ? (this.db.prepare(sql).all(pattern, role, limit) as Record<string, unknown>[])
      : (this.db.prepare(sql).all(pattern, limit) as Record<string, unknown>[])

    return rows.map((r) => ({
      message: {
        id: r.id as number,
        sessionId: r.session_id as string,
        role: r.role as SessionMessage["role"],
        content: r.content as string,
        timestamp: r.timestamp as number,
        toolCalls: r.tool_calls as string | undefined,
      },
      session: {
        id: r.session_id as string,
        name: r.s_name as string,
        goal: r.s_goal as string,
        status: r.s_status as SessionRecord["status"],
      },
    }))
  }

  // ── Prune ──────────────────────────────────────────────────────────

  /**
   * Delete all sessions whose last activity (updated_at) is older than
   * the given age in milliseconds. Returns the number of sessions deleted.
   */
  pruneSessions(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs
    const result = this.db.prepare("DELETE FROM sessions WHERE updated_at < ?").run(cutoff as any)
    return result.changes
  }

  // ── Stats ──────────────────────────────────────────────────────────

  getStats(): { totalSessions: number; activeSessions: number; totalMessages: number } {
    const sessionCount = this.db.prepare("SELECT COUNT(*) as c FROM sessions").get() as { c: number }
    const activeCount = this.db.prepare(
      "SELECT COUNT(*) as c FROM sessions WHERE status = 'active'",
    ).get() as { c: number }
    const msgCount = this.db.prepare("SELECT COUNT(*) as c FROM session_messages").get() as { c: number }

    return {
      totalSessions: sessionCount.c,
      activeSessions: activeCount.c,
      totalMessages: msgCount.c,
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  close(): void {
    this.db.close()
    log.info("Session store closed")
  }

  // ── Helpers ────────────────────────────────────────────────────────

  private rowToSession(row: Record<string, unknown>): SessionRecord {
    return {
      id: row.id as string,
      name: row.name as string,
      agentType: row.agent_type as string,
      goal: row.goal as string,
      status: row.status as SessionRecord["status"],
      createdAt: row.created_at as number,
      updatedAt: row.updated_at as number,
      metadata: JSON.parse((row.metadata as string) || "{}"),
    }
  }
}

/** Singleton instance */
export const sessionStore = new SessionStore()

/**
 * Get a project-scoped session store.
 * Sessions are isolated per project under ~/.aegis/projects/<name>/sessions.db.
 * Falls back to the default singleton when project is null.
 */
export function getProjectSessionStore(project?: string | null): SessionStore {
  if (!project) return sessionStore
  return new SessionStore(undefined, project)
}

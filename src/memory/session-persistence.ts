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
  /** ID of the parent session if this is a fork. Null for root sessions. */
  parentSessionId?: string
  /** Message ID at which the fork occurred (the last message copied from parent). */
  checkpointId?: number
  /** Human-readable label for this checkpoint/fork. */
  checkpointName?: string
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

/**
 * Options for forking a session.
 */
export interface ForkOptions {
  /**
   * The message ID to fork at (inclusive).
   * All messages up to and including this ID are copied to the fork.
   * Default: last message in the session.
   */
  atMessageId?: number
  /**
   * A descriptive name for the fork branch (e.g., "try-refactor-approach").
   */
  name?: string
  /**
   * A new goal for the forked session (defaults to parent's goal).
   */
  goal?: string
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
    const resolvedPath =
      dbPath ??
      (project ? getProjectSessionDb(project) : undefined) ??
      join(process.cwd(), "data", "sessions", "sessions.db")

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

    // ── Schema migration: add branching columns ────────────────────────
    // These were added after the initial schema, so existing databases
    // need ALTER TABLE. We try each migration and ignore errors if the
    // column already exists.
    const migrations = [
      `ALTER TABLE sessions ADD COLUMN parent_session_id TEXT REFERENCES sessions(id)`,
      `ALTER TABLE sessions ADD COLUMN checkpoint_id INTEGER`,
      `ALTER TABLE sessions ADD COLUMN checkpoint_name TEXT`,
    ]
    for (const sql of migrations) {
      try {
        this.db.exec(sql)
      } catch {
        // Column already exists — this is expected on warm databases
      }
    }

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_parent
      ON sessions(parent_session_id)
    `)

    this.initialized = true
    log.debug("Session store initialized")
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

    if (updates.name !== undefined) {
      fields.push("name = ?")
      values.push(updates.name)
    }
    if (updates.status !== undefined) {
      fields.push("status = ?")
      values.push(updates.status)
    }
    if (updates.goal !== undefined) {
      fields.push("goal = ?")
      values.push(updates.goal)
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?")
      values.push(JSON.stringify(updates.metadata))
    }
    if (updates.agentType !== undefined) {
      fields.push("agent_type = ?")
      values.push(updates.agentType)
    }

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
      rows = this.db.prepare("SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC").all(status) as Record<
        string,
        unknown
      >[]
    } else {
      rows = this.db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all() as Record<string, unknown>[]
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
    this.db
      .prepare(
        `
      INSERT INTO session_state (session_id, key, value)
      VALUES (?, ?, ?)
      ON CONFLICT(session_id, key) DO UPDATE SET value = excluded.value
    `,
      )
      .run(sessionId, key, value)
  }

  getState(sessionId: string, key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM session_state WHERE session_id = ? AND key = ?")
      .get(sessionId, key) as { value: string } | null
    return row?.value ?? null
  }

  getAllState(sessionId: string): Record<string, string> {
    const rows = this.db.prepare("SELECT key, value FROM session_state WHERE session_id = ?").all(sessionId) as {
      key: string
      value: string
    }[]

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
      rows = this.db
        .prepare("SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC LIMIT ?")
        .all(status, count) as Record<string, unknown>[]
    } else {
      rows = this.db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?").all(count) as Record<
        string,
        unknown
      >[]
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

  // ── Fork / Checkpoint ─────────────────────────────────────────────

  /**
   * Fork a session at a specific message checkpoint, creating a new
   * child session that inherits all messages up to (and including) that
   * message. The new session can then continue independently.
   *
   * Think of this like git branching: the parent session's history up to
   * the checkpoint is immutable, and the fork explores a different path.
   *
   * @param parentId - The session to fork from
   * @param opts - Fork options (message ID at which to fork, name, goal)
   * @returns The newly created forked session record
   */
  forkSession(parentId: string, opts?: ForkOptions): SessionRecord {
    const parent = this.getSession(parentId)
    if (!parent) {
      throw new Error(`Cannot fork: session "${parentId}" not found`)
    }

    const messages = this.getMessages(parentId, 10_000)
    if (messages.length === 0) {
      throw new Error(`Cannot fork: session "${parentId}" has no messages`)
    }

    // Determine the checkpoint — the message ID at which we fork
    const checkpointMsg = opts?.atMessageId
      ? messages.find((m) => m.id === opts.atMessageId)
      : messages[messages.length - 1]

    if (!checkpointMsg) {
      throw new Error(`Cannot fork: checkpoint message ${opts?.atMessageId} not found in session "${parentId}"`)
    }

    // Determine which messages to copy (up to and including the checkpoint)
    const checkpointIdx = messages.findIndex((m) => m.id === checkpointMsg.id)
    const messagesToCopy = messages.slice(0, checkpointIdx + 1)

    // Create the forked session with branching metadata
    const forkId = `fork-${parentId}-${Date.now().toString(36)}`
    const now = Date.now()

    this.db.transaction(() => {
      this.db
        .prepare(
          `
        INSERT INTO sessions (id, name, agent_type, goal, status, created_at, updated_at, metadata,
          parent_session_id, checkpoint_id, checkpoint_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          forkId,
          opts?.name ?? `${parent.name} (fork)`,
          parent.agentType,
          opts?.goal ?? parent.goal,
          "active",
          now,
          now,
          JSON.stringify({ ...parent.metadata, forkedFrom: parentId, forkMessageId: checkpointMsg.id }),
          parentId,
          checkpointMsg.id,
          opts?.name ?? null,
        )

      // Copy messages up to the checkpoint
      const insertMsg = this.db.prepare(`
        INSERT INTO session_messages (session_id, role, content, timestamp, tool_calls)
        VALUES (?, ?, ?, ?, ?)
      `)
      for (const msg of messagesToCopy) {
        insertMsg.run(forkId, msg.role, msg.content, msg.timestamp, msg.toolCalls ?? null)
      }

      // Copy all session state from parent (skip stale checkpoint markers
      // since the fork has its own autoincrement message IDs)
      const parentState = this.getAllState(parentId)
      const insertState = this.db.prepare(`
        INSERT OR IGNORE INTO session_state (session_id, key, value)
        VALUES (?, ?, ?)
      `)
      for (const [key, value] of Object.entries(parentState)) {
        if (key.startsWith("checkpoint:")) continue
        insertState.run(forkId, key, value)
      }
    })()

    // Log the fork
    log.info(`Session "${parentId}" forked as "${forkId}" with ${messagesToCopy.length} messages`)

    return this.getSession(forkId)!
  }

  /**
   * Mark a specific message in a session as a named checkpoint.
   * This makes it easier to later fork at this exact point.
   *
   * @param sessionId - The session to add the checkpoint to
   * @param messageId - The message ID to mark as a checkpoint
   * @param name - A descriptive name for this checkpoint
   */
  createCheckpoint(sessionId: string, messageId: number, name: string): void {
    const session = this.getSession(sessionId)
    if (!session) {
      throw new Error(`Cannot create checkpoint: session "${sessionId}" not found`)
    }

    const messages = this.getMessages(sessionId, 1)
    const exists = messages.some((m) => m.id === messageId)
    if (!exists) {
      throw new Error(`Cannot create checkpoint: message ${messageId} not found in session "${sessionId}"`)
    }

    // Store checkpoint as a state entry for easy querying
    this.setState(sessionId, `checkpoint:${messageId}`, name)

    log.info(`Checkpoint "${name}" created at message ${messageId} in session "${sessionId}"`)
  }

  /**
   * List all forked child sessions from a given parent.
   * Returns sessions that have parent_session_id matching the given session.
   *
   * @param parentId - The parent session to list forks for
   */
  listForks(parentId: string): SessionRecord[] {
    const rows = this.db
      .prepare(
        `
      SELECT * FROM sessions
      WHERE parent_session_id = ?
      ORDER BY created_at ASC
    `,
      )
      .all(parentId) as Record<string, unknown>[]

    return rows.map((r) => this.rowToSession(r))
  }

  /**
   * Get the full fork tree starting from a root session.
   * Returns an array with the parent first, then all children recursively.
   */
  getForkTree(sessionId: string): SessionRecord[] {
    const tree: SessionRecord[] = []
    const visited = new Set<string>()

    const collect = (id: string) => {
      if (visited.has(id)) return
      visited.add(id)
      const session = this.getSession(id)
      if (session) {
        tree.push(session)
        const forks = this.listForks(id)
        for (const fork of forks) {
          collect(fork.id)
        }
      }
    }

    collect(sessionId)
    return tree
  }

  /**
   * Merge messages from a source session into a target session.
   * All messages from the source are appended to the target, preserving
   * order and timestamps. The source session is marked as 'completed'
   * after the merge.
   *
   * @param sourceId - The session to merge messages from
   * @param targetId - The session to merge messages into
   * @returns The updated target session record
   */
  mergeSession(sourceId: string, targetId: string): SessionRecord {
    const source = this.getSession(sourceId)
    const target = this.getSession(targetId)

    if (!source) throw new Error(`Source session "${sourceId}" not found`)
    if (!target) throw new Error(`Target session "${targetId}" not found`)

    const sourceMessages = this.getMessages(sourceId, 10_000)
    if (sourceMessages.length === 0) {
      log.info(`Merge: source "${sourceId}" has no messages — nothing to merge`)
      return target
    }

    this.db.transaction(() => {
      const insertMsg = this.db.prepare(`
        INSERT INTO session_messages (session_id, role, content, timestamp, tool_calls)
        VALUES (?, ?, ?, ?, ?)
      `)
      for (const msg of sourceMessages) {
        insertMsg.run(targetId, msg.role, msg.content, msg.timestamp, msg.toolCalls ?? null)
      }

      // Mark source as completed
      this.db.prepare("UPDATE sessions SET status = 'completed', updated_at = ? WHERE id = ?").run(Date.now(), sourceId)

      // Update target timestamp
      this.db.prepare("UPDATE sessions SET updated_at = ? WHERE id = ?").run(Date.now(), targetId)
    })()

    log.info(`Merged ${sourceMessages.length} messages from "${sourceId}" into "${targetId}"`)

    return this.getSession(targetId)!
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
    const activeCount = this.db.prepare("SELECT COUNT(*) as c FROM sessions WHERE status = 'active'").get() as {
      c: number
    }
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
      parentSessionId: row.parent_session_id as string | undefined,
      checkpointId: row.checkpoint_id as number | undefined,
      checkpointName: row.checkpoint_name as string | undefined,
    }
  }
}

/**
 * Lazily-initialized singleton SessionStore.
 * The instance is created on first property access, not at module load time.
 * This reduces startup overhead by deferring SQLite database open + schema
 * migration until it's actually needed (e.g., not for --help, doctor, status).
 */
let _sessionStore: SessionStore | null = null
function getSessionStore(): SessionStore {
  if (!_sessionStore) _sessionStore = new SessionStore()
  return _sessionStore
}

/**
 * Backward-compatible singleton reference.
 * Uses a Proxy to defer construction until the first property access.
 */
export const sessionStore = new Proxy({} as SessionStore, {
  get(_, prop: PropertyKey) {
    return getSessionStore()[prop as keyof SessionStore]
  },
  has(_, prop: PropertyKey) {
    return prop in getSessionStore()
  },
  ownKeys() {
    return Reflect.ownKeys(getSessionStore())
  },
  getOwnPropertyDescriptor(_, prop: PropertyKey) {
    return Reflect.getOwnPropertyDescriptor(getSessionStore(), prop)
  },
})

// Cache of project-scoped session stores to avoid duplicate init logs and DB connections
const projectStores = new Map<string, SessionStore>()

/**
 * Get a project-scoped session store.
 * Sessions are isolated per project under ~/.aegis/projects/<name>/sessions.db.
 * Falls back to the default singleton when project is null.
 * Caches project-scoped stores to avoid duplicate DB connections / init logs.
 */
export function getProjectSessionStore(project?: string | null): SessionStore {
  if (!project) return sessionStore
  const existing = projectStores.get(project)
  if (existing) return existing
  const store = new SessionStore(undefined, project)
  projectStores.set(project, store)
  return store
}

/**
 * Remove a cached project store and close its database connection.
 * Called when a project is removed to prevent resource leaks.
 */
export function removeProjectStore(project: string): void {
  const store = projectStores.get(project)
  if (store) {
    try {
      store.close()
    } catch {
      /* best effort */
    }
    projectStores.delete(project)
  }
}

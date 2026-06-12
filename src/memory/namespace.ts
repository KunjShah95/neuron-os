import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdirSync, existsSync } from "node:fs"
import { createLogger } from "../cli/logger"

const log = createLogger("memory-namespace")

export interface MemoryNamespace {
  id: string
  agentType: string
  agentId?: string
  ttlDays: number
  createdAt: string
}

export interface NamespaceEntry {
  id: string
  namespaceId: string
  content: string
  type: "fact" | "observation" | "relationship" | "skill"
  source: string
  createdAt: string
  expiresAt: string
  archived: boolean
}

export class MemoryNamespaceManager {
  private db: Database
  private initialized = false

  constructor() {
    const dir = join(process.cwd(), "data", "memory")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(join(dir, "namespaces.db"))
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA synchronous = NORMAL")
    this.init()
  }

  private init(): void {
    if (this.initialized) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS namespaces (
        id TEXT PRIMARY KEY,
        agent_type TEXT NOT NULL,
        agent_id TEXT,
        ttl_days INTEGER NOT NULL DEFAULT 30,
        created_at TEXT NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS namespace_entries (
        id TEXT PRIMARY KEY,
        namespace_id TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('fact', 'observation', 'relationship', 'skill')),
        source TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ns_entries_namespace
      ON namespace_entries(namespace_id, created_at)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ns_entries_expires
      ON namespace_entries(expires_at, archived)
    `)

    this.initialized = true
    log.debug("Memory namespace manager initialized")
  }

  createNamespace(agentType: string, ttlDays: number, agentId?: string): MemoryNamespace {
    const id = `ns-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    const stmt = this.db.prepare(`
      INSERT INTO namespaces (id, agent_type, agent_id, ttl_days, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    stmt.run(id, agentType, agentId ?? null, ttlDays, now)

    return { id, agentType, agentId, ttlDays, createdAt: now }
  }

  addEntry(namespaceId: string, content: string, type: NamespaceEntry["type"], source: string): NamespaceEntry {
    const ns = this.getNamespace(namespaceId)
    if (!ns) throw new Error(`Namespace "${namespaceId}" not found`)

    const id = `nse-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + ns.ttlDays * 24 * 60 * 60 * 1000).toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO namespace_entries (id, namespace_id, content, type, source, created_at, expires_at, archived)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0)
    `)
    stmt.run(id, namespaceId, content, type, source, now, expiresAt)

    return { id, namespaceId, content, type, source, createdAt: now, expiresAt, archived: false }
  }

  query(namespaceIds: string[], searchQuery: string, limit = 20): NamespaceEntry[] {
    if (namespaceIds.length === 0) return []

    const terms = searchQuery.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []

    const placeholders = namespaceIds.map(() => "?").join(",")
    const likeClauses = terms.map(() => "LOWER(e.content) LIKE ?").join(" AND ")
    const params: (string | number | null)[] = [...namespaceIds]
    for (const term of terms) {
      params.push(`%${term}%`)
    }

    const sql = `
      SELECT * FROM namespace_entries e
      WHERE e.namespace_id IN (${placeholders})
        AND e.archived = 0
        AND (${likeClauses})
      ORDER BY e.created_at DESC
      LIMIT ?
    `
    params.push(limit)

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map((r) => this.rowToEntry(r))
  }

  archiveExpired(): number {
    const now = new Date().toISOString()
    const stmt = this.db.prepare(`
      UPDATE namespace_entries SET archived = 1
      WHERE expires_at < ? AND archived = 0
    `)
    const result = stmt.run(now)
    const count = result.changes
    if (count > 0) log.info(`Archived ${count} expired namespace entries`)
    return count
  }

  getStats(): { totalNamespaces: number; totalEntries: number; expiredEntries: number } {
    const nsCount = (this.db.prepare("SELECT COUNT(*) as c FROM namespaces").get() as { c: number }).c
    const entryCount = (this.db.prepare("SELECT COUNT(*) as c FROM namespace_entries").get() as { c: number }).c
    const expired = (
      this.db
        .prepare("SELECT COUNT(*) as c FROM namespace_entries WHERE expires_at < ? AND archived = 0")
        .get(new Date().toISOString()) as { c: number }
    ).c

    return { totalNamespaces: nsCount, totalEntries: entryCount, expiredEntries: expired }
  }

  private getNamespace(id: string): MemoryNamespace | null {
    const row = this.db.prepare("SELECT * FROM namespaces WHERE id = ?").get(id) as Record<string, unknown> | null
    if (!row) return null
    return {
      id: row.id as string,
      agentType: row.agent_type as string,
      agentId: row.agent_id as string | undefined,
      ttlDays: row.ttl_days as number,
      createdAt: row.created_at as string,
    }
  }

  listNamespaces(): MemoryNamespace[] {
    const rows = this.db.prepare("SELECT * FROM namespaces ORDER BY created_at DESC").all() as Record<string, unknown>[]
    return rows.map((r) => ({
      id: r.id as string,
      agentType: r.agent_type as string,
      agentId: r.agent_id as string | undefined,
      ttlDays: r.ttl_days as number,
      createdAt: r.created_at as string,
    }))
  }

  listEntries(namespaceId: string, limit = 50): NamespaceEntry[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM namespace_entries WHERE namespace_id = ? AND archived = 0 ORDER BY created_at DESC LIMIT ?",
      )
      .all(namespaceId, limit) as Record<string, unknown>[]
    return rows.map((r) => this.rowToEntry(r))
  }

  private rowToEntry(row: Record<string, unknown>): NamespaceEntry {
    return {
      id: row.id as string,
      namespaceId: row.namespace_id as string,
      content: row.content as string,
      type: row.type as NamespaceEntry["type"],
      source: row.source as string,
      createdAt: row.created_at as string,
      expiresAt: row.expires_at as string,
      archived: row.archived === 1,
    }
  }

  close(): void {
    this.db.close()
    log.info("Memory namespace manager closed")
  }
}

export const memoryNamespaceManager = new MemoryNamespaceManager()

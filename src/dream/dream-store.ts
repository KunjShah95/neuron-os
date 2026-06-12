import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdirSync, existsSync } from "node:fs"
import { createLogger } from "../cli/logger"
import type { DreamEntry, DreamInsight, DreamType, DreamStatus, DreamVividness } from "./types"

const log = createLogger("dream-store")

function generateId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
}

export class DreamStore {
  private db: Database
  private initialized = false

  constructor(project?: string, options?: { dbPath?: string }) {
    const dir = options?.dbPath
      ? options.dbPath
      : (() => {
          const dataDir = project
            ? join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "projects", project)
            : join(process.cwd(), "data")
          return join(dataDir, "dream")
        })()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(join(dir, "dream.db"))
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA synchronous = NORMAL")
    this.init()
  }

  private init(): void {
    if (this.initialized) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dreams (
        id TEXT PRIMARY KEY,
        agent_type TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL CHECK (type IN ('memory-replay', 'pattern-discovery', 'knowledge-compression', 'counterfactual', 'social-gossip', 'shared-dream-consolidation', 'mood-consolidation')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        vividness TEXT NOT NULL DEFAULT 'moderate' CHECK (vividness IN ('vivid', 'moderate', 'faint')),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        source_ids TEXT NOT NULL DEFAULT '[]',
        summary TEXT NOT NULL DEFAULT '',
        narrative TEXT NOT NULL DEFAULT '',
        insight_ids TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dream_insights (
        id TEXT PRIMARY KEY,
        dream_id TEXT NOT NULL REFERENCES dreams(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('pattern', 'counterfactual', 'correlation', 'compression', 'synthesis')),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.0,
        source_count INTEGER NOT NULL DEFAULT 0,
        actionable INTEGER NOT NULL DEFAULT 0,
        applied INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dreams_agent ON dreams(agent_type, agent_id, started_at DESC)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_dreams_type_status ON dreams(type, status)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_insights_dream ON dream_insights(dream_id)
    `)

    this.initialized = true
    log.debug("Dream store initialized")
  }

  createDream(opts: {
    agentType: string
    agentId?: string
    type: DreamType
  }): DreamEntry {
    const id = generateId()
    const now = new Date().toISOString()
    const entry: DreamEntry = {
      id,
      agentType: opts.agentType,
      agentId: opts.agentId || "",
      type: opts.type,
      status: "pending",
      vividness: "moderate",
      startedAt: now,
      completedAt: null,
      durationMs: 0,
      sourceIds: [],
      summary: "",
      narrative: "",
      insightIds: [],
      metadata: "{}",
    }

    this.db
      .prepare(
        `INSERT INTO dreams (id, agent_type, agent_id, type, status, vividness, started_at, completed_at, duration_ms, source_ids, summary, narrative, insight_ids, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.agentType,
        entry.agentId,
        entry.type,
        entry.status,
        entry.vividness,
        entry.startedAt,
        null,
        entry.durationMs,
        JSON.stringify(entry.sourceIds),
        entry.summary,
        entry.narrative,
        JSON.stringify(entry.insightIds),
        entry.metadata,
      )

    return entry
  }

  updateDream(id: string, updates: Partial<DreamEntry>): void {
    const fields: string[] = []
    const vals: unknown[] = []

    if (updates.status !== undefined) { fields.push("status = ?"); vals.push(updates.status) }
    if (updates.vividness !== undefined) { fields.push("vividness = ?"); vals.push(updates.vividness) }
    if (updates.completedAt !== undefined) { fields.push("completed_at = ?"); vals.push(updates.completedAt) }
    if (updates.durationMs !== undefined) { fields.push("duration_ms = ?"); vals.push(updates.durationMs) }
    if (updates.sourceIds !== undefined) { fields.push("source_ids = ?"); vals.push(JSON.stringify(updates.sourceIds)) }
    if (updates.summary !== undefined) { fields.push("summary = ?"); vals.push(updates.summary) }
    if (updates.narrative !== undefined) { fields.push("narrative = ?"); vals.push(updates.narrative) }
    if (updates.insightIds !== undefined) { fields.push("insight_ids = ?"); vals.push(JSON.stringify(updates.insightIds)) }
    if (updates.metadata !== undefined) { fields.push("metadata = ?"); vals.push(updates.metadata) }

    if (fields.length > 0) {
      vals.push(id)
      this.db.prepare(`UPDATE dreams SET ${fields.join(", ")} WHERE id = ?`).run(...(vals as (string | number | null)[]))
    }
  }

  addInsight(insight: Omit<DreamInsight, "id" | "createdAt"> & { id?: string; createdAt?: string }): DreamInsight {
    const id = insight.id || generateId()
    const now = insight.createdAt || new Date().toISOString()
    const full: DreamInsight = {
      id,
      dreamId: insight.dreamId,
      type: insight.type,
      title: insight.title,
      description: insight.description,
      confidence: insight.confidence,
      sourceCount: insight.sourceCount,
      actionable: insight.actionable,
      applied: insight.applied,
      createdAt: now,
    }

    this.db
      .prepare(
        `INSERT INTO dream_insights (id, dream_id, type, title, description, confidence, source_count, actionable, applied, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(full.id, full.dreamId, full.type, full.title, full.description, full.confidence, full.sourceCount, full.actionable ? 1 : 0, full.applied ? 1 : 0, full.createdAt)

    return full
  }

  getDream(id: string): DreamEntry | null {
    const row = this.db.prepare("SELECT * FROM dreams WHERE id = ?").get(id) as Record<string, unknown> | undefined
    if (!row) return null
    return this.rowToDream(row)
  }

  listDreams(limit = 20, agentType?: string): DreamEntry[] {
    const sql = agentType
      ? "SELECT * FROM dreams WHERE agent_type = ? ORDER BY started_at DESC LIMIT ?"
      : "SELECT * FROM dreams ORDER BY started_at DESC LIMIT ?"
    const rows = agentType
      ? (this.db.prepare(sql).all(agentType, limit) as Record<string, unknown>[])
      : (this.db.prepare(sql).all(limit) as Record<string, unknown>[])
    return rows.map((r) => this.rowToDream(r))
  }

  getInsightsForDream(dreamId: string): DreamInsight[] {
    const rows = this.db
      .prepare("SELECT * FROM dream_insights WHERE dream_id = ? ORDER BY confidence DESC")
      .all(dreamId) as Record<string, unknown>[]
    return rows.map((r) => this.rowToInsight(r))
  }

  getAllInsights(limit = 50, actionableOnly = false): DreamInsight[] {
    const sql = actionableOnly
      ? "SELECT * FROM dream_insights WHERE actionable = 1 ORDER BY confidence DESC LIMIT ?"
      : "SELECT * FROM dream_insights ORDER BY created_at DESC LIMIT ?"
    const rows = this.db.prepare(sql).all(limit) as Record<string, unknown>[]
    return rows.map((r) => this.rowToInsight(r))
  }

  markInsightApplied(id: string): void {
    this.db.prepare("UPDATE dream_insights SET applied = 1 WHERE id = ?").run(id)
  }

  getStats(): {
    totalDreams: number
    completedDreams: number
    totalInsights: number
    actionableInsights: number
    appliedInsights: number
    dreamsByType: Record<string, number>
  } {
    const total = this.db.prepare("SELECT COUNT(*) as c FROM dreams").get() as { c: number }
    const completed = this.db.prepare("SELECT COUNT(*) as c FROM dreams WHERE status = 'completed'").get() as { c: number }
    const insights = this.db.prepare("SELECT COUNT(*) as c FROM dream_insights").get() as { c: number }
    const actionable = this.db.prepare("SELECT COUNT(*) as c FROM dream_insights WHERE actionable = 1").get() as { c: number }
    const applied = this.db.prepare("SELECT COUNT(*) as c FROM dream_insights WHERE applied = 1").get() as { c: number }

    const typeRows = this.db.prepare("SELECT type, COUNT(*) as c FROM dreams GROUP BY type").all() as { type: string; c: number }[]
    const dreamsByType: Record<string, number> = {}
    for (const r of typeRows) dreamsByType[r.type] = r.c

    return {
      totalDreams: total.c,
      completedDreams: completed.c,
      totalInsights: insights.c,
      actionableInsights: actionable.c,
      appliedInsights: applied.c,
      dreamsByType,
    }
  }

  close(): void {
    this.db.close()
    log.info("Dream store closed")
  }

  private rowToDream(row: Record<string, unknown>): DreamEntry {
    return {
      id: row.id as string,
      agentType: row.agent_type as string,
      agentId: row.agent_id as string,
      type: row.type as DreamType,
      status: row.status as DreamStatus,
      vividness: row.vividness as DreamVividness,
      startedAt: row.started_at as string,
      completedAt: row.completed_at as string | null,
      durationMs: row.duration_ms as number,
      sourceIds: JSON.parse((row.source_ids as string) || "[]"),
      summary: row.summary as string,
      narrative: row.narrative as string,
      insightIds: JSON.parse((row.insight_ids as string) || "[]"),
      metadata: (row.metadata as string) || "{}",
    }
  }

  private rowToInsight(row: Record<string, unknown>): DreamInsight {
    return {
      id: row.id as string,
      dreamId: row.dream_id as string,
      type: row.type as DreamInsight["type"],
      title: row.title as string,
      description: row.description as string,
      confidence: row.confidence as number,
      sourceCount: row.source_count as number,
      actionable: (row.actionable as number) === 1,
      applied: (row.applied as number) === 1,
      createdAt: row.created_at as string,
    }
  }
}

export const dreamStore = new DreamStore()

import { Database } from "bun:sqlite"
import { randomBytes } from "node:crypto"
import { join } from "node:path"
import { existsSync, mkdirSync } from "node:fs"

export interface TraceSpan {
  id: string
  parentId?: string
  name: string
  type: "agent" | "tool" | "llm" | "ipc" | "auth" | "memory"
  startTime: number
  endTime?: number
  duration?: number
  status: "ok" | "error" | "pending"
  metadata?: Record<string, unknown>
  tags: string[]
}

export class TraceCollector {
  private db: Database

  constructor() {
    const dbPath = join(process.cwd(), "data", "observability", "traces.db")
    const dir = join(dbPath, "..")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    this.db = new Database(dbPath)
    this.db.exec("PRAGMA journal_mode = WAL")

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        duration INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        tags_json TEXT NOT NULL DEFAULT '[]'
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_traces_parent
      ON traces(parent_id)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_traces_type_status
      ON traces(type, status)
    `)
  }

  startSpan(name: string, type: TraceSpan["type"], parentId?: string, metadata?: Record<string, unknown>): TraceSpan {
    const id = "trace-" + Date.now().toString(36) + "-" + randomBytes(4).toString("hex")
    const span: TraceSpan = {
      id,
      parentId,
      name,
      type,
      startTime: Date.now(),
      status: "pending",
      metadata,
      tags: [],
    }

    this.db
      .prepare(
        `
      INSERT INTO traces (id, parent_id, name, type, start_time, status, metadata_json, tags_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(id, parentId ?? null, name, type, span.startTime, "pending", JSON.stringify(metadata ?? {}), "[]")

    return span
  }

  endSpan(id: string, status: TraceSpan["status"] = "ok"): void {
    const endTime = Date.now()
    const row = this.db.prepare("SELECT start_time FROM traces WHERE id = ?").get(id) as
      | { start_time: number }
      | undefined
    if (!row) return
    const duration = endTime - row.start_time
    this.db
      .prepare("UPDATE traces SET end_time = ?, duration = ?, status = ? WHERE id = ?")
      .run(endTime, duration, status, id)
  }

  getTrace(traceId: string): TraceSpan[] {
    const self = this.db.prepare("SELECT * FROM traces WHERE id = ?").get(traceId) as
      | Record<string, unknown>
      | undefined
    if (!self) return []

    const children = this.db
      .prepare("SELECT * FROM traces WHERE parent_id = ? ORDER BY start_time ASC")
      .all(traceId) as Record<string, unknown>[]

    return [this.rowToSpan(self), ...children.map((r) => this.rowToSpan(r))]
  }

  query(options: { type?: string; status?: string; since?: string; limit?: number }): TraceSpan[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (options.type) {
      conditions.push("type = ?")
      params.push(options.type)
    }
    if (options.status) {
      conditions.push("status = ?")
      params.push(options.status)
    }
    if (options.since) {
      conditions.push("start_time >= ?")
      params.push(new Date(options.since).getTime())
    }

    const where = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : ""
    const limit = options.limit ?? 100
    const sql = "SELECT * FROM traces " + where + " ORDER BY start_time DESC LIMIT " + limit

    const rows = this.db.prepare(sql).all(...(params as any[])) as Record<string, unknown>[]
    return rows.reverse().map((r) => this.rowToSpan(r))
  }

  private rowToSpan(row: Record<string, unknown>): TraceSpan {
    return {
      id: row.id as string,
      parentId: row.parent_id as string | undefined,
      name: row.name as string,
      type: row.type as TraceSpan["type"],
      startTime: row.start_time as number,
      endTime: row.end_time as number | undefined,
      duration: row.duration as number | undefined,
      status: row.status as TraceSpan["status"],
      metadata: JSON.parse((row.metadata_json as string) || "{}"),
      tags: JSON.parse((row.tags_json as string) || "[]"),
    }
  }
}

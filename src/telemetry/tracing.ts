import { Database } from "bun:sqlite"
import { join } from "node:path"
import { existsSync, mkdirSync } from "node:fs"

export interface TraceSpan {
  spanId: string
  parentSpanId?: string
  sessionId: string
  agentId: string
  name: string
  type: "task" | "tool" | "llm" | "reasoning"
  status: "pending" | "success" | "error"
  startTime: number
  endTime?: number
  input?: string
  output?: string
  metadata?: Record<string, unknown>
}

export class TracingStore {
  private db: Database

  constructor() {
    const dbPath = join(process.cwd(), "data", "telemetry", "traces.db")
    const dir = join(dbPath, "..")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    this.db = new Database(dbPath)
    this.db.exec("PRAGMA journal_mode = WAL")
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS spans (
        span_id TEXT PRIMARY KEY,
        parent_span_id TEXT,
        session_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        input TEXT,
        output TEXT,
        metadata TEXT
      )
    `)
  }

  public startSpan(span: Omit<TraceSpan, "status" | "startTime">): TraceSpan {
    const fullSpan: TraceSpan = {
      ...span,
      status: "pending",
      startTime: Date.now()
    }
    
    this.db.prepare(`
      INSERT INTO spans (span_id, parent_span_id, session_id, agent_id, name, type, status, start_time, input, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      fullSpan.spanId, 
      fullSpan.parentSpanId || null, 
      fullSpan.sessionId, 
      fullSpan.agentId, 
      fullSpan.name, 
      fullSpan.type, 
      fullSpan.status, 
      fullSpan.startTime, 
      fullSpan.input || null, 
      fullSpan.metadata ? JSON.stringify(fullSpan.metadata) : null
    )

    return fullSpan
  }

  public endSpan(spanId: string, status: "success" | "error", output?: string) {
    this.db.prepare(`
      UPDATE spans 
      SET status = ?, end_time = ?, output = ? 
      WHERE span_id = ?
    `).run(status, Date.now(), output || null, spanId)
  }

  public getSessionTraces(sessionId: string): TraceSpan[] {
    const rows = this.db.prepare("SELECT * FROM spans WHERE session_id = ? ORDER BY start_time ASC").all(sessionId) as any[]
    return rows.map(r => ({
      spanId: r.span_id,
      parentSpanId: r.parent_span_id,
      sessionId: r.session_id,
      agentId: r.agent_id,
      name: r.name,
      type: r.type,
      status: r.status,
      startTime: r.start_time,
      endTime: r.end_time,
      input: r.input,
      output: r.output,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined
    }))
  }
}

export const tracingStore = new TracingStore()

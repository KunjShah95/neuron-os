import { Database } from "bun:sqlite"
import { join } from "node:path"
import { existsSync, mkdirSync } from "node:fs"

export interface CostRecord {
  id: string
  sessionId: string
  model: string
  promptTokens: number
  completionTokens: number
  costUSD: number
  timestamp: number
}

// Rough estimates for Gemini 1.5 Pro per 1k tokens
const COST_PER_1K_PROMPT = 0.0035
const COST_PER_1K_COMPLETION = 0.0105

export interface ToolCostRecord {
  id: string
  sessionId: string
  toolName: string
  costUSD: number
  agentId: string
  timestamp: number
}

export class BillingTracker {
  private db: Database

  constructor() {
    const dbPath = join(process.cwd(), "data", "billing", "usage.db")
    const dir = join(dbPath, "..")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    this.db = new Database(dbPath)
    this.db.exec("PRAGMA journal_mode = WAL")

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS usage (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_usage (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        cost_usd REAL NOT NULL,
        agent_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS budget (
        id TEXT PRIMARY KEY,
        limit_usd REAL NOT NULL
      )
    `)

    // Initialize budget to $50 if not set
    const hasBudget = this.db.prepare("SELECT * FROM budget WHERE id = 'global'").get()
    if (!hasBudget) {
      this.db.prepare("INSERT INTO budget (id, limit_usd) VALUES ('global', 50.0)").run()
    }
  }

  public recordUsage(sessionId: string, model: string, promptTokens: number, completionTokens: number): CostRecord {
    let modelCost: number
    try {
      const { estimateModelCost: fn } = await import("../economy/cost-router")
      modelCost = fn(model, promptTokens, completionTokens)
    } catch {
      modelCost = Infinity
    }
    const costUSD = isFinite(modelCost) ? modelCost : (promptTokens / 1000) * COST_PER_1K_PROMPT + (completionTokens / 1000) * COST_PER_1K_COMPLETION

    const record: CostRecord = {
      id: `usage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId,
      model,
      promptTokens,
      completionTokens,
      costUSD,
      timestamp: Date.now(),
    }

    this.db
      .prepare(
        `
      INSERT INTO usage (id, session_id, model, prompt_tokens, completion_tokens, cost_usd, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      )
      .run(
        record.id,
        record.sessionId,
        record.model,
        record.promptTokens,
        record.completionTokens,
        record.costUSD,
        record.timestamp,
      )

    return record
  }

  public recordToolUsage(sessionId: string, toolName: string, costUSD: number, agentId: string): ToolCostRecord {
    const record: ToolCostRecord = {
      id: `tool-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      sessionId,
      toolName,
      costUSD,
      agentId,
      timestamp: Date.now(),
    }

    this.db
      .prepare(
        `
      INSERT INTO tool_usage (id, session_id, tool_name, cost_usd, agent_id, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(record.id, record.sessionId, record.toolName, record.costUSD, record.agentId, record.timestamp)

    return record
  }

  public getTotalSpend(): number {
    const row = this.db.prepare("SELECT SUM(cost_usd) as total FROM usage").get() as any
    return row.total || 0
  }

  public getBudgetLimit(): number {
    const row = this.db.prepare("SELECT limit_usd FROM budget WHERE id = 'global'").get() as any
    return row.limit_usd || 0
  }

  public setBudgetLimit(limitUSD: number): void {
    this.db.prepare("UPDATE budget SET limit_usd = ? WHERE id = 'global'").run(limitUSD)
  }

  public hasExceededBudget(): boolean {
    return this.getTotalSpend() >= this.getBudgetLimit()
  }

  /**
   * Get cost breakdown grouped by model.
   */
  public getCostByModel(): Array<{ model: string; totalCost: number; totalTokens: number; callCount: number }> {
    const rows = this.db
      .prepare(
        `
      SELECT
        model,
        SUM(cost_usd) as totalCost,
        SUM(prompt_tokens + completion_tokens) as totalTokens,
        COUNT(*) as callCount
      FROM usage
      GROUP BY model
      ORDER BY totalCost DESC
    `,
      )
      .all() as Array<{ model: string; totalCost: number; totalTokens: number; callCount: number }>
    return rows
  }

  /**
   * Get cost breakdown grouped by session.
   */
  public getCostBySession(): Array<{ sessionId: string; totalCost: number; model: string; callCount: number }> {
    const rows = this.db
      .prepare(
        `
      SELECT
        session_id as sessionId,
        model,
        SUM(cost_usd) as totalCost,
        COUNT(*) as callCount
      FROM usage
      GROUP BY session_id, model
      ORDER BY totalCost DESC
    `,
      )
      .all() as Array<{ sessionId: string; totalCost: number; model: string; callCount: number }>
    return rows
  }

  /**
   * Get daily cost history.
   */
  public getCostHistory(days = 7): Array<{ date: string; totalCost: number }> {
    const cutoff = Date.now() - days * 86400000
    const rows = this.db
      .prepare(
        `
      SELECT
        DATE(timestamp / 1000, 'unixepoch') as date,
        SUM(cost_usd) as totalCost
      FROM usage
      WHERE timestamp >= ?
      GROUP BY date
      ORDER BY date ASC
    `,
      )
      .all(cutoff) as Array<{ date: string; totalCost: number }>
    return rows
  }
}

export const billingTracker = new BillingTracker()

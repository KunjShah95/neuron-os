import { Database } from "bun:sqlite"
import { join } from "node:path"
import { existsSync, mkdirSync } from "node:fs"
import { createLogger } from "../cli/logger"

const log = createLogger("slo")

export interface SLOConfig {
  name: string
  description: string
  target: number
  windowDays: number
  metric: "uptime" | "latency_p50" | "latency_p95" | "latency_p99" | "error_rate" | "success_rate"
  threshold?: number
}

export interface SLOResult {
  name: string
  current: number
  target: number
  met: boolean
  metric: string
  windowDays: number
  history: Array<{ timestamp: string; value: number }>
}

export interface SLOManagerOptions {
  dbPath?: string
  retentionDays?: number
}

export const DEFAULT_SLO_RETENTION_DAYS = 90

export class SLOManager {
  private db: Database
  private retentionDays: number

  constructor(options: SLOManagerOptions = {}) {
    const dbPath = options.dbPath ?? join(process.cwd(), "data", "observability", "slo.db")
    this.retentionDays = Math.max(1, options.retentionDays ?? DEFAULT_SLO_RETENTION_DAYS)
    const dir = join(dbPath, "..")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

    this.db = new Database(dbPath)
    this.db.exec("PRAGMA journal_mode = WAL")

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS slo_configs (
        name TEXT PRIMARY KEY,
        description TEXT NOT NULL DEFAULT '',
        target REAL NOT NULL,
        window_days INTEGER NOT NULL DEFAULT 30,
        metric TEXT NOT NULL,
        threshold REAL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS slo_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        value REAL NOT NULL
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_slo_metrics_name_ts
      ON slo_metrics(name, timestamp DESC)
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_slo_metrics_ts
      ON slo_metrics(timestamp)
    `)
  }

  register(config: SLOConfig): void {
    this.db
      .prepare(
        `
      INSERT OR REPLACE INTO slo_configs (name, description, target, window_days, metric, threshold)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      )
      .run(config.name, config.description, config.target, config.windowDays, config.metric, config.threshold ?? null)
    log.info("SLO registered", { name: config.name, target: config.target, metric: config.metric })
  }

  recordMetric(name: string, value: number): void {
    this.db.prepare("INSERT INTO slo_metrics (name, timestamp, value) VALUES (?, ?, ?)").run(name, Date.now(), value)
    this.pruneMetrics()
  }

  pruneMetrics(): number {
    const cutoff = Date.now() - this.retentionDays * 86400000
    const result = this.db.prepare("DELETE FROM slo_metrics WHERE timestamp < ?").run(cutoff)
    return Number(result.changes ?? 0)
  }

  getRetentionDays(): number {
    return this.retentionDays
  }

  check(name: string): SLOResult | null {
    return this.computeSLO(name)
  }

  checkAll(): SLOResult[] {
    const configs = this.db.prepare("SELECT * FROM slo_configs").all() as Record<string, unknown>[]
    return configs.map((c) => this.computeSLO(c.name as string)).filter((r): r is SLOResult => r !== null)
  }

  getBurnRate(name: string): { rate: number; timeRemaining: string } | null {
    const config = this.db.prepare("SELECT * FROM slo_configs WHERE name = ?").get(name) as
      Record<string, unknown> | undefined
    if (!config) return null

    const target = config.target as number
    const windowDays = config.window_days as number
    const metric = config.metric as string
    const result = this.computeSLO(name)
    if (!result || result.history.length < 2) return null

    const totalWindowMs = windowDays * 86400000
    if (totalWindowMs <= 0) return null

    let rate: number
    if (metric === "error_rate") {
      if (target <= 0) return null
      rate = result.current / target
    } else if (metric === "uptime" || metric === "success_rate") {
      const budgetErrorRate = 1 - target
      if (budgetErrorRate <= 0) return { rate: 0, timeRemaining: "infinite" }
      rate = (1 - result.current) / budgetErrorRate
    } else {
      return null
    }

    if (!Number.isFinite(rate)) return null
    if (rate <= 0) return { rate: 0, timeRemaining: "infinite" }

    const elapsedFraction = this.elapsedFraction(result.history, totalWindowMs)
    const remainingMs = elapsedFraction >= 1 ? 0 : ((1 - elapsedFraction) * totalWindowMs) / rate

    return { rate, timeRemaining: this.formatDuration(Math.max(0, remainingMs)) }
  }

  private elapsedFraction(history: Array<{ timestamp: string; value: number }>, totalWindowMs: number): number {
    if (history.length < 2 || totalWindowMs <= 0) return 0
    const first = Date.parse(history[0]?.timestamp ?? "")
    const last = Date.parse(history[history.length - 1]?.timestamp ?? "")
    if (!Number.isFinite(first) || !Number.isFinite(last)) return 0
    const elapsed = last - first
    if (elapsed <= 0) return 0
    return Math.min(1, elapsed / totalWindowMs)
  }

  private computeSLO(name: string): SLOResult | null {
    const config = this.db.prepare("SELECT * FROM slo_configs WHERE name = ?").get(name) as
      Record<string, unknown> | undefined
    if (!config) return null

    const target = config.target as number
    const windowDays = config.window_days as number
    const metric = config.metric as string
    const threshold = config.threshold as number | undefined
    const cutoff = Date.now() - windowDays * 86400000

    const rows = this.db
      .prepare("SELECT timestamp, value FROM slo_metrics WHERE name = ? AND timestamp >= ? ORDER BY timestamp ASC")
      .all(name, cutoff) as { timestamp: number; value: number }[]

    let current = 0
    if (rows.length > 0) {
      const values = rows.map((r) => r.value).sort((a, b) => a - b)
      switch (metric) {
        case "uptime":
        case "success_rate":
          current = values.reduce((s, v) => s + v, 0) / values.length
          break
        case "error_rate":
          current = values.reduce((s, v) => s + v, 0) / values.length
          break
        case "latency_p50":
          current = values[Math.floor(values.length * 0.5)] ?? 0
          break
        case "latency_p95":
          current = values[Math.floor(values.length * 0.95)] ?? 0
          break
        case "latency_p99":
          current = values[Math.floor(values.length * 0.99)] ?? 0
          break
      }
    }

    let met: boolean
    if (metric === "error_rate") {
      met = current <= target
    } else if (metric.startsWith("latency_")) {
      met = threshold !== undefined ? current <= threshold : current <= target
    } else {
      met = current >= target
    }

    const history = rows.map((r) => ({
      timestamp: new Date(r.timestamp).toISOString(),
      value: r.value,
    }))

    return { name, current, target, met, metric, windowDays, history }
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000)
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const parts: string[] = []
    if (days > 0) parts.push(days + "d")
    if (hours > 0) parts.push(hours + "h")
    if (minutes > 0) parts.push(minutes + "m")
    return parts.join(" ") || "<1m"
  }
}

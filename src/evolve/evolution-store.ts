import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdirSync, existsSync } from "node:fs"
import { createLogger } from "../cli/logger"
import type { CodeMutation, MutationStatus, MutationStrategy } from "./types"

const log = createLogger("evolution-store")

function generateId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
}

export class EvolutionStore {
  private db: Database
  private initialized = false

  constructor(project?: string) {
    const dataDir = project
      ? join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "projects", project)
      : join(process.cwd(), "data")
    const dir = join(dataDir, "evolve")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(join(dir, "evolution.db"))
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA synchronous = NORMAL")
    this.init()
  }

  private init(): void {
    if (this.initialized) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS mutations (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        strategy TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        diff TEXT NOT NULL DEFAULT '',
        old_content TEXT NOT NULL DEFAULT '',
        new_content TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'proposed'
          CHECK (status IN ('proposed','applying','verifying','passed','failed','rolled-back','applied')),
        confidence REAL NOT NULL DEFAULT 0.0,
        source_insight TEXT NOT NULL DEFAULT '',
        source_dream_id TEXT NOT NULL DEFAULT '',
        source_failure_ids TEXT NOT NULL DEFAULT '[]',
        test_results TEXT NOT NULL DEFAULT '',
        test_passed INTEGER NOT NULL DEFAULT 0,
        test_duration_ms INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        applied_at TEXT,
        rollback_at TEXT
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mutations_status ON mutations(status)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mutations_file ON mutations(file_path, created_at DESC)
    `)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_mutations_strategy ON mutations(strategy)
    `)

    this.initialized = true
    log.debug("Evolution store initialized")
  }

  createMutation(opts: {
    filePath: string
    strategy: MutationStrategy
    description: string
    diff: string
    oldContent: string
    newContent: string
    confidence: number
    sourceInsight: string
    sourceDreamId: string
    sourceFailureIds: string[]
  }): CodeMutation {
    const id = generateId()
    const now = new Date().toISOString()
    const mutation: CodeMutation = {
      id,
      filePath: opts.filePath,
      strategy: opts.strategy,
      description: opts.description,
      diff: opts.diff,
      oldContent: opts.oldContent,
      newContent: opts.newContent,
      status: "proposed",
      confidence: opts.confidence,
      sourceInsight: opts.sourceInsight,
      sourceDreamId: opts.sourceDreamId,
      sourceFailureIds: opts.sourceFailureIds,
      testResults: "",
      testPassed: false,
      testDurationMs: 0,
      createdAt: now,
      appliedAt: "",
      rollbackAt: "",
    }

    this.db
      .prepare(
        `INSERT INTO mutations (id, file_path, strategy, description, diff, old_content, new_content, status, confidence,
         source_insight, source_dream_id, source_failure_ids, test_results, test_passed, test_duration_ms, created_at, applied_at, rollback_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        mutation.id,
        mutation.filePath,
        mutation.strategy,
        mutation.description,
        mutation.diff,
        mutation.oldContent,
        mutation.newContent,
        mutation.status,
        mutation.confidence,
        mutation.sourceInsight,
        mutation.sourceDreamId,
        JSON.stringify(mutation.sourceFailureIds),
        mutation.testResults,
        mutation.testPassed ? 1 : 0,
        mutation.testDurationMs,
        mutation.createdAt,
        null,
        null,
      )

    return mutation
  }

  updateMutation(id: string, updates: Partial<CodeMutation>): void {
    const fields: string[] = []
    const vals: unknown[] = []

    if (updates.status !== undefined) { fields.push("status = ?"); vals.push(updates.status) }
    if (updates.diff !== undefined) { fields.push("diff = ?"); vals.push(updates.diff) }
    if (updates.newContent !== undefined) { fields.push("new_content = ?"); vals.push(updates.newContent) }
    if (updates.testResults !== undefined) { fields.push("test_results = ?"); vals.push(updates.testResults) }
    if (updates.testPassed !== undefined) { fields.push("test_passed = ?"); vals.push(updates.testPassed ? 1 : 0) }
    if (updates.testDurationMs !== undefined) { fields.push("test_duration_ms = ?"); vals.push(updates.testDurationMs) }
    if (updates.appliedAt !== undefined) { fields.push("applied_at = ?"); vals.push(updates.appliedAt || null) }
    if (updates.rollbackAt !== undefined) { fields.push("rollback_at = ?"); vals.push(updates.rollbackAt || null) }

    if (fields.length > 0) {
      vals.push(id)
      this.db.prepare(`UPDATE mutations SET ${fields.join(", ")} WHERE id = ?`).run(...(vals as any[]))
    }
  }

  getMutation(id: string): CodeMutation | null {
    const row = this.db.prepare("SELECT * FROM mutations WHERE id = ?").get(id) as Record<string, unknown> | null
    return row ? this.rowToMutation(row) : null
  }

  listMutations(limit = 20, status?: MutationStatus): CodeMutation[] {
    let sql = "SELECT * FROM mutations"
    const params: unknown[] = []
    if (status) {
      sql += " WHERE status = ?"
      params.push(status)
    }
    sql += " ORDER BY created_at DESC LIMIT ?"
    params.push(limit)
    const rows =     this.db.prepare(sql).all(...(params as any[])) as Record<string, unknown>[]
    return rows.map((r) => this.rowToMutation(r))
  }

  getStats(): {
    totalMutations: number
    appliedMutations: number
    failedMutations: number
    rolledBackMutations: number
    averageConfidence: number
    passRate: number
    mutationsByStrategy: Record<string, number>
    topFiles: Array<{ path: string; count: number }>
    lastCycleAt: string
  } {
    const totalMutations = (this.db.prepare("SELECT COUNT(*) as c FROM mutations").get() as any).c
    const appliedMutations = (this.db.prepare("SELECT COUNT(*) as c FROM mutations WHERE status = 'applied'").get() as any).c
    const failedMutations = (this.db.prepare("SELECT COUNT(*) as c FROM mutations WHERE status = 'failed'").get() as any).c
    const rolledBackMutations = (this.db.prepare("SELECT COUNT(*) as c FROM mutations WHERE status = 'rolled-back'").get() as any).c
    const avgRow = this.db.prepare("SELECT AVG(confidence) as avg FROM mutations").get() as any
    const averageConfidence = avgRow.avg || 0
    const tested = (this.db.prepare("SELECT COUNT(*) as c FROM mutations WHERE test_passed IS NOT NULL AND status != 'proposed'").get() as any).c
    const passed = (this.db.prepare("SELECT COUNT(*) as c FROM mutations WHERE test_passed = 1").get() as any).c
    const passRate = tested > 0 ? passed / tested : 0
    const lastCycle = this.db.prepare("SELECT created_at as c FROM mutations ORDER BY created_at DESC LIMIT 1").get() as any

    const strategyRows = this.db.prepare("SELECT strategy, COUNT(*) as c FROM mutations GROUP BY strategy ORDER BY c DESC").all() as any[]
    const mutationsByStrategy: Record<string, number> = {}
    for (const r of strategyRows) mutationsByStrategy[r.strategy] = r.c

    const fileRows = this.db.prepare("SELECT file_path, COUNT(*) as c FROM mutations GROUP BY file_path ORDER BY c DESC LIMIT 5").all() as any[]
    const topFiles = fileRows.map((r: any) => ({ path: r.file_path, count: r.c }))

    return { totalMutations, appliedMutations, failedMutations, rolledBackMutations, averageConfidence, passRate, mutationsByStrategy, topFiles, lastCycleAt: lastCycle?.c || "" }
  }

  private rowToMutation(row: Record<string, unknown>): CodeMutation {
    return {
      id: row.id as string,
      filePath: row.file_path as string,
      strategy: row.strategy as MutationStrategy,
      description: row.description as string,
      diff: row.diff as string,
      oldContent: row.old_content as string,
      newContent: row.new_content as string,
      status: row.status as MutationStatus,
      confidence: row.confidence as number,
      sourceInsight: row.source_insight as string,
      sourceDreamId: row.source_dream_id as string,
      sourceFailureIds: JSON.parse(row.source_failure_ids as string),
      testResults: row.test_results as string,
      testPassed: (row.test_passed as number) === 1,
      testDurationMs: row.test_duration_ms as number,
      createdAt: row.created_at as string,
      appliedAt: (row.applied_at as string) || "",
      rollbackAt: (row.rollback_at as string) || "",
    }
  }
}

export const evolutionStore = new EvolutionStore()

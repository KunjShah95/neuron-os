import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import type { FlakyConfig, FlakyTestRecord, EvalResult } from "./types"

const DEFAULT_CONFIG: FlakyConfig = {
  flakyThreshold: 0.3,
  quarantineAfterFlakes: 3,
  maxRetries: 3,
  flakyHistorySize: 20,
}

export class FlakyManager {
  private dbPath: string
  private records: Map<string, FlakyTestRecord> = new Map()
  private config: FlakyConfig

  constructor(config: Partial<FlakyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.dbPath = resolve(process.cwd(), ".aegis/harness/flaky-tests.json")
    this.loadRecords()
  }

  // ── Public API ────────────────────────────────────────────────

  /**
   * Record a test run. If a retry result is provided and the first attempt
   * failed but the retry passed, the test is marked as flaky.
   */
  recordRun(testId: string, firstAttempt: EvalResult, retryResult?: EvalResult): void {
    let record = this.records.get(testId) ?? this.createRecord(testId)
    record.totalRuns++

    if (retryResult && !firstAttempt.passed && retryResult.passed) {
      record.flakyRuns++
      record.consecutiveFlakes++
      record.flakeHistory.push({
        runId: crypto.randomUUID(),
        firstAttemptScore: firstAttempt.score,
        retryScore: retryResult.score,
        timestamp: new Date().toISOString(),
      })

      // Trim history
      if (record.flakeHistory.length > this.config.flakyHistorySize) {
        record.flakeHistory = record.flakeHistory.slice(-this.config.flakyHistorySize)
      }

      // Auto-quarantine check
      if (
        record.consecutiveFlakes >= this.config.quarantineAfterFlakes ||
        record.flakyRuns / record.totalRuns >= this.config.flakyThreshold
      ) {
        record.status = "quarantined"
        console.warn(
          `[FLAKY] Test "${testId}" automatically quarantined (${record.flakyRuns}/${record.totalRuns} flaky runs)`,
        )
      } else if (record.flakyRuns >= 2) {
        record.status = "flaky"
      }
    } else {
      record.consecutiveFlakes = 0
    }

    this.saveRecords()
  }

  /** Check if a test is currently quarantined */
  isQuarantined(testId: string): boolean {
    return this.records.get(testId)?.status === "quarantined"
  }

  /** Check if a test is flaky (but not yet quarantined) */
  isFlaky(testId: string): boolean {
    return this.records.get(testId)?.status === "flaky"
  }

  /** Get all non-healthy tests sorted by flake frequency */
  getFlakyTests(): FlakyTestRecord[] {
    return [...this.records.values()]
      .filter(r => r.status !== "healthy")
      .sort((a, b) => b.flakyRuns - a.flakyRuns)
  }

  /** Get a specific test's flaky record */
  getRecord(testId: string): FlakyTestRecord | undefined {
    return this.records.get(testId)
  }

  /** Manually un-quarantine a test */
  unquarantine(testId: string): void {
    const record = this.records.get(testId)
    if (record) {
      record.status = "flaky"
      record.consecutiveFlakes = 0
      this.saveRecords()
    }
  }

  /** Manually mark a test as healthy (clear flaky status) */
  markHealthy(testId: string): void {
    const record = this.records.get(testId)
    if (record) {
      record.status = "healthy"
      record.consecutiveFlakes = 0
      this.saveRecords()
    }
  }

  /**
   * Analyze flake patterns and suggest fixes.
   */
  autoSuggestFix(testId: string): { success: boolean; suggestion: string } | null {
    const record = this.records.get(testId)
    if (!record) return null

    const hasTimeout = record.flakeHistory.some(h => h.firstAttemptScore === 0)
    const hasEnvError = record.flakeHistory.some(h => h.firstAttemptScore < 0.3)

    let suggestion: string
    if (hasTimeout) {
      suggestion = `Increase timeout for test "${testId}" — multiple zero-score runs detected`
    } else if (hasEnvError) {
      suggestion = `Review environment setup for "${testId}" — low scores suggest sandbox issues`
    } else {
      suggestion = `Review test judge for "${testId}" — flaky scoring suggests unreliable grading`
    }

    return { success: true, suggestion }
  }

  /** Get summary statistics */
  getSummary(): { healthy: number; flaky: number; quarantined: number; total: number } {
    const all = [...this.records.values()]
    return {
      healthy: all.filter(r => r.status === "healthy").length,
      flaky: all.filter(r => r.status === "flaky").length,
      quarantined: all.filter(r => r.status === "quarantined").length,
      total: all.length,
    }
  }

  // ── Persistence ───────────────────────────────────────────────

  private createRecord(testId: string): FlakyTestRecord {
    return {
      testId,
      totalRuns: 0,
      flakyRuns: 0,
      consecutiveFlakes: 0,
      lastFlakyDate: "",
      flakeHistory: [],
      status: "healthy",
    }
  }

  private loadRecords(): void {
    try {
      if (existsSync(this.dbPath)) {
        const data = JSON.parse(readFileSync(this.dbPath, "utf-8"))
        if (Array.isArray(data)) {
          for (const record of data) {
            this.records.set(record.testId, record)
          }
        }
      }
    } catch {
      // Corrupted file — start fresh
      this.records.clear()
    }
  }

  private saveRecords(): void {
    try {
      const dir = resolve(this.dbPath, "..")
      mkdirSync(dir, { recursive: true })
      writeFileSync(this.dbPath, JSON.stringify([...this.records.values()], null, 2), "utf-8")
    } catch {
      // Non-fatal — persistence failure shouldn't crash the runner
    }
  }
}

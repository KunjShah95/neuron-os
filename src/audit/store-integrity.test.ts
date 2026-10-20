/**
 * Audit log integrity hardening:
 *  - LIMIT/OFFSET are bound as parameters and coerced to safe integers
 *  - every row carries a chained hash so tampering is detectable
 *  - secrets in recorded content (including file before/after payloads) are
 *    scrubbed before they are hashed
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Database } from "bun:sqlite"
import { AuditStore, type AuditEntry } from "./store"

function makeEntry(overrides?: Partial<Omit<AuditEntry, "id">>): Omit<AuditEntry, "id"> {
  return {
    sessionId: "session-audit-1",
    project: "audit-test",
    stepIndex: 1,
    eventType: "thought",
    summary: "Test entry",
    detail: "Detail text",
    context: "{}",
    agentThought: "thinking",
    durationMs: 12,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe("AuditStore integrity", () => {
  let dir: string
  let dbPath: string
  let store: AuditStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "audit-integrity-"))
    dbPath = join(dir, "audit.log.db")
    store = new AuditStore({ dbPath })
  })

  afterEach(() => {
    store.close()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  })

  // ── LIMIT / OFFSET binding ───────────────────────────────────────────

  it("never lets a hostile limit reach the SQL statement", () => {
    for (let i = 0; i < 5; i++) {
      store.record(makeEntry({ summary: `entry-${i}` }))
    }

    const hostile = "5; DROP TABLE audit_log" as unknown as number
    let entries: AuditEntry[] = []
    expect(() => {
      entries = store.query({ limit: hostile })
    }).not.toThrow()

    expect(entries.length).toBe(5)
    expect(store.getStats().totalEntries).toBe(5)
  })

  it("falls back to a safe default for non-integer or negative limits", () => {
    for (let i = 0; i < 3; i++) {
      store.record(makeEntry({ summary: `entry-${i}` }))
    }

    expect(store.query({ limit: -10 }).length).toBe(3)
    expect(store.query({ limit: 1.5 }).length).toBe(1)
    expect(store.query({ limit: Number.NaN }).length).toBe(3)
    expect(store.query({ offset: -5 }).length).toBe(3)
  })

  it("keeps limit and offset as bound parameters", () => {
    for (let i = 0; i < 6; i++) {
      store.record(makeEntry({ summary: `entry-${i}`, stepIndex: i }))
    }

    const page = store.query({ limit: 2, offset: 2 })
    expect(page.length).toBe(2)
    expect(store.getStats().totalEntries).toBe(6)
  })

  // ── Hash chain ───────────────────────────────────────────────────────

  it("verifies a freshly written chain", () => {
    store.record(makeEntry({ summary: "one" }))
    store.record(makeEntry({ summary: "two" }))

    const report = store.verifyIntegrity()
    expect(report.valid).toBe(true)
    expect(report.totalRows).toBe(2)
    expect(report.verifiedRows).toBe(2)
    expect(report.brokenAt).toBeNull()
  })

  it("detects a tampered row", () => {
    store.record(makeEntry({ summary: "original" }))
    store.record(makeEntry({ summary: "second" }))
    store.record(makeEntry({ summary: "third" }))

    expect(store.verifyIntegrity().valid).toBe(true)

    const attacker = new Database(dbPath)
    attacker.exec("DROP TRIGGER IF EXISTS audit_log_block_update")
    attacker.prepare("UPDATE audit_log SET summary = ? WHERE id = 1").run("tampered")
    attacker.close()

    const report = store.verifyIntegrity()
    expect(report.valid).toBe(false)
    expect(report.brokenAt).toBe(1)
    expect(report.reason).toContain("hash mismatch")
  })

  it("detects a deleted row in the middle of the chain", () => {
    store.record(makeEntry({ summary: "one" }))
    store.record(makeEntry({ summary: "two" }))
    store.record(makeEntry({ summary: "three" }))

    const attacker = new Database(dbPath)
    attacker.exec("DROP TRIGGER IF EXISTS audit_log_block_delete")
    attacker.prepare("DELETE FROM audit_log WHERE id = 2").run()
    attacker.close()

    const report = store.verifyIntegrity()
    expect(report.valid).toBe(false)
    expect(report.brokenAt).toBe(3)
  })

  it("blocks updates and deletes through the public database", () => {
    store.record(makeEntry({ summary: "one" }))

    const attacker = new Database(dbPath)
    expect(() => attacker.prepare("UPDATE audit_log SET summary = 'x' WHERE id = 1").run()).toThrow()
    expect(() => attacker.prepare("DELETE FROM audit_log WHERE id = 1").run()).toThrow()
    attacker.close()
  })

  it("treats rows written before the chain existed as an unverifiable prefix", () => {
    const legacy = new Database(dbPath)
    legacy.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        project TEXT NOT NULL DEFAULT '',
        step_index INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        summary TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        context TEXT NOT NULL DEFAULT '{}',
        agent_thought TEXT NOT NULL DEFAULT '',
        duration_ms INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL
      )
    `)
    legacy
      .prepare(
        `INSERT INTO audit_log (session_id, project, step_index, event_type, summary, detail, context, agent_thought, duration_ms, timestamp)
         VALUES ('legacy', '', 0, 'thought', 'legacy row', '', '{}', '', 0, '2020-01-01T00:00:00.000Z')`,
      )
      .run()
    legacy.close()

    const migrated = new AuditStore({ dbPath })
    migrated.record(makeEntry({ summary: "after migration" }))

    const report = migrated.verifyIntegrity()
    expect(report.valid).toBe(true)
    expect(report.unverifiablePrefix).toBe(1)
    expect(report.verifiedRows).toBe(1)
    migrated.close()
  })

  // ── Secret scrubbing ─────────────────────────────────────────────────

  it("scrubs secrets in file write payloads before hashing them", () => {
    process.env.TEST_AUDIT_FILE_KEY = "file-secret-value-1234"
    const before = "const key = 'file-secret-value-1234'"
    const after = "const key = 'file-secret-value-1234' // rotated"

    store.record(
      makeEntry({
        eventType: "file_write",
        summary: "Write: src/config.ts",
        detail: JSON.stringify({ path: "src/config.ts", before, after }),
      }),
    )

    const entries = store.query({ eventType: "file_write" })
    expect(entries.length).toBe(1)
    const entry = entries[0]!
    expect(entry.detail).not.toContain("file-secret-value-1234")
    expect(entry.detail).toContain("[REDACTED]")
    expect(store.verifyIntegrity().valid).toBe(true)

    delete process.env.TEST_AUDIT_FILE_KEY
  })
})

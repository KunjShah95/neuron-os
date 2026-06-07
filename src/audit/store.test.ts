/**
 * Tests for the AuditStore (append-only audit log).
 * Covers recording, querying with filters, session tracking, and stats.
 *
 * Usage: bun test ./src/audit/test-store.ts
 */

import { describe, it, expect, beforeEach } from "bun:test"
import { randomUUID } from "node:crypto"
import type { AuditEntry, AuditEventType } from "./store"
import { AuditStore } from "./store"

// ── Helpers ───────────────────────────────────────────────────────────

function makeSessionId(): string {
  return `test-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}

function makeEntry(sessionId: string, overrides?: Partial<Omit<AuditEntry, "id">>): Omit<AuditEntry, "id"> {
  return {
    sessionId,
    project: "test-project",
    stepIndex: 1,
    eventType: "thought" as AuditEventType,
    summary: "Test entry",
    detail: "Detail text",
    context: "{}",
    agentThought: "I am thinking...",
    durationMs: 100,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe("AuditStore", () => {
  let store: AuditStore
  const testSessions: string[] = []

  beforeEach(() => {
    store = new AuditStore()
  })

  // ── Record ──────────────────────────────────────────────────────────

  it("should record an entry and return its ID", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    const id = store.record(makeEntry(sessionId))
    expect(typeof id).toBe("number")
    expect(id).toBeGreaterThan(0)
  })

  it("should record entries with all event types", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    const types: AuditEventType[] = [
      "thought",
      "tool_call",
      "tool_result",
      "file_read",
      "file_write",
      "file_delete",
      "shell_command",
      "approval_request",
      "approval_result",
      "error",
      "session_start",
      "session_end",
    ]

    for (const eventType of types) {
      const id = store.record(makeEntry(sessionId, { eventType, stepIndex: 1 }))
      expect(id).toBeGreaterThan(0)
    }
  })

  it("should handle sparse entry gracefully", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    const entry = makeEntry(sessionId)
    expect(() => store.record(entry)).not.toThrow()
  })

  // ── Query ───────────────────────────────────────────────────────────

  it("should query entries by session ID", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    store.record(makeEntry(sessionId, { summary: "entry-1" }))
    store.record(makeEntry(sessionId, { summary: "entry-2" }))

    const entries = store.query({ sessionId })
    expect(entries).toHaveLength(2)
    expect(entries.every((e) => e.sessionId === sessionId)).toBe(true)
  })

  it("should query entries by project", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    store.record(makeEntry(sessionId, { project: "alpha" }))
    store.record(makeEntry(sessionId, { project: "beta" }))

    const alpha = store.query({ project: "alpha" })
    expect(alpha.every((e) => e.project === "alpha")).toBe(true)
  })

  it("should query entries by event type", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    store.record(makeEntry(sessionId, { eventType: "thought", summary: "think" }))
    store.record(makeEntry(sessionId, { eventType: "tool_call", summary: "call" }))
    store.record(makeEntry(sessionId, { eventType: "error", summary: "err" }))

    const thoughts = store.query({ eventType: "thought" })
    expect(thoughts.every((e) => e.eventType === "thought")).toBe(true)
    expect(thoughts.some((e) => e.summary === "think")).toBe(true)
  })

  it("should query entries with since filter", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    const past = new Date(Date.now() - 3600_000).toISOString()
    const recent = new Date().toISOString()

    store.record(makeEntry(sessionId, { timestamp: past, summary: "old" }))
    store.record(makeEntry(sessionId, { timestamp: recent, summary: "new" }))

    const sinceEntries = store.query({ since: new Date(Date.now() - 600_000).toISOString() })
    expect(sinceEntries.some((e) => e.summary === "new")).toBe(true)
  })

  it("should limit query results", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    for (let i = 0; i < 10; i++) {
      store.record(makeEntry(sessionId, { summary: `entry-${i}` }))
    }

    const limited = store.query({ sessionId, limit: 3 })
    expect(limited.length).toBeLessThanOrEqual(3)
  })

  it("should query with offset", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    for (let i = 0; i < 5; i++) {
      store.record(makeEntry(sessionId, { summary: `entry-${i}`, stepIndex: i }))
    }

    const offset2 = store.query({ sessionId, limit: 10, offset: 2 })
    expect(offset2.length).toBeLessThanOrEqual(3)
  })

  it("should combine multiple filters", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    store.record(makeEntry(sessionId, { eventType: "thought", project: "proj-x" }))
    store.record(makeEntry(sessionId, { eventType: "tool_call", project: "proj-x" }))
    store.record(makeEntry(sessionId, { eventType: "thought", project: "proj-y" }))

    const filtered = store.query({ sessionId, eventType: "thought", project: "proj-x" })
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.eventType).toBe("thought")
    expect(filtered[0]?.project).toBe("proj-x")
  })

  // ── Convenience Methods ─────────────────────────────────────────────

  it("should get session audit entries", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    store.record(makeEntry(sessionId, { summary: "a" }))
    store.record(makeEntry(sessionId, { summary: "b" }))

    const entries = store.getSessionAudit(sessionId)
    expect(entries).toHaveLength(2)
  })

  it("should get recent entries", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    store.record(makeEntry(sessionId, { summary: "recent-test" }))

    const recent = store.getRecent(10)
    expect(recent.some((e) => e.summary === "recent-test")).toBe(true)
  })

  it("should get recent entries scoped to project", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    store.record(makeEntry(sessionId, { project: "scope-test" }))

    const scoped = store.getRecent(10, "scope-test")
    expect(scoped.every((e) => e.project === "scope-test")).toBe(true)
  })

  it("should get entries by event type", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    store.record(makeEntry(sessionId, { eventType: "error" }))
    store.record(makeEntry(sessionId, { eventType: "thought" }))

    const errors = store.getByType("error")
    expect(errors.every((e) => e.eventType === "error")).toBe(true)
  })

  // ── Stats ───────────────────────────────────────────────────────────

  it("should return stats with all required fields", () => {
    const stats = store.getStats()
    expect(typeof stats.totalEntries).toBe("number")
    expect(typeof stats.totalSessions).toBe("number")
    expect(typeof stats.byType).toBe("object")
    expect(stats.totalEntries).toBeGreaterThanOrEqual(0)
    expect(stats.totalSessions).toBeGreaterThanOrEqual(0)
  })

  it("should track entry count correctly", () => {
    const before = store.getStats().totalEntries
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    for (let i = 0; i < 5; i++) {
      store.record(makeEntry(sessionId))
    }

    const after = store.getStats().totalEntries
    expect(after - before).toBe(5)
  })

  it("should track session count correctly", () => {
    const before = store.getStats().totalSessions
    const s1 = makeSessionId()
    const s2 = makeSessionId()
    testSessions.push(s1, s2)

    store.record(makeEntry(s1))
    store.record(makeEntry(s1))
    store.record(makeEntry(s2))

    const after = store.getStats().totalSessions
    expect(after - before).toBe(2)
  })

  it("should group entries by event type in stats", () => {
    const sessionId = makeSessionId()
    testSessions.push(sessionId)

    store.record(makeEntry(sessionId, { eventType: "thought" }))
    store.record(makeEntry(sessionId, { eventType: "thought" }))
    store.record(makeEntry(sessionId, { eventType: "error" }))

    const stats = store.getStats()
    expect(stats.byType["thought"]).toBeGreaterThanOrEqual(2)
    expect(stats.byType["error"]).toBeGreaterThanOrEqual(1)
  })

  // ── Cleanup ─────────────────────────────────────────────────────────

  it("should close without error", () => {
    expect(() => store.close()).not.toThrow()
  })
})

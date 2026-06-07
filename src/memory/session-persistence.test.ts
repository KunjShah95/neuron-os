import { describe, it, expect } from "bun:test"
/**
 * Smoke tests for session persistence — SQLite-backed session store
 * integrated with AgentEngine.
 *
 * Tests:
 * 1. chat() persists user + assistant messages to SQLite
 * 2. completeSession() sets correct status (completed/failed)
 * 3. restoreRecentSessions() returns sessions in order (newest first)
 */

import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { SessionStore } from "./session-persistence"
import { createTestEngine } from "../test-utils/mock-ai"

describe("Session Persistence Tests", () => {
  const TMP_ROOT = resolve(process.cwd(), "tmp-test-sess-persist-" + Date.now())

  /** Create a fresh SessionStore with a temp database file. */
  function createStore(subdir: string): SessionStore {
    const dir = resolve(TMP_ROOT, subdir)
    mkdirSync(dir, { recursive: true })
    const dbPath = resolve(dir, "sessions.db")
    return new SessionStore(dbPath)
  }

  // ── Test 1: chat() persists messages to SQLite ──────────────────────

  it("should chat persists messages", async () => {
    const store = createStore("test-chat-persist")

    const { engine } = await createTestEngine(
      TMP_ROOT,
      "chat-persist-engine",
      "I am the assistant response for testing.",
      {
        sessionId: "chat-persist-1",
        sessionStore: store,
        maxSteps: 1,
      },
    )

    await engine.chat([{ role: "user", content: "Hello from user!" }] as any)

    // Session should have been created automatically
    const session = store.getSession("chat-persist-1")
    expect(session !== null).toBe(true)
    expect(session!.status).toBe("active")

    // At least 2 messages: user + assistant
    const messages = store.getMessages("chat-persist-1")
    expect(messages.length >= 2).toBe(true)

    const userMsg = messages.find((m) => m.role === "user")
    expect(userMsg !== undefined).toBe(true)
    expect(userMsg!.content.includes("Hello from user")).toBe(true)

    const assistantMsg = messages.find((m) => m.role === "assistant")
    expect(assistantMsg !== undefined).toBe(true)
    expect(assistantMsg!.content.includes("assistant response")).toBe(true)

    // Timestamps are numeric and positive
    expect(typeof userMsg!.timestamp === "number").toBe(true)
    expect(userMsg!.timestamp > 0).toBe(true)

    store.close()
  })

  // ── Test 2: completeSession() sets the correct status ────────────────

  it("should complete session sets status", async () => {
    const store = createStore("test-complete-status")

    // ── completed status ──
    const { engine: engineCompleted } = await createTestEngine(TMP_ROOT, "complete-engine-1", "Task completed.", {
      sessionId: "complete-test-ok",
      sessionStore: store,
      maxSteps: 1,
    })
    await engineCompleted.chat([{ role: "user", content: "Run task" }] as any)
    await engineCompleted.completeSession("completed")

    const sessionOk = store.getSession("complete-test-ok")
    expect(sessionOk !== null).toBe(true)
    expect(sessionOk!.status).toBe("completed")

    // ── failed status ──
    const { engine: engineFailed } = await createTestEngine(TMP_ROOT, "complete-engine-2", "Task failed.", {
      sessionId: "complete-test-fail",
      sessionStore: store,
      maxSteps: 1,
    })
    await engineFailed.chat([{ role: "user", content: "Do risky thing" }] as any)
    await engineFailed.completeSession("failed")

    const sessionFail = store.getSession("complete-test-fail")
    expect(sessionFail !== null).toBe(true)
    expect(sessionFail!.status).toBe("failed")

    // Sessions are independent — first is unchanged
    const sessionOkAgain = store.getSession("complete-test-ok")
    expect(sessionOkAgain!.status).toBe("completed")

    store.close()
  })

  // ── Test 3: restoreRecentSessions() returns sessions in order ──────

  it("should restore recent sessions order", async () => {
    const store = createStore("test-restore-order")

    // Create sessions with staggered timestamps (50ms gap ensures ordering)
    store.createSession({
      id: "restore-old",
      name: "Oldest Session",
      agentType: "test",
      goal: "old goal",
      status: "completed",
      metadata: {},
    })
    await new Promise((r) => setTimeout(r, 50))

    store.createSession({
      id: "restore-mid",
      name: "Middle Session",
      agentType: "test",
      goal: "mid goal",
      status: "completed",
      metadata: {},
    })
    await new Promise((r) => setTimeout(r, 50))

    store.createSession({
      id: "restore-new",
      name: "Newest Session",
      agentType: "test",
      goal: "new goal",
      status: "active",
      metadata: {},
    })

    // Restore all — should be newest first
    const restored = store.restoreRecentSessions(10)

    // All 3 should be present (fresh store, no other sessions)
    expect(restored.length).toBe(3)

    // Order is newest-first by updatedAt
    expect(restored[0]!.id).toBe("restore-new")
    expect(restored[1]!.id).toBe("restore-mid")
    expect(restored[2]!.id).toBe("restore-old")

    // ── Test with limit ──
    const limited = store.restoreRecentSessions(2)
    expect(limited.length).toBe(2)

    // ── Test with status filter ──
    const activeOnly = store.restoreRecentSessions(10, "active")
    expect(activeOnly.length).toBe(1)
    expect(activeOnly[0]!.id).toBe("restore-new")

    store.close()
  })

  // ── Runner ──────────────────────────────────────────────────────────
})

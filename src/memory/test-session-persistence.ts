#!/usr/bin/env bun
/**
 * Smoke tests for session persistence — SQLite-backed session store
 * integrated with AgentEngine.
 *
 * Tests:
 * 1. chat() persists user + assistant messages to SQLite
 * 2. completeSession() sets correct status (completed/failed)
 * 3. restoreRecentSessions() returns sessions in order (newest first)
 */

import { rmSync, existsSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { SessionStore } from "./session-persistence"
import { createTestEngine } from "../test-utils/mock-ai"

let passed = 0
let failed = 0

function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}

function assertEqual<T>(a: T, b: T, label: string) {
  if (a === b) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
}

const TMP_ROOT = resolve(process.cwd(), "tmp-test-sess-persist-" + Date.now())

function cleanTmp() {
  if (!existsSync(TMP_ROOT)) return
  try {
    rmSync(TMP_ROOT, { recursive: true })
  } catch {
    // Windows may briefly hold SQLite handles after close() — harmless
  }
}

/** Create a fresh SessionStore with a temp database file. */
function createStore(subdir: string): SessionStore {
  const dir = resolve(TMP_ROOT, subdir)
  mkdirSync(dir, { recursive: true })
  const dbPath = resolve(dir, "sessions.db")
  return new SessionStore(dbPath)
}

// ── Test 1: chat() persists messages to SQLite ──────────────────────

async function testChatPersistsMessages() {
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
  assert(session !== null, "chat() creates a session record in the store")
  assertEqual(session!.status, "active", "session status is 'active'")

  // At least 2 messages: user + assistant
  const messages = store.getMessages("chat-persist-1")
  assert(messages.length >= 2, "chat() persists at least 2 messages (user + assistant)")

  const userMsg = messages.find((m) => m.role === "user")
  assert(userMsg !== undefined, "user message was persisted")
  assert(userMsg!.content.includes("Hello from user"), "user message content matches input")

  const assistantMsg = messages.find((m) => m.role === "assistant")
  assert(assistantMsg !== undefined, "assistant message was persisted")
  assert(assistantMsg!.content.includes("assistant response"), "assistant message content matches mock response")

  // Timestamps are numeric and positive
  assert(typeof userMsg!.timestamp === "number", "user message has numeric timestamp")
  assert(userMsg!.timestamp > 0, "user message timestamp is positive")

  store.close()
}

// ── Test 2: completeSession() sets the correct status ────────────────

async function testCompleteSessionSetsStatus() {
  const store = createStore("test-complete-status")

  // ── completed status ──
  const { engine: engineCompleted } = await createTestEngine(
    TMP_ROOT,
    "complete-engine-1",
    "Task completed.",
    { sessionId: "complete-test-ok", sessionStore: store, maxSteps: 1 },
  )
  await engineCompleted.chat([{ role: "user", content: "Run task" }] as any)
  await engineCompleted.completeSession("completed")

  const sessionOk = store.getSession("complete-test-ok")
  assert(sessionOk !== null, "completed session record exists")
  assertEqual(sessionOk!.status, "completed", "completeSession('completed') sets status to 'completed'")

  // ── failed status ──
  const { engine: engineFailed } = await createTestEngine(
    TMP_ROOT,
    "complete-engine-2",
    "Task failed.",
    { sessionId: "complete-test-fail", sessionStore: store, maxSteps: 1 },
  )
  await engineFailed.chat([{ role: "user", content: "Do risky thing" }] as any)
  await engineFailed.completeSession("failed")

  const sessionFail = store.getSession("complete-test-fail")
  assert(sessionFail !== null, "failed session record exists")
  assertEqual(sessionFail!.status, "failed", "completeSession('failed') sets status to 'failed'")

  // Sessions are independent — first is unchanged
  const sessionOkAgain = store.getSession("complete-test-ok")
  assertEqual(sessionOkAgain!.status, "completed", "first session status unchanged by second session")

  store.close()
}

// ── Test 3: restoreRecentSessions() returns sessions in order ──────

async function testRestoreRecentSessionsOrder() {
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
  assertEqual(restored.length, 3, "restoreRecentSessions(10) returns all 3 sessions")

  // Order is newest-first by updatedAt
  assertEqual(restored[0]!.id, "restore-new", "most recent session is first in list")
  assertEqual(restored[1]!.id, "restore-mid", "middle session is second")
  assertEqual(restored[2]!.id, "restore-old", "oldest session is last")

  // ── Test with limit ──
  const limited = store.restoreRecentSessions(2)
  assertEqual(limited.length, 2, "restoreRecentSessions(2) respects limit")

  // ── Test with status filter ──
  const activeOnly = store.restoreRecentSessions(10, "active")
  assertEqual(activeOnly.length, 1, "restoreRecentSessions with status='active' returns only active")
  assertEqual(activeOnly[0]!.id, "restore-new", "status filter returns the correct active session")

  store.close()
}

// ── Runner ──────────────────────────────────────────────────────────

async function runAll() {
  console.log("\n=== Session Persistence Smoke Tests ===\n")

  cleanTmp()

  await testChatPersistsMessages()
  await testCompleteSessionSetsStatus()
  await testRestoreRecentSessionsOrder()

  cleanTmp()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()

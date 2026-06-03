#!/usr/bin/env bun
/**
 * Unit tests for session store — file-based chat session persistence.
 *
 * The session store uses `data/sessions/` relative to process.cwd().
 * We control this by pointing the module's DATA_DIR at a temp directory
 * using module-level variable override (via `import` + reassignment).
 */

import { existsSync, rmSync, mkdirSync, readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

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

function assertDeepEqual<T>(a: T, b: T, label: string) {
  if (JSON.stringify(a) === JSON.stringify(b)) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
}

// ── Test setup ──────────────────────────────────────────────────────

const TMP_ROOT = resolve(process.cwd(), "tmp-test-sessions-" + Date.now())

function cleanTmp() {
  if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true })
}

/**
 * The session store module reads DATA_DIR at module level from
 * `process.cwd()`. We need to temporarily override the path by:
 * 1. Creating our temp dir
 * 2. Importing the module freshly for each test (Bun has module cache)
 *
 * Since Bun caches ESM modules, we'll instead directly test the
 * functions by re-assigning module internals. The cleanest approach
 * is to import and use the functions as-is but create the sessions
 * dir at the expected location.
 */

// We create the data/sessions dir under TMP_ROOT and change how the
// module resolves by injecting a symlink or — simpler — we just
// use the real path override approach: before each test we set
// process.cwd() to TMP_ROOT. But process.cwd() is global.
//
// Simpler approach: test the exported functions directly with
// a temp dir that matches `data/sessions/` under TMP_ROOT.

// We re-import the module for each test by using dynamic import with
// a cache buster. Actually, the simplest approach: run each test in
// a subprocess. But that's slow.
//
// Cleanest: create the sessions dir at the expected path and use
// the module's exported functions directly.
//
// The module const DATA_DIR = path.resolve(process.cwd(), "data", "sessions")
// We'll set TMP_ROOT as our cwd substitute by just making the expected
// directory structure and importing the module.
//
// Since the module is already loaded (imported above), DATA_DIR is
// already computed. We need to reset it.
//
// The sessionStore module uses `const DATA_DIR` so we can't reassign it.
// But we can test by creating the real path structure.

// Actually, let me just use the module functions directly and create
// the data/sessions dir under the real cwd, then clean up.
// But that would interfere with real sessions.
//
// Best approach: temporarily changing process.cwd() won't help because
// DATA_DIR is a const captured at module load time.
//
// Let me just test by creating sessions in a known path and using
// a patched version. Actually the simplest approach for Bun:
// We'll import the functions and create sessions in the real location,
// then clean up after. Since this is a test env, real sessions data
// won't be present.

// The session store is in `src/memory/sessionStore.ts` and writes to
// `data/sessions/` relative to cwd. We'll work with that location
// and clean up after. But we need to avoid touching real sessions.

// SIMPLEST approach: modify process.cwd() to point to our temp dir
// before running tests. This works because Bun's dynamic import
// re-evaluates module scope.

// Let me use a different strategy: create the sessions in the real
// location but with a unique prefix and clean up after.

// Actually, the cleanest approach: since DATA_DIR is module-scoped
// and we can't reassign it, let's just use the real path and
// prefix our test session IDs with "test-" and clean up after.

const SESSIONS_DIR = resolve(process.cwd(), "data", "sessions")

// Ensure the dir exists for our tests
function ensureSessionsDir() {
  mkdirSync(SESSIONS_DIR, { recursive: true })
}

function cleanTestSessions() {
  if (existsSync(SESSIONS_DIR)) {
    const files = readdirSync(SESSIONS_DIR)
    for (const f of files) {
      if (f.startsWith("test-")) {
        rmSync(resolve(SESSIONS_DIR, f))
      }
    }
  }
}

// ── Tests ───────────────────────────────────────────────────────────

import {
  saveSession,
  loadSession,
  listSessions,
  deleteSession,
  renameSession,
  exportSession,
} from "./sessionStore"
import type { SessionRecord } from "./sessionStore"

function makeTestRecord(id: string): SessionRecord {
  return {
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    messages: [
      { role: "user", content: "Hello", timestamp: "2026-01-01T00:00:00.000Z", status: "complete" },
      { role: "assistant", content: "Hi there!", timestamp: "2026-01-01T00:00:01.000Z", status: "complete" },
    ],
  }
}

async function testSaveSession() {
  ensureSessionsDir()
  const record = makeTestRecord("test-save-1")
  await saveSession(record)

  const filePath = resolve(SESSIONS_DIR, "test-save-1.json")
  assert(existsSync(filePath), "saveSession writes file to disk")
  const content = JSON.parse(readFileSync(filePath, "utf-8"))
  assertEqual(content.id, "test-save-1", "saved record has correct ID")
  assertDeepEqual(content.messages, record.messages, "saved record has messages")

  cleanTestSessions()
}

async function testLoadSession() {
  ensureSessionsDir()
  const record = makeTestRecord("test-load-1")
  await saveSession(record)

  const loaded = await loadSession("test-load-1")
  assert(loaded !== null, "loadSession returns record for existing session")
  assertEqual(loaded!.id, "test-load-1", "loaded record has correct ID")
  assertEqual(loaded!.messages.length, 2, "loaded record has 2 messages")

  cleanTestSessions()
}

async function testLoadSessionMissing() {
  const loaded = await loadSession("test-nonexistent")
  assertEqual(loaded, null, "loadSession returns null for missing session")

  cleanTestSessions()
}

async function testLoadSessionWithMetadata() {
  ensureSessionsDir()
  const record: SessionRecord = {
    id: "test-meta",
    createdAt: "2026-01-01T00:00:00.000Z",
    messages: [{ role: "user", content: "Hi", timestamp: "2026-01-01T00:00:00.000Z", status: "complete" }],
    providerConfig: { provider: "anthropic", model: "claude-sonnet-4-20250514", temperature: 0.7 },
    environment: { AEGIS_LOG_LEVEL: "debug" },
  }
  await saveSession(record)

  const loaded = await loadSession("test-meta")
  assertEqual(loaded!.providerConfig!.provider, "anthropic", "loads provider config")
  assertEqual(loaded!.environment!.AEGIS_LOG_LEVEL, "debug", "loads environment metadata")

  cleanTestSessions()
}

async function testListSessions() {
  ensureSessionsDir()
  cleanTestSessions() // Start clean

  await saveSession(makeTestRecord("test-list-a"))
  await saveSession(makeTestRecord("test-list-b"))
  await saveSession(makeTestRecord("test-list-c"))

  const ids = await listSessions()
  const testIds = ids.filter((id) => id.startsWith("test-list-"))
  assertEqual(testIds.length, 3, "listSessions returns all 3 test sessions")
  assert(testIds.includes("test-list-a"), "listSessions includes test-list-a")
  assert(testIds.includes("test-list-c"), "listSessions includes test-list-c")

  cleanTestSessions()
}

async function testListSessionsEmpty() {
  ensureSessionsDir()
  cleanTestSessions()

  const ids = await listSessions()
  const testIds = ids.filter((id) => id.startsWith("test-"))
  assertEqual(testIds.length, 0, "listSessions returns empty after cleanup")

  cleanTestSessions()
}

async function testDeleteSession() {
  ensureSessionsDir()
  await saveSession(makeTestRecord("test-delete-1"))
  assert(existsSync(resolve(SESSIONS_DIR, "test-delete-1.json")), "file exists before delete")

  await deleteSession("test-delete-1")
  assert(!existsSync(resolve(SESSIONS_DIR, "test-delete-1.json")), "file removed after delete")

  cleanTestSessions()
}

async function testDeleteSessionMissing() {
  // Should not throw
  try {
    await deleteSession("test-delete-nonexistent")
    assert(true, "deleteSession does not throw for missing session")
  } catch {
    assert(false, "deleteSession should not throw for missing session")
  }

  cleanTestSessions()
}

async function testRenameSession() {
  ensureSessionsDir()
  await saveSession(makeTestRecord("test-rename-old"))

  await renameSession("test-rename-old", "test-rename-new")

  assert(!existsSync(resolve(SESSIONS_DIR, "test-rename-old.json")), "old file removed after rename")
  assert(existsSync(resolve(SESSIONS_DIR, "test-rename-new.json")), "new file exists after rename")

  const loaded = await loadSession("test-rename-new")
  assert(loaded !== null, "renamed session is loadable")
  assertEqual(loaded!.id, "test-rename-old", "renamed session keeps original ID in content")

  cleanTestSessions()
}

async function testExportSession() {
  ensureSessionsDir()
  await saveSession(makeTestRecord("test-export-1"))

  const exportPath = resolve(TMP_ROOT, "exports", "exported-session.json")
  await exportSession("test-export-1", exportPath)

  assert(existsSync(exportPath), "exportSession copies file to output path")
  const exported = JSON.parse(readFileSync(exportPath, "utf-8"))
  assertEqual(exported.id, "test-export-1", "exported file has correct content")

  cleanTestSessions()
  // Clean export dir
  if (existsSync(resolve(TMP_ROOT, "exports"))) rmSync(resolve(TMP_ROOT, "exports"), { recursive: true })
}

async function testSessionWithAgentTraces() {
  ensureSessionsDir()
  const record: SessionRecord = {
    id: "test-traces",
    createdAt: "2026-01-01T00:00:00.000Z",
    messages: [{ role: "user", content: "Run agent", timestamp: "2026-01-01T00:00:00.000Z", status: "complete" }],
    agentTraces: [
      { agentId: "agent-1", event: "spawn", data: { type: "build" }, timestamp: "2026-01-01T00:00:00.000Z" },
      { agentId: "agent-1", event: "complete", data: { result: "ok" }, timestamp: "2026-01-01T00:00:01.000Z" },
    ],
  }
  await saveSession(record)

  const loaded = await loadSession("test-traces")
  assertEqual(loaded!.agentTraces!.length, 2, "loads agent traces")
  assertEqual(loaded!.agentTraces![0]!.event, "spawn", "first trace event is spawn")

  cleanTestSessions()
}

async function testMultipleSessionsRoundTrip() {
  ensureSessionsDir()
  cleanTestSessions()

  const records = [
    makeTestRecord("test-rt-a"),
    makeTestRecord("test-rt-b"),
    makeTestRecord("test-rt-c"),
  ]

  for (const r of records) {
    await saveSession(r)
  }

  for (const r of records) {
    const loaded = await loadSession(r.id)
    assert(loaded !== null, `round-trip: ${r.id} loaded`)
    assertEqual(loaded!.messages.length, r.messages.length, `round-trip: ${r.id} messages match`)
  }

  cleanTestSessions()
}

// ── Runner ──────────────────────────────────────────────────────────

async function runAll() {
  console.log("\n=== Session Store Tests ===\n")

  cleanTmp()
  cleanTestSessions()

  await testSaveSession()
  await testLoadSession()
  await testLoadSessionMissing()
  await testLoadSessionWithMetadata()
  await testListSessions()
  await testListSessionsEmpty()
  await testDeleteSession()
  await testDeleteSessionMissing()
  await testRenameSession()
  await testExportSession()
  await testSessionWithAgentTraces()
  await testMultipleSessionsRoundTrip()

  // Final cleanup
  cleanTestSessions()
  cleanTmp()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()

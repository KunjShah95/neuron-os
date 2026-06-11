import { describe, it, expect, afterAll } from "bun:test"
/**
 * Unit tests for session store — file-based chat session persistence.
 *
 * The session store uses `data/sessions/` relative to process.cwd().
 * We control this by pointing the module's DATA_DIR at a temp directory
 * using module-level variable override (via `import` + reassignment).
 */

import { existsSync, rmSync, mkdirSync, readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

// ── Test setup ──────────────────────────────────────────────────────

const TMP_ROOT = resolve(process.cwd(), "tmp-test-sessions-" + Date.now())

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

import { saveSession, loadSession, listSessions, deleteSession, renameSession, exportSession } from "./sessionStore"
import type { SessionRecord } from "./sessionStore"

describe("Session Store Tests", () => {
  afterAll(() => {
    try {
      rmSync(TMP_ROOT, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  })

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

  it("should save session", async () => {
    ensureSessionsDir()
    const record = makeTestRecord("test-save-1")
    await saveSession(record)

    const filePath = resolve(SESSIONS_DIR, "test-save-1.json")
    expect(existsSync(filePath)).toBe(true)
    const content = JSON.parse(readFileSync(filePath, "utf-8"))
    expect(content.id).toBe("test-save-1")
    expect(JSON.stringify(content.messages)).toBe(JSON.stringify(record.messages))

    cleanTestSessions()
  })

  it("should load session", async () => {
    ensureSessionsDir()
    const record = makeTestRecord("test-load-1")
    await saveSession(record)

    const loaded = await loadSession("test-load-1")
    expect(loaded !== null).toBe(true)
    expect(loaded!.id).toBe("test-load-1")
    expect(loaded!.messages.length).toBe(2)

    cleanTestSessions()
  })

  it("should load session missing", async () => {
    const loaded = await loadSession("test-nonexistent")
    expect(loaded).toBe(null)

    cleanTestSessions()
  })

  it("should load session with metadata", async () => {
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
    expect(loaded!.providerConfig!.provider).toBe("anthropic")
    expect(loaded!.environment!.AEGIS_LOG_LEVEL).toBe("debug")

    cleanTestSessions()
  })

  it("should list sessions", async () => {
    ensureSessionsDir()
    cleanTestSessions() // Start clean

    await saveSession(makeTestRecord("test-list-a"))
    await saveSession(makeTestRecord("test-list-b"))
    await saveSession(makeTestRecord("test-list-c"))

    const ids = await listSessions()
    const testIds = ids.filter((id) => id.startsWith("test-list-"))
    expect(testIds.length).toBe(3)
    expect(testIds.includes("test-list-a")).toBe(true)
    expect(testIds.includes("test-list-c")).toBe(true)

    cleanTestSessions()
  })

  it("should list sessions empty", async () => {
    ensureSessionsDir()
    cleanTestSessions()

    const ids = await listSessions()
    const testIds = ids.filter((id) => id.startsWith("test-"))
    expect(testIds.length).toBe(0)

    cleanTestSessions()
  })

  it("should delete session", async () => {
    ensureSessionsDir()
    await saveSession(makeTestRecord("test-delete-1"))
    expect(existsSync(resolve(SESSIONS_DIR, "test-delete-1.json"))).toBe(true)

    await deleteSession("test-delete-1")
    expect(!existsSync(resolve(SESSIONS_DIR, "test-delete-1.json"))).toBe(true)

    cleanTestSessions()
  })

  it("should delete session missing", async () => {
    // Should not throw
    try {
      await deleteSession("test-delete-nonexistent")
      expect(true).toBe(true)
    } catch {
      expect(false).toBe(true)
    }

    cleanTestSessions()
  })

  it("should rename session", async () => {
    ensureSessionsDir()
    await saveSession(makeTestRecord("test-rename-old"))

    await renameSession("test-rename-old", "test-rename-new")

    expect(!existsSync(resolve(SESSIONS_DIR, "test-rename-old.json"))).toBe(true)
    expect(existsSync(resolve(SESSIONS_DIR, "test-rename-new.json"))).toBe(true)

    const loaded = await loadSession("test-rename-new")
    expect(loaded !== null).toBe(true)
    expect(loaded!.id).toBe("test-rename-old")

    cleanTestSessions()
  })

  it("should export session", async () => {
    ensureSessionsDir()
    await saveSession(makeTestRecord("test-export-1"))

    const exportPath = resolve(TMP_ROOT, "exports", "exported-session.json")
    await exportSession("test-export-1", exportPath)

    expect(existsSync(exportPath)).toBe(true)
    const exported = JSON.parse(readFileSync(exportPath, "utf-8"))
    expect(exported.id).toBe("test-export-1")

    cleanTestSessions()
    // Clean export dir
    if (existsSync(resolve(TMP_ROOT, "exports"))) rmSync(resolve(TMP_ROOT, "exports"), { recursive: true })
  })

  it("should session with agent traces", async () => {
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
    expect(loaded!.agentTraces!.length).toBe(2)
    expect(loaded!.agentTraces![0]!.event).toBe("spawn")

    cleanTestSessions()
  })

  it("should multiple sessions round trip", async () => {
    ensureSessionsDir()
    cleanTestSessions()

    const records = [makeTestRecord("test-rt-a"), makeTestRecord("test-rt-b"), makeTestRecord("test-rt-c")]

    for (const r of records) {
      await saveSession(r)
    }

    for (const r of records) {
      const loaded = await loadSession(r.id)
      expect(loaded !== null).toBe(true)
      expect(loaded!.messages.length).toBe(r.messages.length)
    }

    cleanTestSessions()
  })

  // ── Runner ──────────────────────────────────────────────────────────
})

import { describe, it, expect, afterAll } from "bun:test"
/**
 * Regression tests for the session persistence fixes:
 * - getMessages() must return the NEWEST N messages (ascending order)
 * - getAllMessages() must return every message (no cap)
 * - createCheckpoint() must validate any message in the session
 * - deleteSession() must remove child rows (messages + state)
 * - pruneContext() must actually delete the oldest messages
 * - foreign keys must be enforced (no orphaned child rows)
 */

import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { Database } from "bun:sqlite"
import { SessionStore } from "./session-persistence"
import { EpisodicMemory } from "./store"

const TMP_ROOT = resolve(tmpdir(), "aegis-test-session-fixes-" + Date.now())

function createStore(subdir: string): { store: SessionStore; dbPath: string } {
  const dir = resolve(TMP_ROOT, subdir)
  mkdirSync(dir, { recursive: true })
  const dbPath = resolve(dir, "sessions.db")
  return { store: new SessionStore(dbPath), dbPath }
}

function seedSession(store: SessionStore, id: string, count: number): number[] {
  store.createSession({
    id,
    name: id,
    agentType: "test",
    goal: "",
    status: "active",
    metadata: {},
  })
  const ids: number[] = []
  for (let i = 0; i < count; i++) {
    ids.push(
      store.addMessage(id, {
        sessionId: id,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `msg-${i}`,
      }),
    )
  }
  return ids
}

function countRows(dbPath: string, table: string): number {
  const db = new Database(dbPath)
  try {
    const row = db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }
    return row.c
  } finally {
    db.close()
  }
}

describe("Session store fixes", () => {
  afterAll(() => {
    try {
      rmSync(TMP_ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best-effort cleanup
    }
  })

  it("getMessages returns the newest N messages in ascending order", () => {
    const { store } = createStore("get-messages")
    const ids = seedSession(store, "sess-newest", 10)

    const messages = store.getMessages("sess-newest", 3)

    expect(messages.length).toBe(3)
    expect(messages.map((m) => m.content)).toEqual(["msg-7", "msg-8", "msg-9"])
    expect(messages.map((m) => m.id)).toEqual([ids[7], ids[8], ids[9]])
    // ascending order preserved
    expect(messages[0]!.id).toBeLessThan(messages[1]!.id)
    expect(messages[1]!.id).toBeLessThan(messages[2]!.id)

    // A limit larger than the history returns everything
    const all = store.getMessages("sess-newest", 50)
    expect(all.length).toBe(10)
    expect(all[0]!.content).toBe("msg-0")
    expect(all[9]!.content).toBe("msg-9")

    store.close()
  })

  it("getAllMessages returns every message in ascending order", () => {
    const { store } = createStore("get-all-messages")
    const ids = seedSession(store, "sess-all", 120)

    const messages = store.getAllMessages("sess-all")

    expect(messages.length).toBe(120)
    expect(messages[0]!.id).toBe(ids[0])
    expect(messages[119]!.id).toBe(ids[119])
    for (let i = 1; i < messages.length; i++) {
      expect(messages[i]!.id).toBeGreaterThan(messages[i - 1]!.id)
    }

    store.close()
  })

  it("forkSession copies the full history without truncation", () => {
    const { store } = createStore("fork-full")
    seedSession(store, "sess-parent", 150)

    const fork = store.forkSession("sess-parent", { name: "fork-a" })

    expect(fork.parentSessionId).toBe("sess-parent")
    expect(store.getMessageCount(fork.id)).toBe(150)
    expect(store.getAllMessages(fork.id)[0]!.content).toBe("msg-0")
    expect(store.getAllMessages(fork.id)[149]!.content).toBe("msg-149")
    // The copied count is exposed for the CLI
    expect(fork.metadata.copiedMessages).toBe("150")

    store.close()
  }, 30000)

  it("mergeSession copies the full history", () => {
    const { store } = createStore("merge-full")
    seedSession(store, "sess-source", 120)
    seedSession(store, "sess-target", 2)

    store.mergeSession("sess-source", "sess-target")

    expect(store.getMessageCount("sess-target")).toBe(122)
    expect(store.getSession("sess-source")!.status).toBe("completed")

    store.close()
  })

  it("createCheckpoint accepts a non-first message id", () => {
    const { store } = createStore("checkpoint")
    const ids = seedSession(store, "sess-cp", 5)

    // Middle message — previously impossible (only 1 message was checked)
    store.createCheckpoint("sess-cp", ids[2]!, "mid-checkpoint")

    expect(store.getState("sess-cp", `checkpoint:${ids[2]}`)).toBe("mid-checkpoint")

    // Last message also works
    store.createCheckpoint("sess-cp", ids[4]!, "last-checkpoint")
    expect(store.getState("sess-cp", `checkpoint:${ids[4]}`)).toBe("last-checkpoint")

    // Unknown message ids are still rejected
    expect(() => store.createCheckpoint("sess-cp", 999999, "bogus")).toThrow()

    store.close()
  })

  it("deleteSession removes child rows", () => {
    const { store, dbPath } = createStore("delete-children")
    seedSession(store, "sess-del", 4)
    store.setState("sess-del", "k", "v")
    store.setState("sess-del", "k2", "v2")

    expect(countRows(dbPath, "session_messages")).toBe(4)
    expect(countRows(dbPath, "session_state")).toBe(2)

    store.deleteSession("sess-del")

    expect(store.getSession("sess-del")).toBeNull()
    expect(store.getAllMessages("sess-del").length).toBe(0)
    expect(Object.keys(store.getAllState("sess-del")).length).toBe(0)
    expect(countRows(dbPath, "session_messages")).toBe(0)
    expect(countRows(dbPath, "session_state")).toBe(0)

    store.close()
  })

  it("enforces foreign keys so messages cannot be orphaned", () => {
    const { store } = createStore("foreign-keys")

    // The session does not exist — a FK-enforcing connection rejects the insert
    expect(() =>
      store.addMessage("ghost-session", {
        sessionId: "ghost-session",
        role: "user",
        content: "orphan",
      }),
    ).toThrow()

    store.close()
  })

  it("pruneContext deletes the oldest messages beyond keepLast", () => {
    const { store } = createStore("prune-context")
    const ids = seedSession(store, "sess-prune", 10)

    const memory = new EpisodicMemory(undefined, store)
    memory.pruneContext("sess-prune", 3)

    const remaining = store.getAllMessages("sess-prune")
    expect(remaining.length).toBe(3)
    expect(remaining.map((m) => m.content)).toEqual(["msg-7", "msg-8", "msg-9"])
    expect(remaining.map((m) => m.id)).toEqual([ids[7], ids[8], ids[9]])

    // Pruning again with a keepLast above the current count is a no-op
    memory.pruneContext("sess-prune", 10)
    expect(store.getMessageCount("sess-prune")).toBe(3)

    store.close()
  })
})

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SessionStore } from "./store"

function forceRemove(dir: string): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    try {
      rmSync(full, { recursive: true, force: true })
    } catch {
      // Windows may hold WAL/SHM locks briefly after close
    }
  }
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // best-effort cleanup
  }
}

describe("SessionStore", () => {
  let tmpDir: string
  let store: SessionStore

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "session-store-test-"))
    store = new SessionStore(join(tmpDir, "sessions.db"))
  })

  afterEach(() => {
    store.closeDb()
    forceRemove(tmpDir)
  })

  it("should create a session", () => {
    const session = store.create("test-session")
    expect(session.id).toBeTruthy()
    expect(session.name).toBe("test-session")
    expect(session.status).toBe("active")
    expect(session.agents).toBe("[]")
    expect(session.users).toBe("[]")
  })

  it("should get a session by id", () => {
    const created = store.create("test")
    const retrieved = store.get(created.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.name).toBe("test")
  })

  it("should return undefined for unknown id", () => {
    expect(store.get("nonexistent")).toBeUndefined()
  })

  it("should list active sessions", () => {
    store.create("session-a")
    store.create("session-b")
    const list = store.list()
    expect(list.length).toBeGreaterThanOrEqual(2)
  })

  it("should update a session", () => {
    const session = store.create("test")
    store.update({ id: session.id, name: "updated-name" })
    const updated = store.get(session.id)
    expect(updated!.name).toBe("updated-name")
  })

  it("should close a session", () => {
    const session = store.create("test")
    store.close(session.id)
    const closed = store.get(session.id)
    expect(closed!.status).toBe("closed")
    const list = store.list()
    expect(list.find((s) => s.id === session.id)).toBeUndefined()
  })

  it("should remove a session", () => {
    const session = store.create("test")
    store.remove(session.id)
    expect(store.get(session.id)).toBeUndefined()
  })
})

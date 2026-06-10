import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SessionStore } from "./store"
import { SessionManager } from "./manager"

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

describe("SessionManager", () => {
  let tmpDir: string
  let store: SessionStore
  let manager: SessionManager

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "session-manager-test-"))
    store = new SessionStore(join(tmpDir, "sessions.db"))
    manager = new SessionManager(store)
  })

  afterEach(() => {
    manager.closeDb()
    forceRemove(tmpDir)
  })

  it("should create a session with creator as user", () => {
    const session = manager.create("test-session", "user-1")
    expect(session.name).toBe("test-session")
    const users = JSON.parse(session.users)
    expect(users).toEqual(["user-1"])
  })

  it("should add and remove agents", () => {
    const session = manager.create("test", "user-1")
    const agents = manager.addAgent(session.id, "agent-1")
    expect(agents).toContain("agent-1")

    const updated = manager.get(session.id)
    expect(JSON.parse(updated!.agents)).toContain("agent-1")

    const afterRemove = manager.removeAgent(session.id, "agent-1")
    expect(afterRemove).not.toContain("agent-1")
  })

  it("should join and leave users", () => {
    const session = manager.create("test", "user-1")
    const users = manager.joinUser(session.id, "user-2")
    expect(users).toContain("user-2")

    const afterLeave = manager.leaveUser(session.id, "user-1")
    expect(afterLeave).not.toContain("user-1")
  })

  it("should close a session", () => {
    const session = manager.create("test", "user-1")
    manager.close(session.id)
    const closed = manager.get(session.id)
    expect(closed!.status).toBe("closed")
  })

  it("should emit events", () => {
    const events: string[] = []
    manager.on("user_joined", (e) => events.push(e.event))

    manager.create("test", "user-1")
    expect(events).toContain("user_joined")
  })

  it("should call onStateChange callback", () => {
    const changes: string[] = []
    manager.onStateChange = (id) => {
      changes.push(id)
    }

    manager.create("test", "user-1")
    expect(changes.length).toBeGreaterThanOrEqual(1)
  })
})

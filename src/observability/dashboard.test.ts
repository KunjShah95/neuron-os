import { describe, it, expect, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { DashboardProvider } from "./dashboard"
import { SessionStore } from "../session/store"
import { agentManager } from "../agent/manager"

const originalList = agentManager.list

function fakeAgent(status: string, exitCode: number | null) {
  return {
    id: "agent-" + Math.random().toString(36).slice(2, 8),
    status,
    exitCode,
    spawnTime: Date.now(),
    log: [],
  }
}

afterEach(() => {
  ;(agentManager as any).list = originalList
})

describe("dashboard uptime", () => {
  it("computes uptime from finished agents only", () => {
    const provider = new DashboardProvider({ sloOptions: { dbPath: join(tmpdir(), "dashboard-uptime-1.db") } })
    ;(agentManager as any).list = () => [fakeAgent("running", null), fakeAgent("error", 1), fakeAgent("stopped", 0)]

    expect((provider as any).computeUptime()).toBeCloseTo(0.5, 5)
  })

  it("does not let running agents reduce uptime", () => {
    const provider = new DashboardProvider({ sloOptions: { dbPath: join(tmpdir(), "dashboard-uptime-2.db") } })
    ;(agentManager as any).list = () => [
      fakeAgent("running", null),
      fakeAgent("running", null),
      fakeAgent("busy", null),
      fakeAgent("stopped", 0),
    ]

    expect((provider as any).computeUptime()).toBeCloseTo(1, 5)
  })
})

describe("dashboard session count", () => {
  let tmp: string
  let store: SessionStore

  afterEach(() => {
    try {
      store.closeDb()
    } catch {}
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {}
  })

  it("counts sessions from the session store", () => {
    tmp = mkdtempSync(join(tmpdir(), "dashboard-sessions-"))
    store = new SessionStore(join(tmp, "sessions.db"))
    store.create("first")
    store.create("second")

    const provider = new DashboardProvider({ sessionStore: store })
    expect((provider as any).countSessions()).toBe(2)
  })

  it("reports zero sessions for an empty store", () => {
    tmp = mkdtempSync(join(tmpdir(), "dashboard-sessions-empty-"))
    store = new SessionStore(join(tmp, "sessions.db"))

    const provider = new DashboardProvider({ sessionStore: store })
    expect((provider as any).countSessions()).toBe(0)
  })
})

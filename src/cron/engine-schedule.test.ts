import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { parseCronSchedule, isCronJobDue, startCronEngine, type CronJob } from "./engine"
import { agentManager } from "../agent/manager"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("cron schedule parsing", () => {
  it("parses interval schedules", () => {
    expect(parseCronSchedule("30m")).toBe(30 * 60 * 1000)
    expect(parseCronSchedule("1h")).toBe(60 * 60 * 1000)
    expect(parseCronSchedule("6h")).toBe(6 * 60 * 60 * 1000)
    expect(parseCronSchedule("1d")).toBe(24 * 60 * 60 * 1000)
    expect(parseCronSchedule("45s")).toBe(45 * 1000)
  })

  it("rejects invalid or zero-length schedules", () => {
    expect(parseCronSchedule("bogus")).toBeNull()
    expect(parseCronSchedule("")).toBeNull()
    expect(parseCronSchedule("0s")).toBeNull()
  })
})

describe("cron job due logic", () => {
  const daily: CronJob = { name: "daily", schedule: "1d", goal: "g" }

  it("is not due before the job interval elapses", () => {
    expect(isCronJobDue(daily, 60 * 60 * 1000, 0)).toBe(false)
  })

  it("is due once the job interval elapses", () => {
    expect(isCronJobDue(daily, 24 * 60 * 60 * 1000, 0)).toBe(true)
  })

  it("never becomes due when the schedule is invalid", () => {
    const broken: CronJob = { name: "broken", schedule: "nope", goal: "g" }
    expect(isCronJobDue(broken, 10_000_000_000, 0)).toBe(false)
  })
})

describe("cron engine scheduling", () => {
  let tmp: string
  let spawns: string[]
  const originalSpawn = agentManager.spawn
  const originalSendIpc = agentManager.sendIpc

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "cron-engine-"))
    process.env.AEGIS_DATA_DIR = tmp
    spawns = []
    ;(agentManager as any).spawn = async (def: { name: string }) => {
      spawns.push(def.name)
      return "agent-test"
    }
    ;(agentManager as any).sendIpc = () => {}
  })

  afterEach(() => {
    ;(agentManager as any).spawn = originalSpawn
    ;(agentManager as any).sendIpc = originalSendIpc
    delete process.env.AEGIS_DATA_DIR
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {}
  })

  const writeJobs = (jobs: CronJob[]) => {
    writeFileSync(join(tmp, "cron-jobs.json"), JSON.stringify(jobs), "utf-8")
  }

  it("does not run a daily job on every heartbeat tick", async () => {
    writeJobs([{ name: "daily", schedule: "1d", goal: "daily goal" }])

    let fakeNow = 1_700_000_000_000
    const timers = startCronEngine({ heartbeatMs: 10, now: () => fakeNow })

    try {
      await sleep(120)
      expect(spawns.length).toBe(0)

      fakeNow += 60 * 60 * 1000
      await sleep(120)
      expect(spawns.length).toBe(0)

      fakeNow += 24 * 60 * 60 * 1000
      await sleep(120)
      expect(spawns.length).toBe(1)
      expect(spawns[0]).toBe("cron-daily")

      fakeNow += 60 * 60 * 1000
      await sleep(120)
      expect(spawns.length).toBe(1)
    } finally {
      for (const timer of timers) timer.stop()
    }
  })

  it("runs a job only when its own schedule is due", async () => {
    writeJobs([{ name: "hourly", schedule: "1h", goal: "hourly goal" }])

    let fakeNow = 1_700_000_000_000
    const timers = startCronEngine({ heartbeatMs: 10, now: () => fakeNow })

    try {
      await sleep(100)
      expect(spawns.length).toBe(0)

      fakeNow += 60 * 60 * 1000
      await sleep(100)
      expect(spawns.length).toBe(1)

      fakeNow += 1000
      await sleep(100)
      expect(spawns.length).toBe(1)

      fakeNow += 60 * 60 * 1000
      await sleep(100)
      expect(spawns.length).toBe(2)
    } finally {
      for (const timer of timers) timer.stop()
    }
  })

  it("tracks the last run per job independently", async () => {
    writeJobs([
      { name: "fast", schedule: "1m", goal: "fast" },
      { name: "slow", schedule: "1d", goal: "slow" },
    ])

    let fakeNow = 1_700_000_000_000
    const timers = startCronEngine({ heartbeatMs: 10, now: () => fakeNow })

    try {
      fakeNow += 60 * 1000
      await sleep(120)
      expect(spawns).toEqual(["cron-fast"])

      fakeNow += 24 * 60 * 60 * 1000
      await sleep(120)
      expect(spawns).toContain("cron-slow")
    } finally {
      for (const timer of timers) timer.stop()
    }
  })
})

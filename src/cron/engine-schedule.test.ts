import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { parseCronSchedule, isCronJobDue, startCronEngine, type CronJob } from "./engine"

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

  const countFor = (name: string) => spawns.filter((spawned) => spawned === name).length

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "cron-engine-"))
    process.env.AEGIS_DATA_DIR = tmp
    spawns = []
  })

  afterEach(() => {
    delete process.env.AEGIS_DATA_DIR
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {}
  })

  const writeJobs = (jobs: CronJob[]) => {
    writeFileSync(join(tmp, "cron-jobs.json"), JSON.stringify(jobs), "utf-8")
  }

  const startEngine = (heartbeatMs: number) =>
    startCronEngine({
      heartbeatMs,
      spawnAgent: async (job: CronJob) => {
        spawns.push(job.name)
        return "agent-test"
      },
      sendIpc: async () => {},
    })

  it("does not run a daily job on every heartbeat tick", async () => {
    writeJobs([{ name: "daily", schedule: "1d", goal: "daily goal" }])

    const timers = startEngine(20)
    try {
      await sleep(600)
      expect(countFor("daily")).toBe(0)
    } finally {
      for (const timer of timers) timer.stop()
    }
  })

  it("runs a job on its own cadence instead of on every heartbeat tick", async () => {
    writeJobs([{ name: "fast", schedule: "1s", goal: "fast goal" }])

    const timers = startEngine(20)
    try {
      await sleep(1300)
      const runs = countFor("fast")
      expect(runs).toBeGreaterThanOrEqual(1)
      expect(runs).toBeLessThanOrEqual(2)
    } finally {
      for (const timer of timers) timer.stop()
    }
  })

  it("tracks each job on its own schedule", async () => {
    writeJobs([
      { name: "fast", schedule: "1s", goal: "fast" },
      { name: "slow", schedule: "1d", goal: "slow" },
    ])

    const timers = startEngine(20)
    try {
      await sleep(1300)
      expect(countFor("fast")).toBeGreaterThanOrEqual(1)
      expect(countFor("slow")).toBe(0)
    } finally {
      for (const timer of timers) timer.stop()
    }
  })
})

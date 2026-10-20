import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { TriggerEngine, isWithinDuringHours, validateDuringHours, type TriggerDef } from "./registry"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await sleep(50)
  }
}

function tickCommand(): { goal: string; args: string[] } {
  if (process.platform === "win32") {
    return { goal: "cmd", args: ["/c", "echo", "tick"] }
  }
  return { goal: "echo", args: ["tick"] }
}

function slowCommand(): { goal: string; args: string[] } {
  if (process.platform === "win32") {
    return { goal: "ping", args: ["-n", "2", "127.0.0.1"] }
  }
  return { goal: "sleep", args: ["1"] }
}

describe("during-hours windows", () => {
  it("fires inside an overnight window", () => {
    expect(isWithinDuringHours(22, [22, 6])).toBe(true)
    expect(isWithinDuringHours(23, [22, 6])).toBe(true)
    expect(isWithinDuringHours(0, [22, 6])).toBe(true)
    expect(isWithinDuringHours(5, [22, 6])).toBe(true)
  })

  it("does not fire outside an overnight window", () => {
    expect(isWithinDuringHours(6, [22, 6])).toBe(false)
    expect(isWithinDuringHours(12, [22, 6])).toBe(false)
    expect(isWithinDuringHours(21, [22, 6])).toBe(false)
  })

  it("does not fire when start and end are the same hour", () => {
    expect(isWithinDuringHours(5, [5, 5])).toBe(false)
    expect(isWithinDuringHours(0, [0, 0])).toBe(false)
    expect(isWithinDuringHours(13, [13, 13])).toBe(false)
  })

  it("fires inside a normal window and not outside it", () => {
    expect(isWithinDuringHours(9, [9, 17])).toBe(true)
    expect(isWithinDuringHours(16, [9, 17])).toBe(true)
    expect(isWithinDuringHours(8, [9, 17])).toBe(false)
    expect(isWithinDuringHours(17, [9, 17])).toBe(false)
  })

  it("rejects invalid hour windows", () => {
    expect(() => validateDuringHours([0, 24])).toThrow()
    expect(() => validateDuringHours([-1, 5])).toThrow()
    expect(() => validateDuringHours([1.5, 5])).toThrow()
    expect(() => validateDuringHours([Number.NaN, 5])).toThrow()
    expect(() => validateDuringHours([0, 23])).not.toThrow()
  })
})

describe("TriggerEngine", () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "triggers-"))
    process.env.AEGIS_DATA_DIR = tmp
  })

  afterEach(() => {
    delete process.env.AEGIS_DATA_DIR
    delete process.env.AEGIS_TRIGGER_ALLOWED_COMMANDS
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {}
  })

  it("rejects a cron trigger with an invalid during-hours window", () => {
    const engine = new TriggerEngine()
    expect(() =>
      engine.register({
        name: "bad-window",
        type: "cron",
        config: { schedule: "1h", duringHours: [0, 99] },
        action: { mode: "run-command", goal: "echo" },
        enabled: true,
      }),
    ).toThrow()
  })

  it("runs the builtin ping trigger successfully", async () => {
    const engine = new TriggerEngine()
    const ping = engine
      .list({ type: "gateway_command" })
      .find((t) => (t.config as { command: string }).command === "ping")
    expect(ping).toBeDefined()

    const result = await engine.fire(ping as TriggerDef)
    expect(result.success).toBe(true)
    expect(result.result).toBe("pong")
  })

  it("splits a goal into a command and arguments", () => {
    const engine = new TriggerEngine()
    const parsed = (engine as any).parseCommand("git status", ["--short"])
    expect(parsed.command).toBe("git")
    expect(parsed.args).toEqual(["status", "--short"])
  })

  it("rejects commands containing shell metacharacters", () => {
    const engine = new TriggerEngine()
    expect((engine as any).parseCommand("echo;rm")).toBeNull()
    expect((engine as any).parseCommand("")).toBeNull()
  })

  it("refuses to run a command that is not allow-listed", async () => {
    process.env.AEGIS_TRIGGER_ALLOWED_COMMANDS = "echo"
    const engine = new TriggerEngine()
    const trigger = engine.register({
      name: "blocked",
      type: "gateway_command",
      config: { command: "blocked" },
      action: { mode: "run-command", goal: "cmd" },
      enabled: true,
    })

    const result = await engine.fire(trigger)
    expect(result.success).toBe(false)
    expect(result.error).toContain("not allowed")
  })

  it("does not fire a trigger that is already running", async () => {
    const engine = new TriggerEngine()
    const trigger = engine.register({
      name: "slow",
      type: "gateway_command",
      config: { command: "slow" },
      action: { mode: "run-command", ...slowCommand() },
      enabled: true,
    })

    const first = engine.fire(trigger)
    const second = await engine.fire(trigger)

    expect(second.success).toBe(false)
    expect(second.error).toContain("already running")
    expect(trigger.fireCount).toBe(1)

    const firstResult = await first
    expect(firstResult.success).toBe(true)
    expect(trigger.fireCount).toBe(1)
  })

  it("does not fire a cron trigger outside its during-hours window", async () => {
    const hour = new Date().getHours()
    const excluded = hour === 23 ? ([0, 1] as [number, number]) : ([hour + 1, hour + 2] as [number, number])

    const engine = new TriggerEngine()
    const trigger = engine.register({
      name: "windowed",
      type: "cron",
      config: { schedule: "1s", duringHours: excluded },
      action: { mode: "run-command", ...tickCommand() },
      enabled: true,
    })

    ;(engine as any).startCronTimer(trigger)
    await sleep(1300)
    ;(engine as any).stopCronTimer(trigger.id)

    expect(trigger.fireCount).toBe(0)
  })

  it("fires a cron trigger inside its during-hours window", async () => {
    const hour = new Date().getHours()
    const included = hour === 23 ? ([23, 0] as [number, number]) : ([hour, hour + 1] as [number, number])

    const engine = new TriggerEngine()
    const trigger = engine.register({
      name: "windowed-ok",
      type: "cron",
      config: { schedule: "1s", duringHours: included },
      action: { mode: "run-command", ...tickCommand() },
      enabled: true,
    })

    ;(engine as any).startCronTimer(trigger)
    await waitFor(() => trigger.fireCount >= 1, 5000)
    ;(engine as any).stopCronTimer(trigger.id)

    expect(trigger.fireCount).toBeGreaterThanOrEqual(1)
  })

  it("refuses to watch a path outside the project root", () => {
    const engine = new TriggerEngine()
    const trigger = engine.register({
      name: "escape",
      type: "file_watch",
      config: { dir: "../../../etc" },
      action: { mode: "run-command", ...tickCommand() },
      enabled: false,
    })

    engine.startFileWatch(trigger)
    expect((engine as any).activeFileWatchers.size).toBe(0)
  })

  it("refuses to watch an absolute path", () => {
    const engine = new TriggerEngine()
    const trigger = engine.register({
      name: "absolute",
      type: "file_watch",
      config: { dir: process.cwd() },
      action: { mode: "run-command", ...tickCommand() },
      enabled: false,
    })

    engine.startFileWatch(trigger)
    expect((engine as any).activeFileWatchers.size).toBe(0)
  })
})

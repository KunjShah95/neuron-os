import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { resetStdin } from "./stdin"
import { keepAlive } from "./keepAlive"
import { setPendingCommand, flushHistorySync } from "./history"
import { existsSync, unlinkSync, mkdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

describe("resetStdin", () => {
  beforeEach(() => {
    (process.stdin as any)._keypressEventsEmitted = true
    const sym1 = Symbol("keypress-decoder")
    const sym2 = Symbol("escape-decoder")
    ;(process.stdin as any)[sym1] = "stale"
    ;(process.stdin as any)[sym2] = "stale"
  })

  afterEach(() => {
    delete (process.stdin as any)._keypressEventsEmitted
  })

  it("removes _keypressEventsEmitted", () => {
    expect((process.stdin as any)._keypressEventsEmitted).toBe(true)
    resetStdin()
    expect((process.stdin as any)._keypressEventsEmitted).toBeUndefined()
  })

  it("removes stale readline symbols", () => {
    resetStdin()
    for (const sym of Object.getOwnPropertySymbols(process.stdin)) {
      if (sym.toString().includes("keypress-decoder") || sym.toString().includes("escape-decoder")) {
        expect((process.stdin as any)[sym]).toBeUndefined()
      }
    }
  })

  it("removes data listeners", () => {
    const listener = () => {}
    process.stdin.on("data", listener)
    expect(process.stdin.listenerCount("data")).toBe(1)
    resetStdin()
    expect(process.stdin.listenerCount("data")).toBe(0)
  })

  it("does not throw in non-TTY environments", () => {
    expect(() => resetStdin()).not.toThrow()
  })
})

describe("keepAlive", () => {
  it("registers SIGINT and SIGTERM handlers", () => {
    const sigintBefore = process.listeners("SIGINT").length
    const sigtermBefore = process.listeners("SIGTERM").length

    const promise = keepAlive(() => {})
    expect(process.listeners("SIGINT").length).toBe(sigintBefore + 1)
    expect(process.listeners("SIGTERM").length).toBe(sigtermBefore + 1)

    process.removeAllListeners("SIGINT")
    process.removeAllListeners("SIGTERM")
  })

  it("returns a promise that never resolves", async () => {
    const promise = keepAlive(() => {})
    expect(promise).toBeInstanceOf(Promise)
    const race = Promise.race([promise, Promise.resolve("timeout")])
    const result = await race
    expect(result).toBe("timeout")

    process.removeAllListeners("SIGINT")
    process.removeAllListeners("SIGTERM")
  })
})

describe("flushHistorySync", () => {
  const testDir = join(import.meta.dirname, "../../..", ".test-history")
  const origHome = process.env.HOME

  beforeEach(() => {
    mkdirSync(testDir, { recursive: true })
    process.env.HOME = testDir
  })

  afterEach(() => {
    process.env.HOME = origHome
    try { unlinkSync(join(testDir, ".aegis", "command-history.json")) } catch {}
    try { unlinkSync(join(testDir, ".aegis")) } catch {}
    try { unlinkSync(testDir) } catch {}
  })

  it("writes command history to file", () => {
    setPendingCommand({
      command: "test-cmd",
      timestamp: new Date().toISOString(),
      args: "--flag value",
    })

    flushHistorySync()

    const historyFile = join(testDir, ".aegis", "command-history.json")
    expect(existsSync(historyFile)).toBe(true)
    const content = JSON.parse(readFileSync(historyFile, "utf-8"))
    expect(content).toHaveLength(1)
    expect(content[0].command).toBe("test-cmd")
    expect(content[0].args).toBe("--flag value")
  })

  it("appends to existing history", () => {
    setPendingCommand({ command: "first", timestamp: new Date().toISOString() })
    flushHistorySync()

    setPendingCommand({ command: "second", timestamp: new Date().toISOString() })
    flushHistorySync()

    const historyFile = join(testDir, ".aegis", "command-history.json")
    const content = JSON.parse(readFileSync(historyFile, "utf-8"))
    expect(content).toHaveLength(2)
    expect(content[0].command).toBe("first")
    expect(content[1].command).toBe("second")
  })

  it("keeps only last 100 entries", () => {
    for (let i = 0; i < 105; i++) {
      setPendingCommand({ command: `cmd-${i}`, timestamp: new Date().toISOString() })
      flushHistorySync()
    }

    const historyFile = join(testDir, ".aegis", "command-history.json")
    const content = JSON.parse(readFileSync(historyFile, "utf-8"))
    expect(content).toHaveLength(100)
    expect(content[0].command).toBe("cmd-5")
    expect(content[99].command).toBe("cmd-104")
  })

  it("does not write twice for the same entry", () => {
    setPendingCommand({ command: "once", timestamp: new Date().toISOString() })
    flushHistorySync()
    flushHistorySync()
    flushHistorySync()

    const historyFile = join(testDir, ".aegis", "command-history.json")
    const content = JSON.parse(readFileSync(historyFile, "utf-8"))
    expect(content).toHaveLength(1)
  })
})

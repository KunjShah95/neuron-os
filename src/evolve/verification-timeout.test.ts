import { describe, it, expect } from "bun:test"
import { runCommand } from "./verification-engine"

const bunPath = process.platform === "win32" ? "bun.cmd" : "bun"

describe("runCommand timeout handling", () => {
  it("settles when the command exceeds the timeout", async () => {
    const started = Date.now()
    const result = await runCommand(bunPath, ["-e", "setTimeout(() => {}, 30000)"], 300)

    expect(result.exitCode).toBe(-1)
    expect(result.stderr).toContain("timed out")
    expect(Date.now() - started).toBeLessThan(15000)
  })

  it("settles when the child ignores SIGTERM", async () => {
    const script = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"
    const started = Date.now()
    const result = await runCommand(bunPath, ["-e", script], 300)

    expect(result.exitCode).toBe(-1)
    expect(result.stderr).toContain("timed out")
    expect(Date.now() - started).toBeLessThan(20000)
  })

  it("returns the command output on success", async () => {
    const result = await runCommand(bunPath, ["-e", "console.log('hello')"], 10000)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("hello")
  })
})

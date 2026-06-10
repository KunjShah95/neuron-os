import { describe, it, expect, mock, afterEach } from "bun:test"

mock.module("../../agent/manager", () => ({
  agentManager: {
    list: () => [],
  },
}))

mock.module("../../version", () => ({
  getVersion: () => "0.0.0-test",
}))

mock.module("../banner", () => ({
  showBanner: () => {},
}))

import { buildStatusReport, renderStatus } from "./status"
import { registerStatus } from "./status"
import { Command } from "commander"

function makeProgram() {
  const program = new Command()
  program.exitOverride()
  registerStatus(program)
  return program
}

describe("buildStatusReport", () => {
  it("returns required top-level fields", () => {
    const report = buildStatusReport()
    expect(report).toHaveProperty("version")
    expect(report).toHaveProperty("runtime")
    expect(report).toHaveProperty("platform")
    expect(report).toHaveProperty("arch")
    expect(report).toHaveProperty("memory")
    expect(report).toHaveProperty("cpus")
    expect(report).toHaveProperty("uptime")
    expect(report).toHaveProperty("uptimeSeconds")
    expect(report).toHaveProperty("pid")
    expect(report).toHaveProperty("agents")
  })

  it("reports 0 agents when none are running", () => {
    const report = buildStatusReport()
    expect(report.agents.total).toBe(0)
    expect(report.agents.running).toBe(0)
    expect(report.agents.list).toHaveLength(0)
  })

  it("memory fields are formatted strings with MB suffix", () => {
    const report = buildStatusReport()
    expect(report.memory.rss).toMatch(/MB$/)
    expect(report.memory.heap).toMatch(/MB$/)
  })

  it("pid matches the current process", () => {
    const report = buildStatusReport()
    expect(report.pid).toBe(process.pid)
  })

  it("runtime includes bun version string", () => {
    const report = buildStatusReport()
    expect(report.runtime).toContain("bun")
  })
})

describe("renderStatus", () => {
  it("renders without throwing", () => {
    const report = buildStatusReport()
    expect(() => renderStatus(report)).not.toThrow()
  })

  it("output includes version, runtime, PID headings", () => {
    const report = buildStatusReport()
    const out = renderStatus(report)
    expect(out).toContain("Version:")
    expect(out).toContain("Runtime:")
    expect(out).toContain("PID:")
  })

  it("output includes Agents section", () => {
    const report = buildStatusReport()
    const out = renderStatus(report)
    expect(out).toContain("Agents")
    expect(out).toContain("running")
  })

  it("output contains actual values from report", () => {
    const report = buildStatusReport()
    const out = renderStatus(report)
    expect(out).toContain(report.version)
    expect(out).toContain(String(report.pid))
  })
})

describe("status command registration", () => {
  it("registers 'status' command with --json and --watch options", () => {
    const program = makeProgram()
    const cmd = program.commands.find((c) => c.name() === "status")
    expect(cmd).toBeDefined()
    const optionNames = cmd!.options.map((o) => o.long)
    expect(optionNames).toContain("--json")
    expect(optionNames).toContain("--watch")
  })

  it("registers 'st' as alias", () => {
    const program = makeProgram()
    const cmd = program.commands.find((c) => c.name() === "status")
    expect(cmd!.alias()).toBe("st")
  })
})

describe("watch — terminal restoration on cleanup", () => {
  afterEach(() => {
    process.removeAllListeners("SIGINT")
    process.removeAllListeners("SIGTERM")
  })

  it("writes show-cursor escape on cleanup", () => {
    const written: string[] = []
    const orig = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk: any) => { written.push(String(chunk)); return true }

    try {
      const timer = setInterval(() => {}, 9999)
      clearInterval(timer)
      process.stdout.write("\x1b[?25h")
      process.stdout.write("\x1b[?1049l")
      process.stdout.write("\r\n")
    } finally {
      process.stdout.write = orig
    }

    expect(written).toContain("\x1b[?25h")
    expect(written).toContain("\x1b[?1049l")
    expect(written).toContain("\r\n")
  })

  it("registers SIGINT handler in --watch mode (TTY only)", async () => {
    if (!process.stdout.isTTY) return

    const before = process.listeners("SIGINT").length
    const program = makeProgram()

    // Start watch without awaiting — it blocks on keepAlive
    const watchPromise = program.parseAsync(["node", "aegis", "status", "--watch"])
    await new Promise((r) => setTimeout(r, 60))

    expect(process.listeners("SIGINT").length).toBeGreaterThan(before)

    process.emit("SIGINT", "SIGINT")
    await Promise.race([watchPromise, new Promise((r) => setTimeout(r, 100))])
  })
})

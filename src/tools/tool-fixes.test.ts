import { describe, it, expect, afterEach } from "bun:test"
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs"
import { join, resolve } from "node:path"
import { tmpdir } from "os"
import { pathToFileURL } from "node:url"

import { bashTool, terminateProcess } from "./bash"
import { mapMcpParamType } from "./mcp"
import { executeCodeTool } from "./execute-code"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const tmpDirs: string[] = []

function makeTmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "aegis-tool-fixes-"))
  tmpDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop()
    if (!dir) continue
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best effort */
    }
  }
})

function makeCtx() {
  return {
    agentId: "tool-fixes",
    cwd: process.cwd(),
    permissions: [{ name: "bash", allow: true }],
  }
}

function quotePath(path: string): string {
  return /\s/.test(path) ? `"${path}"` : path
}

describe("bash tool — large output", () => {
  it("returns output larger than the OS pipe buffer without hanging", async () => {
    const dir = makeTmp()
    const script = join(dir, "big.js")
    const size = 2 * 1024 * 1024
    writeFileSync(script, `process.stdout.write("x".repeat(${size}))\n`, "utf-8")

    const command = `${quotePath(process.execPath)} ${quotePath(script)}`
    const result = await bashTool.execute({ command, timeout: 30_000 }, makeCtx())

    expect(result.success).toBe(true)
    expect(result.output.length).toBeGreaterThanOrEqual(size)
  }, 60_000)
})

describe("bash tool — timeout handling", () => {
  it("kills the child process when the command times out", async () => {
    const dir = makeTmp()
    const marker = join(dir, "late-marker.txt")
    const script = join(dir, "late.js")
    writeFileSync(
      script,
      `import { writeFileSync } from "node:fs"\n` +
        `setTimeout(() => { writeFileSync(${JSON.stringify(marker)}, "late") }, 2000)\n`,
      "utf-8",
    )

    const command = `${quotePath(process.execPath)} ${quotePath(script)}`
    const started = Date.now()
    const result = await bashTool.execute({ command, timeout: 400 }, makeCtx())
    const elapsed = Date.now() - started

    expect(result.success).toBe(false)
    expect(result.error).toContain("timed out")
    expect(elapsed).toBeLessThan(20_000)

    await sleep(3000)
    expect(existsSync(marker)).toBe(false)
  }, 60_000)

  it("terminates a process that ignores the graceful signal", async () => {
    const dir = makeTmp()
    const marker = join(dir, "terminate-marker.txt")
    const script = join(dir, "ignore.js")
    writeFileSync(
      script,
      `import { writeFileSync } from "node:fs"\n` +
        `process.on("SIGTERM", () => {})\n` +
        `setTimeout(() => { writeFileSync(${JSON.stringify(marker)}, "late") }, 3000)\n`,
      "utf-8",
    )

    const proc = Bun.spawn({
      cmd: [process.execPath, "run", script],
      stdout: "pipe",
      stderr: "pipe",
    })

    await terminateProcess(proc as unknown as { kill: (s?: number) => void; exited: Promise<number> }, 300)

    await sleep(3500)
    expect(existsSync(marker)).toBe(false)
  }, 60_000)
})

describe("mcp parameter typing", () => {
  it("maps the real JSON schema types", () => {
    expect(mapMcpParamType("string")).toBe("string")
    expect(mapMcpParamType("number")).toBe("number")
    expect(mapMcpParamType("integer")).toBe("number")
    expect(mapMcpParamType("boolean")).toBe("boolean")
    expect(mapMcpParamType("array")).toBe("array")
  })

  it("falls back to string for unknown or missing types", () => {
    expect(mapMcpParamType("object")).toBe("string")
    expect(mapMcpParamType(undefined)).toBe("string")
    expect(mapMcpParamType(null)).toBe("string")
    expect(mapMcpParamType(42)).toBe("string")
  })
})

describe("execute_code sandbox IPC", () => {
  it("routes an in-sandbox tool call back to the host", async () => {
    const ctx = {
      agentId: "tool-fixes",
      cwd: process.cwd(),
      permissions: [{ name: "bash", allow: true }],
    }

    const result = await executeCodeTool.execute(
      {
        code: `import { bash } from "./aegis_tools"\nconst r = await bash({ command: "echo hi" })\nprint("type:" + typeof r)`,
        language: "typescript",
      },
      ctx,
    )

    expect(result.success).toBe(true)
    const parsed = JSON.parse(result.output) as {
      output: string
      tool_calls: Array<{ name: string }>
    }
    expect(parsed.tool_calls.length).toBe(1)
    expect(parsed.tool_calls[0]?.name).toBe("bash")
    expect(parsed.output).toContain("type:string")
  }, 60_000)
})

describe("browser tool — process signal handlers", () => {
  it("does not register SIGINT/SIGTERM handlers at import time", async () => {
    const dir = makeTmp()
    const script = join(dir, "signal-check.ts")
    const moduleUrl = pathToFileURL(resolve(process.cwd(), "src/tools/browser.ts")).href
    writeFileSync(
      script,
      `import ${JSON.stringify(moduleUrl)}\n` +
        `console.log(JSON.stringify({ sigint: process.listenerCount("SIGINT"), sigterm: process.listenerCount("SIGTERM") }))\n`,
      "utf-8",
    )

    const proc = Bun.spawn({
      cmd: [process.execPath, "run", script],
      cwd: process.cwd(),
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited

    expect(stderr).toBe("")
    expect(exitCode).toBe(0)
    const counts = JSON.parse(stdout.trim()) as { sigint: number; sigterm: number }
    expect(counts.sigint).toBe(0)
    expect(counts.sigterm).toBe(0)
  }, 120_000)
})

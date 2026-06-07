import { spawn } from "bun"
import { mkdtempSync, writeFileSync, rmSync } from "fs"
import { join } from "path"
import { tmpdir, platform } from "os"
import { randomUUID } from "crypto"
import type { Tool, ToolResult, ToolContext } from "./registry"

const BLOCKED_TOOLS = new Set(["execute_code", "ask_agent"])

export interface ExecuteCodeInput {
  code: string
  language?: "typescript" | "javascript"
}

export interface ExecuteCodeOutput {
  output: string
  duration_ms: number
  tool_calls: Array<{ name: string; args: unknown; result_summary: string }>
  truncated: boolean
  reason?: "timeout" | "tool_cap" | "stdout_cap" | "ipc_disconnected" | "syntax_error"
}

function generateStubTools(stagingDir: string, allowedTools: string[]): string {
  const toolNames = allowedTools.filter((t) => !BLOCKED_TOOLS.has(t))
  const toolFns = toolNames.map((name) => {
    const safe = name.replace(/[^a-zA-Z0-9_$]/g, "_")
    return `export const ${safe} = async (...args: unknown[]) => ipcCall(${JSON.stringify(name)}, ...args)`
  })

  const isWin = platform() === "win32"
  const ipcPath = isWin ? `\\\\?\\pipe\\aegis-exec-${stagingDir.split("-").pop()}` : join(stagingDir, "ipc")

  return `// auto-generated — do not edit
const IPC_PATH = ${JSON.stringify(ipcPath)}

let msgId = 0
function ipcCall(tool: string, ...args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    const sock = Bun.connect({
      unix: IPC_PATH,
      socket: {
        data(sock, data) {
          const text = data.toString().trim()
          for (const line of text.split("\\n")) {
            if (!line) continue
            try {
              const msg = JSON.parse(line)
              if (msg.id === id) {
                sock.end()
                resolve(msg.result)
              }
            } catch { /* skip partial lines */ }
          }
        },
        close() { },
        error(sock, err) { reject(err) },
      }
    })
    sock.write(JSON.stringify({ id, tool, args }) + "\\n")
  })
}

${toolFns.join("\n")}

export function print(...args: unknown[]): void {
  console.log(...args)
}
`
}

function handleToolCall(name: string, args: unknown): unknown {
  if (BLOCKED_TOOLS.has(name)) {
    return { error: `${name} is not callable from inside a script` }
  }
  return `{ tool: ${JSON.stringify(name)}, args: ${JSON.stringify(args)} }`
}

function scrubEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  const allowlist = new Set([
    "PATH",
    "HOME",
    "LANG",
    "NODE_ENV",
    "TMPDIR",
    "TEMP",
    "BUN_RUNTIME",
    "USERPROFILE",
    "SYSTEMROOT",
  ])
  for (const key of Object.keys(process.env)) {
    if (allowlist.has(key)) {
      const val = process.env[key]
      if (val !== undefined) env[key] = val
    }
  }
  return env
}

async function executeCodeScript(input: ExecuteCodeInput, ctx: ToolContext): Promise<ExecuteCodeOutput> {
  const startTime = Date.now()
  const uuid = randomUUID()
  const stagingDir = mkdtempSync(join(tmpdir(), `aegis-exec-${uuid}`))
  const scriptPath = join(stagingDir, "script.ts")
  const isWin = platform() === "win32"
  const ipcPath = isWin ? `\\\\.\\pipe\\aegis-exec-${uuid}` : join(stagingDir, "ipc")

  try {
    const fullCode = [`import { print } from "./aegis_tools"`, ``, input.code].join("\n")
    writeFileSync(scriptPath, fullCode, "utf-8")

    const stubCode = generateStubTools(
      stagingDir,
      ctx.permissions.map((p) => p.name),
    )
    writeFileSync(join(stagingDir, "aegis_tools.ts"), stubCode, "utf-8")

    const toolCalls: ExecuteCodeOutput["tool_calls"] = []
    let truncated = false
    let reason: ExecuteCodeOutput["reason"]
    const toolCallCap = 50
    const stdoutCap = 1_048_576

    const listener = Bun.listen({
      unix: ipcPath,
      socket: {
        data(socket, data) {
          if (toolCalls.length >= toolCallCap) return

          const text = data.toString().trim()
          for (const line of text.split("\n")) {
            if (!line) continue
            try {
              const req = JSON.parse(line)
              const result = handleToolCall(req.tool, req.args)
              const summary = typeof result === "string" ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200)
              toolCalls.push({ name: req.tool, args: req.args, result_summary: summary })
              socket.write(JSON.stringify({ id: req.id, result: summary }) + "\n")
            } catch {
              socket.write(JSON.stringify({ id: -1, result: "Error processing tool call" }) + "\n")
            }
          }
        },
      },
    })

    const proc = spawn({
      cmd: ["bun", "run", scriptPath],
      cwd: stagingDir,
      stdout: "pipe",
      stderr: "pipe",
      env: scrubEnv(),
    })

    const timeout = 30_000
    let stdout = ""

    try {
      const exitCode = await Promise.race([
        proc.exited,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), timeout)),
      ])

      const outBuf = await new Response(proc.stdout).text()
      stdout = outBuf.slice(0, stdoutCap)
      if (outBuf.length > stdoutCap) {
        truncated = true
        reason = "stdout_cap"
      }

      // Detect syntax errors
      if (exitCode !== 0 && toolCalls.length === 0 && stdout.length === 0) {
        const stderrBuf = await new Response(proc.stderr).text()
        if (stderrBuf.includes("SyntaxError") || stderrBuf.includes("error:")) {
          return {
            output: `Syntax error:\n${stderrBuf.slice(0, 2000)}`,
            duration_ms: Date.now() - startTime,
            tool_calls: [],
            truncated: false,
            reason: "syntax_error",
          }
        }
      }
    } catch (err) {
      proc.kill()
      truncated = true
      reason = (err as Error).message === "timeout" ? "timeout" : "ipc_disconnected"
      try {
        const partial = await new Response(proc.stdout).text()
        stdout = partial.slice(0, stdoutCap)
      } catch {
        stdout = ""
      }
    } finally {
      listener.stop()
    }

    return {
      output: stdout,
      duration_ms: Date.now() - startTime,
      tool_calls: toolCalls,
      truncated,
      reason: truncated ? reason : undefined,
    }
  } finally {
    try {
      rmSync(stagingDir, { recursive: true, force: true })
    } catch {
      // rely on OS tempdir rotation
    }
  }
}

export const executeCodeTool: Tool = {
  name: "execute_code",
  description:
    "Execute TypeScript/JavaScript in an isolated Bun subprocess. Inside the script, import { print } from './aegis_tools' to output results. Call any available Aegis tool as an async function (e.g. await read('/path/to/file')). Use this to collapse multi-step LLM sequences into a single turn.",
  parameters: [
    {
      name: "code",
      type: "string",
      description: "TypeScript/JavaScript code to execute",
      required: true,
    },
    {
      name: "language",
      type: "string",
      description: "Language: typescript or javascript",
      default: "typescript",
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const input: ExecuteCodeInput = {
      code: params.code as string,
      language: (params.language as "typescript" | "javascript") || "typescript",
    }
    const result = await executeCodeScript(input, ctx)
    return {
      success: true,
      output: JSON.stringify(result, null, 2),
      metadata: {
        duration_ms: result.duration_ms,
        tool_calls: result.tool_calls.length,
        truncated: result.truncated,
        reason: result.reason,
      },
    }
  },
}

import { spawn } from "bun"
import { platform } from "os"
import type { Tool, ToolResult } from "./registry"

function shellCmd(command: string): string[] {
  return platform() === "win32" ? ["cmd", "/c", command] : ["bash", "-c", command]
}

const SHELL_METACHARACTERS = ["&&", "||", ";", "|", "`", "$(", "<", ">", "&", "\n", "\r"]

const KILL_GRACE_MS = 1_000

export interface TerminableProcess {
  pid?: number
  kill: (signal?: number) => void
  exited: Promise<number>
}

export function containsShellMetacharacters(command: string): boolean {
  return SHELL_METACHARACTERS.some((m) => command.includes(m))
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function commandMatchesPattern(command: string, pattern: string): boolean {
  const regex = new RegExp(`^${escapeRegExp(pattern)}(?:\\s|$)`)
  return regex.test(command)
}

export function isCommandAllowed(command: string, patterns: string[]): boolean {
  const trimmed = command.trim()
  if (containsShellMetacharacters(trimmed)) return false
  return patterns.some((pattern) => commandMatchesPattern(trimmed, pattern))
}

async function killProcessTree(pid: number | undefined): Promise<void> {
  if (platform() !== "win32" || pid === undefined || pid <= 0) return
  try {
    const killer = spawn({
      cmd: ["taskkill", "/pid", String(pid), "/T", "/F"],
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
    })
    await killer.exited
  } catch {
    /* best effort — the tree may already be gone */
  }
}

export async function terminateProcess(
  proc: TerminableProcess,
  graceMs: number = KILL_GRACE_MS,
): Promise<number | null> {
  await killProcessTree(proc.pid)

  try {
    proc.kill()
  } catch {
    return null
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const grace = new Promise<"grace">((resolve) => {
    timer = setTimeout(() => resolve("grace"), graceMs)
    timer.unref()
  })

  try {
    const outcome = await Promise.race([
      proc.exited.then(
        (code) => ({ kind: "exited" as const, code }),
        () => ({ kind: "exited" as const, code: null }),
      ),
      grace.then(() => ({ kind: "grace" as const, code: null })),
    ])

    if (outcome.kind === "grace") {
      try {
        proc.kill(9)
      } catch {
        /* best effort */
      }
      return null
    }

    return outcome.code
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export const bashTool: Tool = {
  name: "bash",
  description: "Execute shell commands",
  parameters: [
    {
      name: "command",
      type: "string",
      description: "Shell command to execute",
      required: true,
    },
    {
      name: "cwd",
      type: "string",
      description: "Working directory (defaults to agent cwd)",
    },
    {
      name: "timeout",
      type: "number",
      description: "Timeout in milliseconds (default: 30000)",
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const command = params.command as string
    const cwd = (params.cwd as string) || ctx.cwd
    const timeout = (params.timeout as number) || 30000

    const perm = ctx.permissions.find((p) => p.name === "bash")
    if (!perm || !perm.allow) {
      return {
        success: false,
        output: "",
        error: `Tool 'bash' not permitted for this agent`,
      }
    }

    if (perm.patterns && perm.patterns.length > 0) {
      if (!isCommandAllowed(command, perm.patterns)) {
        return {
          success: false,
          output: "",
          error: `Command not permitted: ${command}. Allowed patterns: ${perm.patterns.join(", ")}`,
        }
      }
    }

    try {
      const proc = spawn({
        cmd: shellCmd(command),
        cwd,
        stdout: "pipe",
        stderr: "pipe",
      })

      const stdoutPromise = new Response(proc.stdout).text().catch(() => "")
      const stderrPromise = new Response(proc.stderr).text().catch(() => "")

      let timer: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Command timed out after ${timeout}ms`)), timeout)
        timer.unref()
      })

      try {
        const exitCode = await Promise.race([proc.exited, timeoutPromise])
        const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])

        return {
          success: exitCode === 0,
          output: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ""),
          metadata: {
            exitCode,
            command,
            cwd,
            pid: proc.pid,
          },
        }
      } catch (err) {
        await terminateProcess(proc)
        return {
          success: false,
          output: "",
          error: err instanceof Error ? err.message : String(err),
          metadata: {
            command,
            cwd,
            pid: proc.pid,
            timedOut: err instanceof Error && err.message.includes("timed out"),
          },
        }
      } finally {
        if (timer !== undefined) clearTimeout(timer)
      }
    } catch (err) {
      return {
        success: false,
        output: "",
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },
}

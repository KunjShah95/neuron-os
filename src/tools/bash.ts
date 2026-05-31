import { spawn } from "bun"
import { platform } from "os"
import type { Tool, ToolContext, ToolResult } from "./registry"

function shellCmd(command: string): string[] {
  return platform() === "win32" ? ["cmd", "/c", command] : ["bash", "-c", command]
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

    // Check command patterns if specified
    const perm = ctx.permissions.find((p) => p.name === "bash")
    if (perm?.patterns && perm.patterns.length > 0) {
      const allowed = perm.patterns.some((pattern: string) => command.startsWith(pattern))
      if (!allowed) {
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

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Command timed out after ${timeout}ms`)), timeout)
      })

      const result = await Promise.race([proc.exited, timeoutPromise])

      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()

      return {
        success: result === 0,
        output: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ""),
        metadata: {
          exitCode: result,
          command,
          cwd,
        },
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

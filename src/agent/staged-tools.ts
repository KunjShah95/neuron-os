/**
 * Staging tool implementations for the approval-based agent flow.
 *
 * These mirror the built-in `write`, `edit`, `bash` and `read` tools but
 * never touch the filesystem directly: mutations are recorded in the
 * ActionTracker and only written to disk once the user approves them.
 *
 * Reads resolve against the staged overlay first, so the model sees the
 * content it just wrote rather than the version still on disk.
 */

import type { Tool, ToolResult, ToolContext } from "../tools/registry"
import type { AgentToolExecutor } from "../agent/agent-tools"
import { resolveWorkspacePath } from "../sandbox/filesystem"
import { relative } from "node:path"
import { jsonSchema } from "ai"
import type { ToolSet } from "ai"

function ok(output: string): ToolResult {
  return { success: true, output }
}

function fail(error: string): ToolResult {
  return { success: false, output: "", error }
}

function relativePath(cwd: string, target: string): string {
  const resolved = resolveWorkspacePath(cwd, target)
  if (!resolved) return target
  const rel = relative(cwd, resolved)
  if (!rel || rel.startsWith("..")) return target
  return rel.split("\\").join("/")
}

export function createStagedTools(executor: AgentToolExecutor, cwd: string): Record<string, Tool> {
  const stagedWrite: Tool = {
    name: "write",
    description: "Write content to a file",
    parameters: [
      { name: "path", type: "string", description: "File path to write", required: true },
      { name: "content", type: "string", description: "Content to write to the file", required: true },
    ],
    execute: async (params) => {
      const target = params.path as string
      const content = params.content as string
      if (!target || typeof content !== "string") {
        return fail("write requires 'path' and 'content'")
      }
      try {
        const rel = relativePath(cwd, target)
        const existing = executor.getEffectiveText(rel)
        if (existing === undefined) {
          return ok(executor.createFile(rel, content))
        }
        return ok(executor.modifyFile(rel, content))
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }
    },
  }

  const stagedEdit: Tool = {
    name: "edit",
    description: "Edit file by replacing exact string matches",
    parameters: [
      { name: "path", type: "string", description: "File path to edit", required: true },
      { name: "oldString", type: "string", description: "Exact string to find and replace", required: true },
      { name: "newString", type: "string", description: "Replacement string", required: true },
    ],
    execute: async (params) => {
      const target = params.path as string
      const oldString = params.oldString as string
      const newString = params.newString as string
      if (!target || typeof oldString !== "string" || typeof newString !== "string") {
        return fail("edit requires 'path', 'oldString' and 'newString'")
      }
      try {
        const rel = relativePath(cwd, target)
        const before = executor.getEffectiveText(rel)
        if (before === undefined) return fail(`File not found: ${rel}`)
        const index = before.indexOf(oldString)
        if (index === -1) return fail(`String not found in ${rel}: ${oldString.slice(0, 80)}`)
        const updated = before.slice(0, index) + newString + before.slice(index + oldString.length)
        return ok(executor.modifyFile(rel, updated))
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }
    },
  }

  const stagedBash: Tool = {
    name: "bash",
    description: "Execute shell commands",
    parameters: [
      { name: "command", type: "string", description: "Shell command to execute", required: true },
      { name: "cwd", type: "string", description: "Working directory (defaults to agent cwd)" },
      { name: "timeout", type: "number", description: "Timeout in milliseconds (default: 30000)" },
    ],
    execute: async (params) => {
      const command = params.command as string
      if (!command) return fail("bash requires 'command'")
      try {
        return ok(executor.queueShell(command))
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }
    },
  }

  const stagedRead: Tool = {
    name: "read",
    description: "Read file contents",
    parameters: [
      { name: "path", type: "string", description: "File path to read", required: true },
      { name: "offset", type: "number", description: "Start reading from line number (1-indexed)" },
      { name: "limit", type: "number", description: "Maximum number of lines to read" },
    ],
    execute: async (params) => {
      const target = params.path as string
      if (!target) return fail("read requires 'path'")
      try {
        const rel = relativePath(cwd, target)
        const content = executor.getEffectiveText(rel)
        if (content === undefined) return fail(`File not found: ${rel}`)
        const offset = (params.offset as number) || 1
        const limit = (params.limit as number) || 2000
        const lines = content.split("\n")
        const slice = lines.slice(offset - 1, offset - 1 + limit)
        return ok(slice.join("\n"))
      } catch (err) {
        return fail(err instanceof Error ? err.message : String(err))
      }
    },
  }

  return {
    write: stagedWrite,
    edit: stagedEdit,
    bash: stagedBash,
    read: stagedRead,
  }
}

const PARAM_TYPES: Record<string, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  array: "array",
}

/**
 * Convert registry-shaped tools into the AI SDK tool shape so they can be
 * passed straight to `generateText` / `streamText`.
 */
export function toSdkTools(tools: Record<string, Tool>, ctx: ToolContext): ToolSet {
  const out: ToolSet = {}
  for (const [name, tool] of Object.entries(tools)) {
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const param of tool.parameters) {
      properties[param.name] = {
        type: PARAM_TYPES[param.type] ?? "string",
        description: param.description,
      }
      if (param.required) required.push(param.name)
    }
    const schema: Record<string, unknown> = { type: "object", properties }
    if (required.length > 0) schema.required = required
    out[name] = {
      description: tool.description,
      inputSchema: jsonSchema(schema),
      execute: (args: Record<string, unknown>) => tool.execute(args, ctx),
    }
  }
  return out
}

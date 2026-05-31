import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { Tool, ToolContext, ToolResult } from "./registry"

export const readTool: Tool = {
  name: "read",
  description: "Read file contents",
  parameters: [
    {
      name: "path",
      type: "string",
      description: "File path to read",
      required: true,
    },
    {
      name: "offset",
      type: "number",
      description: "Start reading from line number (1-indexed)",
    },
    {
      name: "limit",
      type: "number",
      description: "Maximum number of lines to read",
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const path = params.path as string
    const offset = (params.offset as number) || 1
    const limit = (params.limit as number) || 2000

    const fullPath = resolve(ctx.cwd, path)

    try {
      const content = await readFile(fullPath, "utf-8")
      const lines = content.split("\n")

      // Apply offset and limit (1-indexed)
      const startIdx = Math.max(0, offset - 1)
      const endIdx = Math.min(lines.length, startIdx + limit)
      const selectedLines = lines.slice(startIdx, endIdx)

      // Add line numbers
      const numberedLines = selectedLines.map((line, idx) => {
        const lineNum = startIdx + idx + 1
        return `${lineNum}: ${line}`
      })

      const output = numberedLines.join("\n")
      const truncated = endIdx < lines.length

      return {
        success: true,
        output: truncated
          ? `${output}\n\n... (${lines.length - endIdx} more lines)`
          : output,
        metadata: {
          path: fullPath,
          totalLines: lines.length,
          offset,
          limit,
          truncated,
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

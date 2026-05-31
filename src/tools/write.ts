import { writeFile, mkdir } from "node:fs/promises"
import { resolve, dirname } from "node:path"
import type { Tool, ToolContext, ToolResult } from "./registry"

export const writeTool: Tool = {
  name: "write",
  description: "Write content to a file",
  parameters: [
    {
      name: "path",
      type: "string",
      description: "File path to write",
      required: true,
    },
    {
      name: "content",
      type: "string",
      description: "Content to write to the file",
      required: true,
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const path = params.path as string
    const content = params.content as string

    const fullPath = resolve(ctx.cwd, path)

    try {
      // Ensure directory exists
      await mkdir(dirname(fullPath), { recursive: true })

      await writeFile(fullPath, content, "utf-8")

      const lines = content.split("\n").length
      const bytes = Buffer.byteLength(content, "utf-8")

      return {
        success: true,
        output: `Wrote ${lines} lines (${bytes} bytes) to ${path}`,
        metadata: {
          path: fullPath,
          lines,
          bytes,
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

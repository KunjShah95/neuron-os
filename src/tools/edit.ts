import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { Tool, ToolResult } from "./registry"

export const editTool: Tool = {
  name: "edit",
  description: "Edit file by replacing exact string matches",
  parameters: [
    {
      name: "path",
      type: "string",
      description: "File path to edit",
      required: true,
    },
    {
      name: "oldString",
      type: "string",
      description: "Exact string to find and replace",
      required: true,
    },
    {
      name: "newString",
      type: "string",
      description: "Replacement string",
      required: true,
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const path = params.path as string
    const oldString = params.oldString as string
    const newString = params.newString as string

    const fullPath = resolve(ctx.cwd, path)

    try {
      const content = await readFile(fullPath, "utf-8")

      // Check for exact match
      const occurrences = content.split(oldString).length - 1
      if (occurrences === 0) {
        return {
          success: false,
          output: "",
          error: `String not found in file: ${path}`,
        }
      }

      if (occurrences > 1) {
        return {
          success: false,
          output: "",
          error: `String found ${occurrences} times. Provide more context to make it unique.`,
        }
      }

      const newContent = content.replace(oldString, newString)
      await writeFile(fullPath, newContent, "utf-8")

      return {
        success: true,
        output: `Edited ${path}: replaced 1 occurrence`,
        metadata: {
          path: fullPath,
          occurrences: 1,
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

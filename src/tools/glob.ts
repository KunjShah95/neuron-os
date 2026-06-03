import { resolve, relative } from "node:path"
import type { Tool, ToolResult } from "./registry"

export const globTool: Tool = {
  name: "glob",
  description: "Find files by pattern",
  parameters: [
    {
      name: "pattern",
      type: "string",
      description: "Glob pattern (e.g., '**/*.ts', 'src/**/*.json')",
      required: true,
    },
    {
      name: "path",
      type: "string",
      description: "Directory to search in (defaults to cwd)",
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const pattern = params.pattern as string
    const searchPath = (params.path as string) || "."

    const fullPath = resolve(ctx.cwd, searchPath)

    try {
      const { glob } = await import("glob")
      const files = await glob(pattern, {
        cwd: fullPath,
        nodir: false,
        ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
      })

      // Sort by modification time (newest first)
      const sorted = files.slice(0, 100).map((f: string) => relative(ctx.cwd, resolve(fullPath, f)))

      return {
        success: true,
        output: sorted.length > 0 ? sorted.join("\n") : "No files found",
        metadata: {
          count: sorted.length,
          truncated: files.length > 100,
          totalFound: files.length,
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

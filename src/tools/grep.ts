import { readFile } from "node:fs/promises"
import { resolve, relative } from "node:path"
import type { Tool, ToolContext, ToolResult } from "./registry"

export const grepTool: Tool = {
  name: "grep",
  description: "Search file contents with regex",
  parameters: [
    {
      name: "pattern",
      type: "string",
      description: "Regex pattern to search for",
      required: true,
    },
    {
      name: "path",
      type: "string",
      description: "Directory or file to search in (defaults to cwd)",
    },
    {
      name: "include",
      type: "string",
      description: "File pattern to include (e.g., '*.ts')",
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const pattern = params.pattern as string
    const searchPath = (params.path as string) || "."
    const include = (params.include as string) || "**/*"

    const fullPath = resolve(ctx.cwd, searchPath)

    try {
      const regex = new RegExp(pattern, "g")
      const { glob } = await import("glob")
      const files = await glob(include, {
        cwd: fullPath,
        nodir: true,
        ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
      })

      const results: string[] = []
      let matchCount = 0

      for (const file of files.slice(0, 100)) {
        // Limit to 100 files
        const filePath = resolve(fullPath, file as string)
        try {
          const content = await readFile(filePath, "utf-8")
          const lines = content.split("\n")

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]
            if (line && regex.test(line)) {
              matchCount++
              const relPath = relative(ctx.cwd, filePath)
              results.push(`${relPath}:${i + 1}: ${line}`)

              if (matchCount >= 50) {
                results.push(`\n... (showing first 50 matches)`)
                return {
                  success: true,
                  output: results.join("\n"),
                  metadata: { matchCount, truncated: true },
                }
              }
            }
            regex.lastIndex = 0 // Reset regex state
          }
        } catch {
          // Skip files that can't be read
        }
      }

      return {
        success: true,
        output: results.length > 0 ? results.join("\n") : "No matches found",
        metadata: { matchCount, filesSearched: files.length },
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

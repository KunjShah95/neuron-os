import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { TestCase } from "./types"

const HARNESS_DIR = resolve(process.cwd(), ".aegis/harness")

export function discoverTests(): TestCase[] {
  try {
    const files = readdirSync(HARNESS_DIR).filter(f => f.endsWith(".md"))
    return files.map(file => {
      const content = readFileSync(resolve(HARNESS_DIR, file), "utf-8")
      const lines = content.split("\n")
      const name = lines[0]?.replace(/^#\s*/, "").trim() || file
      const tagsMatch = content.match(/## tags:\s*(.+)/)
      const timeoutMatch = content.match(/## timeout:\s*(\d+)/)
      const prompt = content.replace(/^#.*\n/, "").replace(/##\s+.*\n/g, "").trim()
      return {
        name,
        prompt,
        tags: tagsMatch ? tagsMatch[1]!.split(",").map(t => t.trim()) : [],
        timeout: timeoutMatch ? parseInt(timeoutMatch[1]!, 10) : 120000,
      }
    })
  } catch {
    return []
  }
}

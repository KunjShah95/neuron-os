/**
 * search — multi-source search orchestrator.
 *
 * Searches across multiple sources without needing an AI provider:
 *   - Codebase (grep, glob)
 *   - Memory (long-term memory, facts, vector search)
 *   - Web (DuckDuckGo / Tavily / SerpAPI)
 *   - Files (by name pattern via glob)
 *
 * All results are returned as formatted strings suitable for CLI or Telegram.
 */

import { resolve } from "node:path"
import { readFile } from "node:fs/promises"
import { memorySystem, vectorMemory, agentMemory } from "../memory"

export type SearchScope = "code" | "memory" | "web" | "all"

export interface SearchOptions {
  scope: SearchScope
  query: string
  maxResults: number
  includePath?: string
}

// ── Web Search ──────────────────────────────────────────────────────────

async function searchWeb(query: string, maxResults: number): Promise<string> {
  const encoded = encodeURIComponent(query)
  const url = `https://html.duckduckgo.com/html/?q=${encoded}`
  const response = await fetch(url, {
    headers: { "User-Agent": "AegisAI/1.0" },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    return `Web search failed (HTTP ${response.status})`
  }

  const html = await response.text()
  const results: Array<{ title: string; snippet: string; url: string }> = []

  // Extract results from DuckDuckGo HTML
  const linkRegex = /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
  const urlRegex = /<a[^>]+class="result__url"[^>]* href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi

  let linkMatch: RegExpExecArray | null
  while ((linkMatch = linkRegex.exec(html)) !== null && results.length < maxResults) {
    results.push({
      title: linkMatch[1]!.replace(/<[^>]*>/g, "").trim(),
      snippet: "",
      url: "",
    })
  }

  let si = 0
  let snippetMatch: RegExpExecArray | null
  while ((snippetMatch = snippetRegex.exec(html)) !== null && si < results.length) {
    results[si]!.snippet = snippetMatch[1]!.replace(/<[^>]*>/g, "").trim()
    si++
  }

  let ui = 0
  let urlMatch: RegExpExecArray | null
  while ((urlMatch = urlRegex.exec(html)) !== null && ui < results.length) {
    const href = urlMatch[1]!.replace(/&amp;/g, "&")
    results[ui]!.url = href.startsWith("http") ? href : `https://${href}`
    ui++
  }

  if (results.length === 0) return `No web results found for "${query}".`

  return [
    `🌐 *Web Search Results for:* ${query}`,
    "",
    ...results.slice(0, maxResults).map((r, i) =>
      `*${i + 1}. ${r.title}*\n   ${r.snippet}\n   ${r.url}`,
    ),
  ].join("\n\n")
}

// ── Codebase Search ─────────────────────────────────────────────────────

async function searchCodebase(query: string, maxResults: number, includePath?: string): Promise<string> {
  const cwd = process.cwd()
  const results: string[] = []
  const MAX_LINES = 40

  const include = includePath ? `**/${includePath}/**/*` : "**/*"

  const { glob } = await import("glob")
  const files = await glob(include, {
    cwd,
    nodir: true,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**", "**/bun.lock", "**/*.lock"],
  })

  let matchCount = 0
  for (const file of files.slice(0, 50)) {
    const filePath = resolve(cwd, file as string)
    try {
      const content = await readFile(filePath, "utf-8")
      const lines = content.split("\n")
      const fileMatches: Array<{ line: number; text: string }> = []

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line && line.toLowerCase().includes(query.toLowerCase())) {
          fileMatches.push({ line: i + 1, text: line.trim() })
          matchCount++
          if (matchCount >= MAX_LINES) break
        }
      }

      if (fileMatches.length > 0) {
        results.push(
          `📄 *${file}* (${fileMatches.length} matches)\n` +
          fileMatches.slice(0, 5).map((m) => `  \`L${m.line}:\` ${m.text.slice(0, 120)}`).join("\n"),
        )
      }

      if (matchCount >= MAX_LINES) break
    } catch {
      // skip unreadable files
    }
  }

  if (results.length === 0) {
    return `No codebase results found for "${query}".`
  }

  return [
    `🔍 *Codebase Search Results for:* ${query}`,
    `Found ${matchCount} match(es) across ${results.length} file(s)`,
    "",
    ...results.slice(0, maxResults),
  ].join("\n\n")
}

// ── Memory Search ───────────────────────────────────────────────────────

async function searchMemory(query: string, maxResults: number): Promise<string> {
  const sections: string[] = []

  // 1. Search long-term memory
  const memoryResults = await memorySystem.search(query, maxResults)
  if (memoryResults.length > 0) {
    sections.push(
      "🧠 *Memory Results*\n" +
      memoryResults.slice(0, maxResults).map((r) =>
        `• [${r.source}] ${r.content.slice(0, 300)}`,
      ).join("\n"),
    )
  }

  // 2. Search vector memory
  await vectorMemory.initialize()
  const vectorResults = await vectorMemory.search(query, 5, 0.1)
  if (vectorResults.length > 0) {
    sections.push(
      "📊 *Vector Memory Results*\n" +
      vectorResults.map((r) =>
        `• [${r.category}] ${r.content.slice(0, 200)}`,
      ).join("\n"),
    )
  }

  // 3. Search AgentMemory sidecar (if available)
  const amAvailable = await agentMemory.isAvailable()
  if (amAvailable) {
    const amResults = await agentMemory.search(query, 3)
    if (amResults.length > 0) {
      sections.push(
        "🔗 *AgentMemory Results*\n" +
        amResults.map((r) => `• ${r.content.slice(0, 200)}`).join("\n"),
      )
    }
  }

  if (sections.length === 0) {
    return `No memory results found for "${query}".`
  }

  return [`🔎 *Memory Search for:* ${query}`, "", ...sections].join("\n\n")
}

// ── Main orchestrator ──────────────────────────────────────────────────

/**
 * Run a multi-source search and return formatted results.
 * Works without an AI provider — uses tools directly.
 */
export async function runSearch(options: SearchOptions): Promise<string> {
  const { scope, query, maxResults, includePath } = options

  if (!query.trim()) {
    return "Please provide a search query."
  }

  const max = Math.min(maxResults || 8, 20)
  const parts: string[] = []

  if (scope === "code" || scope === "all") {
    const codeResults = await searchCodebase(query, max, includePath)
    parts.push(codeResults)
  }

  if (scope === "memory" || scope === "all") {
    const memoryResults = await searchMemory(query, max)
    parts.push(memoryResults)
  }

  if (scope === "web" || scope === "all") {
    const webResults = await searchWeb(query, max)
    parts.push(webResults)
  }

  return parts.join("\n\n───\n\n")
}

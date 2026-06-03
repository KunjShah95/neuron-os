import type { Tool, ToolResult } from "./registry"

export const webSearchTool: Tool = {
  name: "web_search",
  description: "Search the web for information using a text query",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "The search query",
      required: true,
    },
    {
      name: "count",
      type: "number",
      description: "Number of results to return (default: 5)",
    },
  ],
  async execute(params, _ctx): Promise<ToolResult> {
    const query = params.query as string
    if (!query) {
      return { success: false, output: "", error: "Query parameter is required" }
    }

    const count = Math.min((params.count as number) || 5, 20)

    try {
      const encoded = encodeURIComponent(query)
      const url = `https://html.duckduckgo.com/html/?q=${encoded}`
      const response = await fetch(url, {
        headers: { "User-Agent": "AegisAI/1.0" },
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        return {
          success: false,
          output: "",
          error: `Search failed with HTTP ${response.status}`,
        }
      }

      const html = await response.text()

      const results: Array<{ title: string; snippet: string; url: string }> = []
      const linkRegex = /<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/gi
      const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi
      const urlRegex = /<a[^>]+class="result__url"[^>]* href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi

      let match: RegExpExecArray | null
      while ((match = linkRegex.exec(html)) !== null && results.length < count) {
        const title = match[1]!.replace(/<[^>]*>/g, "").trim()
        results.push({ title, snippet: "", url: "" })
      }

      let si = 0
      while ((match = snippetRegex.exec(html)) !== null && si < results.length) {
        results[si]!.snippet = match[1]!.replace(/<[^>]*>/g, "").trim()
        si++
      }

      let ui = 0
      while ((match = urlRegex.exec(html)) !== null && ui < results.length) {
        const href = match[1]!.replace(/&amp;/g, "&")
        results[ui]!.url = href.startsWith("http") ? href : `https://${href}`
        ui++
      }

      if (results.length === 0) {
        return {
          success: true,
          output: `No search results found for "${query}".`,
          metadata: { query, count: 0 },
        }
      }

      const output = results
        .slice(0, count)
        .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`)
        .join("\n\n")

      return {
        success: true,
        output,
        metadata: { query, count: results.length },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, output: "", error: `Search failed: ${message}` }
    }
  },
}

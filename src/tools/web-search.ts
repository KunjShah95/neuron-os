import type { Tool, ToolResult } from "./registry"

/** Supported search backends — DuckDuckGo is the default (no API key needed). */
type SearchBackend = "duckduckgo" | "tavily" | "serpapi"

function detectBackend(): SearchBackend {
  if (process.env.TAVILY_API_KEY) return "tavily"
  if (process.env.SERPAPI_API_KEY) return "serpapi"
  return "duckduckgo"
}

// ── Tavily Search ────────────────────────────────────────────────────

async function searchTavily(query: string, count: number): Promise<ToolResult> {
  const apiKey = process.env.TAVILY_API_KEY!
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: count, search_depth: "advanced" }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    return { success: false, output: "", error: `Tavily search failed with HTTP ${res.status}` }
  }
  const body: any = await res.json()
  const results: Array<{ title: string; snippet: string; url: string }> = (body.results || []).map((r: any) => ({
    title: r.title ?? "",
    snippet: r.content ?? "",
    url: r.url ?? "",
  }))
  if (results.length === 0) {
    return {
      success: true,
      output: `No search results found for "${query}".`,
      metadata: { query, count: 0, backend: "tavily" },
    }
  }
  const output = results
    .slice(0, count)
    .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`)
    .join("\n\n")
  return { success: true, output, metadata: { query, count: results.length, backend: "tavily" } }
}

// ── SerpAPI Search ────────────────────────────────────────────────────

async function searchSerpApi(query: string, count: number): Promise<ToolResult> {
  const apiKey = process.env.SERPAPI_API_KEY!
  const params = new URLSearchParams({ q: query, api_key: apiKey, engine: "google", num: String(count) })
  const res = await fetch(`https://serpapi.com/search?${params}`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    return { success: false, output: "", error: `SerpAPI search failed with HTTP ${res.status}` }
  }
  const body: any = await res.json()
  const organic = body.organic_results || []
  const results: Array<{ title: string; snippet: string; url: string }> = organic.map((r: any) => ({
    title: r.title ?? "",
    snippet: r.snippet ?? "",
    url: r.link ?? "",
  }))
  if (results.length === 0) {
    return {
      success: true,
      output: `No search results found for "${query}".`,
      metadata: { query, count: 0, backend: "serpapi" },
    }
  }
  const output = results
    .slice(0, count)
    .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`)
    .join("\n\n")
  return { success: true, output, metadata: { query, count: results.length, backend: "serpapi" } }
}

// ── DuckDuckGo (HTML scrape fallback) ────────────────────────────────

async function searchDuckDuckGo(query: string, count: number): Promise<ToolResult> {
  const encoded = encodeURIComponent(query)
  const url = `https://html.duckduckgo.com/html/?q=${encoded}`
  const response = await fetch(url, {
    headers: { "User-Agent": "AegisAI/1.0" },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    return { success: false, output: "", error: `DuckDuckGo search failed with HTTP ${response.status}` }
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
      metadata: { query, count: 0, backend: "duckduckgo" },
    }
  }

  const output = results
    .slice(0, count)
    .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.snippet}`)
    .join("\n\n")

  return { success: true, output, metadata: { query, count: results.length, backend: "duckduckgo" } }
}

// ── Export ────────────────────────────────────────────────────────────

export const webSearchTool: Tool = {
  name: "web_search",
  description:
    "Search the web for information using a text query. Supports DuckDuckGo (default, no key), Tavily (TAVILY_API_KEY), and SerpAPI (SERPAPI_API_KEY).",
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
    const backend = detectBackend()
    try {
      switch (backend) {
        case "tavily":
          return await searchTavily(query, count)
        case "serpapi":
          return await searchSerpApi(query, count)
        default:
          return await searchDuckDuckGo(query, count)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, output: "", error: `Search failed: ${message}` }
    }
  },
}

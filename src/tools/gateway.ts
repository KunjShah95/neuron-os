import { toolRegistry } from "./registry"

export function registerGatewayTools(): void {
  toolRegistry.register({
    name: "brave_search",
    description: "Search the web using Brave Search API (requires BRAVE_SEARCH_API_KEY)",
    parameters: [
      { name: "query", type: "string", description: "Search query", required: true },
      { name: "count", type: "number", description: "Number of results (1-10, default 5)", required: false },
    ],
    async execute(params) {
      const apiKey = process.env.BRAVE_SEARCH_API_KEY
      if (!apiKey) {
        return { success: false, output: "", error: "BRAVE_SEARCH_API_KEY not set" }
      }
      const query = String(params.query ?? "")
      if (!query) return { success: false, output: "", error: "query parameter is required" }
      const count = Math.min(Math.max(1, Number(params.count) || 5), 10)
      try {
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`
        const res = await fetch(url, {
          headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) return { success: false, output: "", error: `Brave Search HTTP ${res.status}` }
        const body = await res.json() as {
          web?: { results?: { title?: string; url?: string; description?: string }[] }
        }
        const results = (body.web?.results ?? []).slice(0, count).map((r) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          description: r.description ?? "",
        }))
        return { success: true, output: JSON.stringify(results) }
      } catch (err) {
        return { success: false, output: "", error: err instanceof Error ? err.message : String(err) }
      }
    },
  })

  toolRegistry.register({
    name: "gateway_fetch",
    description: "Fetch and read a web page, returning plain text content",
    parameters: [
      { name: "url", type: "string", description: "URL to fetch", required: true },
    ],
    async execute(params) {
      const url = String(params.url ?? "")
      if (!url) return { success: false, output: "", error: "url parameter is required" }
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "NeuronOS/1.0" },
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) return { success: false, output: "", error: `HTTP ${res.status}` }
        const text = await res.text()
        const stripped = text.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 8000)
        return { success: true, output: stripped }
      } catch (err) {
        return { success: false, output: "", error: err instanceof Error ? err.message : String(err) }
      }
    },
  })
}

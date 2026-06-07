import Firecrawl from "@mendable/firecrawl-js"
import type { Tool, ToolResult } from "./registry"

interface FirecrawlClient {
  search: (query: string, options?: Record<string, unknown>) => Promise<unknown>
  scrape: (url: string, options?: Record<string, unknown>) => Promise<unknown>
  crawl: (url: string, options?: Record<string, unknown>) => Promise<unknown>
}

type FirecrawlClientFactory = () => FirecrawlClient

let injectedFactory: FirecrawlClientFactory | undefined

export function setFirecrawlClientFactory(factory: FirecrawlClientFactory | undefined): void {
  injectedFactory = factory
}

function getClient(): FirecrawlClient {
  if (injectedFactory) return injectedFactory()
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY is required for Firecrawl tools")
  return new Firecrawl({
    apiKey,
    ...(process.env.FIRECRAWL_API_URL ? { apiUrl: process.env.FIRECRAWL_API_URL } : {}),
  }) as FirecrawlClient
}

function stringifyResult(value: unknown): string {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return String(value ?? "")

  const obj = value as Record<string, unknown>
  if (typeof obj.markdown === "string") return obj.markdown
  if (typeof obj.html === "string") return obj.html
  if (Array.isArray(obj.data)) {
    return obj.data
      .map((item, index) => {
        if (!item || typeof item !== "object") return `${index + 1}. ${String(item)}`
        const row = item as Record<string, unknown>
        const title = row.title ?? row.url ?? `Result ${index + 1}`
        const url = row.url ? `\n   URL: ${row.url}` : ""
        const body = row.markdown ?? row.description ?? row.content ?? row.summary ?? ""
        return `${index + 1}. ${title}${url}${body ? `\n   ${body}` : ""}`
      })
      .join("\n\n")
  }
  return JSON.stringify(value, null, 2)
}

async function runFirecrawl(action: () => Promise<unknown>, metadata: Record<string, unknown>): Promise<ToolResult> {
  try {
    const result = await action()
    return { success: true, output: stringifyResult(result), metadata }
  } catch (err) {
    return { success: false, output: "", error: err instanceof Error ? err.message : String(err), metadata }
  }
}

export const webSearchTool: Tool = {
  name: "web_search",
  description: "Search the web with Firecrawl and return clean agent-ready results.",
  parameters: [
    { name: "query", type: "string", description: "Search query", required: true },
    { name: "count", type: "number", description: "Number of results to return (default: 5)" },
  ],
  async execute(params): Promise<ToolResult> {
    const query = String(params.query ?? "").trim()
    if (!query) return { success: false, output: "", error: "Query parameter is required" }
    const count = Math.min(Number(params.count ?? 5) || 5, 20)
    return runFirecrawl(() => getClient().search(query, { limit: count }), { query, count, backend: "firecrawl" })
  },
}

export const fetchUrlTool: Tool = {
  name: "fetch_url",
  description: "Fetch a single URL with Firecrawl and return markdown by default.",
  parameters: [
    { name: "url", type: "string", description: "URL to fetch", required: true },
    { name: "format", type: "string", description: "Format to request: markdown or html (default: markdown)" },
  ],
  async execute(params): Promise<ToolResult> {
    const url = String(params.url ?? "").trim()
    if (!url) return { success: false, output: "", error: "URL parameter is required" }
    const format = String(params.format ?? "markdown")
    return runFirecrawl(() => getClient().scrape(url, { formats: [format] }), { url, format, backend: "firecrawl" })
  },
}

export const webCrawlTool: Tool = {
  name: "web_crawl",
  description: "Crawl a website with Firecrawl and return page content.",
  parameters: [
    { name: "url", type: "string", description: "Starting URL to crawl", required: true },
    { name: "limit", type: "number", description: "Maximum pages to crawl (default: 5)" },
  ],
  async execute(params): Promise<ToolResult> {
    const url = String(params.url ?? "").trim()
    if (!url) return { success: false, output: "", error: "URL parameter is required" }
    const limit = Math.min(Number(params.limit ?? 5) || 5, 50)
    return runFirecrawl(() => getClient().crawl(url, { limit, scrapeOptions: { formats: ["markdown"] } }), {
      url,
      limit,
      backend: "firecrawl",
    })
  },
}

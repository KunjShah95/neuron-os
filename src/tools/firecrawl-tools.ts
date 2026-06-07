/**
 * Firecrawl web tools - AI-powered web scraping and search.
 *
 * Provides web_search, web_crawl, and fetch_url using Firecrawl API.
 * Firecrawl converts web pages to clean, LLM-ready markdown.
 */

import type { Tool, ToolResult } from "./registry"

// Use dynamic import to avoid type issues
async function getFirecrawlClient(): Promise<any | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) {
    return null
  }
  const { default: FirecrawlApp } = await import("@mendable/firecrawl-js")
  return new FirecrawlApp({ apiKey })
}

function isFirecrawlEnabled(): boolean {
  return !!process.env.FIRECRAWL_API_KEY
}

// ── Web Search via Firecrawl ─────────────────────────────────────────

async function searchFirecrawl(query: string, count: number): Promise<ToolResult> {
  const client = await getFirecrawlClient()
  if (!client) {
    return {
      success: false,
      output: "",
      error: "Firecrawl API key not configured. Set FIRECRAWL_API_KEY environment variable.",
    }
  }

  try {
    const result = await client.search(query, {
      limit: Math.min(count, 10),
    })

    // Handle response - the SDK returns data directly or wrapped
    const data = result.data || result

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return {
        success: true,
        output: `No search results found for "${query}".`,
        metadata: { query, count: 0, backend: "firecrawl" },
      }
    }

    const results = Array.isArray(data) ? data : []

    const output = results
      .slice(0, count)
      .map((r: any, i: number) => {
        const title = r.title || "Untitled"
        const url = r.url || ""
        const markdown = r.markdown || r.content || r.snippet || ""
        const snippet = markdown.slice(0, 300).replace(/\n/g, " ")

        return `${i + 1}. ${title}\n   URL: ${url}\n   ${snippet}${markdown.length > 300 ? "..." : ""}`
      })
      .join("\n\n")

    return {
      success: true,
      output,
      metadata: {
        query,
        count: results.length,
        backend: "firecrawl",
        hasMarkdown: true,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, output: "", error: `Firecrawl search failed: ${message}` }
  }
}

// ── Web Crawl via Firecrawl ──────────────────────────────────────────

async function crawlFirecrawl(
  url: string,
  options: {
    limit?: number
    includePaths?: string[]
    excludePaths?: string[]
    waitFor?: number
  } = {},
): Promise<ToolResult> {
  const client = await getFirecrawlClient()
  if (!client) {
    return {
      success: false,
      output: "",
      error: "Firecrawl API key not configured. Set FIRECRAWL_API_KEY environment variable.",
    }
  }

  try {
    // Start crawl job
    const crawlResult = await client.crawlUrl(url, {
      limit: options.limit || 5,
      includePaths: options.includePaths,
      excludePaths: options.excludePaths,
      scrapeOptions: options.waitFor ? { waitFor: options.waitFor } : undefined,
    })

    // Handle response
    const data = crawlResult.data || crawlResult

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return {
        success: true,
        output: `No pages crawled from ${url}`,
        metadata: { url, pages: 0, backend: "firecrawl" },
      }
    }

    const pages = Array.isArray(data) ? data : []

    const output = pages
      .map((page: any, i: number) => {
        const metadata = page.metadata || {}
        const title = metadata.title || "Untitled"
        const pageUrl = metadata.sourceURL || page.url || ""
        const markdown = page.markdown || page.content || ""
        const preview = markdown.slice(0, 500).replace(/\n/g, " ")

        return `[${i + 1}] ${title}\nURL: ${pageUrl}\n\n${preview}${markdown.length > 500 ? "..." : ""}`
      })
      .join("\n\n---\n\n")

    return {
      success: true,
      output,
      metadata: {
        url,
        pages: pages.length,
        backend: "firecrawl",
        hasMarkdown: true,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, output: "", error: `Firecrawl crawl failed: ${message}` }
  }
}

// ── Fetch URL via Firecrawl ──────────────────────────────────────────

async function fetchFirecrawl(url: string, format: "markdown" | "html" | "text" = "markdown"): Promise<ToolResult> {
  const client = await getFirecrawlClient()
  if (!client) {
    // Fall back to standard fetch if Firecrawl not configured
    return fetchUrlStandard(url, format)
  }

  try {
    const scrapeResult = await client.scrapeUrl(url, {
      formats: [format === "text" ? "markdown" : format],
    })

    // Handle response
    const data = scrapeResult.data || scrapeResult

    if (!data) {
      return {
        success: false,
        output: "",
        error: "Firecrawl returned empty response",
      }
    }

    const content = format === "html" ? data.html || "" : data.markdown || data.content || ""

    return {
      success: true,
      output: content,
      metadata: {
        url,
        format,
        backend: "firecrawl",
        title: data.metadata?.title,
        description: data.metadata?.description,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, output: "", error: `Firecrawl fetch failed: ${message}` }
  }
}

// ── Standard fetch fallback ──────────────────────────────────────────

async function fetchUrlStandard(url: string, format: string): Promise<ToolResult> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "AegisAI/1.0" },
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      return {
        success: false,
        output: "",
        error: `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    const content = await response.text()

    return {
      success: true,
      output: content,
      metadata: {
        url,
        format,
        backend: "fetch",
        status: response.status,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, output: "", error: message }
  }
}

// ── Tool Exports ─────────────────────────────────────────────────────

export const firecrawlSearchTool: Tool = {
  name: "web_search",
  description:
    "Search the web using AI-powered search (Firecrawl). Returns clean, LLM-ready markdown results. Set FIRECRAWL_API_KEY to enable. Falls back to DuckDuckGo if not configured.",
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
      description: "Number of results to return (default: 5, max: 10)",
    },
  ],
  async execute(params, _ctx): Promise<ToolResult> {
    const query = params.query as string
    if (!query) {
      return { success: false, output: "", error: "Query parameter is required" }
    }

    const count = Math.min((params.count as number) || 5, 10)

    // Use Firecrawl if available, otherwise fall back to other backends
    if (isFirecrawlEnabled()) {
      return await searchFirecrawl(query, count)
    }

    // Fall back to existing web-search implementation
    const { webSearchTool } = await import("./web-search")
    return webSearchTool.execute(params, _ctx)
  },
}

export const firecrawlCrawlTool: Tool = {
  name: "web_crawl",
  description:
    "Crawl a website and extract content from multiple pages using Firecrawl. Converts pages to clean markdown. Requires FIRECRAWL_API_KEY.",
  parameters: [
    {
      name: "url",
      type: "string",
      description: "The starting URL to crawl",
      required: true,
    },
    {
      name: "limit",
      type: "number",
      description: "Maximum number of pages to crawl (default: 5, max: 50)",
    },
    {
      name: "includePaths",
      type: "array",
      description: "URL paths to include (e.g., ['/docs/*', '/blog/*'])",
    },
    {
      name: "excludePaths",
      type: "array",
      description: "URL paths to exclude (e.g., ['/admin/*', '/private/*'])",
    },
    {
      name: "waitFor",
      type: "number",
      description: "Wait time in ms for dynamic content (default: 0)",
    },
  ],
  async execute(params, _ctx): Promise<ToolResult> {
    const url = params.url as string
    if (!url) {
      return { success: false, output: "", error: "URL parameter is required" }
    }

    const limit = Math.min((params.limit as number) || 5, 50)
    const includePaths = params.includePaths as string[] | undefined
    const excludePaths = params.excludePaths as string[] | undefined
    const waitFor = params.waitFor as number | undefined

    return await crawlFirecrawl(url, {
      limit,
      includePaths,
      excludePaths,
      waitFor,
    })
  },
}

export const firecrawlFetchTool: Tool = {
  name: "fetch_url",
  description:
    "Fetch and convert a URL to clean markdown or HTML using Firecrawl AI scraping. Set FIRECRAWL_API_KEY for best results. Falls back to standard fetch.",
  parameters: [
    {
      name: "url",
      type: "string",
      description: "The URL to fetch",
      required: true,
    },
    {
      name: "format",
      type: "string",
      description: "Output format: markdown, html, or text (default: markdown)",
    },
  ],
  async execute(params, _ctx): Promise<ToolResult> {
    const url = params.url as string
    if (!url) {
      return { success: false, output: "", error: "URL parameter is required" }
    }

    const format = (params.format as "markdown" | "html" | "text") || "markdown"

    return await fetchFirecrawl(url, format)
  },
}

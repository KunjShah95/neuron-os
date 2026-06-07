/**
 * plan/web-tools — web research tools using Firecrawl for search, crawl, and fetch.
 * Uses jsonSchema() pattern consistent with engine.ts.
 */

import { jsonSchema } from "ai"
import Firecrawl from "@mendable/firecrawl-js"
import type { ActionTracker } from "../../agent/action-tracker"

let client: Firecrawl | null = null

function getClient(): Firecrawl {
  if (client) return client
  client = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY })
  return client
}

function clip(s: string, n = 8000): string {
  return s.length > n ? s.slice(0, n) + "\n…[truncated]" : s
}

export function createWebTools(tracker: ActionTracker): Record<string, any> {
  return {
    web_search: {
      description: "Search the web. Returns title/url/snippet list.",
      parameters: jsonSchema({
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
          limit: { type: "number", description: "Max results (1-10)" },
        },
        required: ["query"],
      }),
      execute: async (args: any) => {
        const res = await getClient().search(args.query, { limit: args.limit ?? 5, sources: ["web"] })
        const items = (res.web ?? []).slice(0, args.limit ?? 5)
        const out =
          items
            .map((d: any, i: number) => {
              const title = ("title" in d && d.title) || "(untitled)"
              const url = ("url" in d && d.url) || ""
              const snip = ("snippet" in d && d.snippet) || ""
              return `${i + 1}. ${title}\n ${url}\n ${snip}`
            })
            .join("\n\n") || "(no result)"
        tracker.log({
          type: "code_analysis",
          path: `web_search:${args.query}`,
          details: { after: out, toolName: "web_search" },
        })
        return clip(out)
      },
    },
    web_crawl: {
      description: "Scrape a URL into markdown text.",
      parameters: jsonSchema({
        type: "object",
        properties: { url: { type: "string", description: "URL to scrape" } },
        required: ["url"],
      }),
      execute: async (args: any) => {
        const doc = await (getClient() as any).scrape(args.url, { formats: ["markdown"] })
        const md = (doc as { markdown?: string }).markdown ?? ""
        tracker.log({
          type: "code_analysis",
          path: `web_crawl:${args.url}`,
          details: { after: clip(md), toolName: "web_crawl" },
        })
        return clip(md) || "(empty)"
      },
    },
    fetch_url: {
      description: "HTTP GET for a URL. Returns response body.",
      parameters: jsonSchema({
        type: "object",
        properties: { url: { type: "string", description: "URL to fetch" } },
        required: ["url"],
      }),
      execute: async (args: any) => {
        const r = await fetch(args.url, { redirect: "follow" })
        const body = await r.text()
        const out = clip(body, 16_000)
        tracker.log({
          type: "code_analysis",
          path: `fetch:${args.url}`,
          details: { after: `HTTP ${r.status}\n\n${out}`, toolName: "fetch_url" },
        })
        return `HTTP ${r.status}\n\n${out}`
      },
    },
  }
}

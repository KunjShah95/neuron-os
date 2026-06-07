import type { Tool, ToolResult, ToolContext } from "../tools/registry"
import { buildConfig } from "./config"
import { CrawlEngine } from "./engine"

export const docsCrawlTool: Tool = {
  name: "docs_crawl",
  description: "Crawl a documentation website and store structured content in the knowledge graph and/or disk. Use this to ingest documentation for later Q&A retrieval.",
  parameters: [
    { name: "url", type: "string", description: "URL to crawl", required: true },
    { name: "mode", type: "string", description: "qa, kg, or both (default: qa)" },
    { name: "depth", type: "number", description: "Max crawl depth (default: 2)" },
    { name: "limit", type: "number", description: "Max pages (default: 50)" },
  ],
  async execute(params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const url = String(params.url ?? "").trim()
    if (!url) return { success: false, output: "", error: "url parameter is required", metadata: { tool: "docs_crawl" } }

    try {
      const config = buildConfig({
        url,
        mode: String(params.mode ?? "qa"),
        depth: Number(params.depth ?? 2),
        limit: Number(params.limit ?? 50),
      })

      const engine = new CrawlEngine()
      const result = await engine.run(config)

      const summary = [
        `Crawled ${result.stats.succeeded} pages from ${url}`,
        result.stats.failed > 0 ? ` (${result.stats.failed} failed)` : "",
        `Mode: ${config.mode}`,
        result.processed.length > 0 ? `${result.processed.reduce((s, p) => s + p.sections.length, 0)} sections extracted` : "",
        result.processed.length > 0 ? `${result.processed.reduce((s, p) => s + p.entities.length, 0)} entities extracted` : "",
        `Output: ${config.outputDir}`,
      ].filter(Boolean).join("\n")

      return {
        success: true,
        output: summary,
        metadata: { tool: "docs_crawl", stats: result.stats, outputDir: config.outputDir },
      }
    } catch (err) {
      return {
        success: false,
        output: "",
        error: `Crawl failed: ${err instanceof Error ? err.message : String(err)}`,
        metadata: { tool: "docs_crawl" },
      }
    }
  },
}

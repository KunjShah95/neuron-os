import { readFileSync, existsSync } from "node:fs"
import { readdirSync, statSync } from "node:fs"
import { resolve, relative, extname } from "node:path"
import { createLogger } from "../cli/logger"
import type { CrawlConfig, CrawledPage, CrawlResult, Heading } from "./types"
import { processPages } from "./processor"
import { KnowledgeGraphWriter } from "./kg-writer"
import { FileWriter } from "./file-writer"
import type FirecrawlApp from "@mendable/firecrawl-js"

const log = createLogger("docs-crawl")

let firecrawlClient: FirecrawlApp | null = null

async function getFirecrawl(): Promise<FirecrawlApp> {
  if (firecrawlClient) return firecrawlClient
  const apiKey = process.env.FIRECRAWL_API_KEY
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY required for web crawling")
  const { default: FirecrawlApp } = await import("@mendable/firecrawl-js")
  firecrawlClient = new FirecrawlApp({ apiKey })
  return firecrawlClient
}

export class CrawlEngine {
  async run(config: CrawlConfig): Promise<CrawlResult> {
    log.info(
      `Starting crawl: ${config.url || config.path} (mode=${config.mode}, depth=${config.depth}, limit=${config.limit})`,
    )

    const pages = config.url ? await this.crawlWeb(config) : await this.crawlLocal(config)
    const crawledAt = new Date().toISOString()
    const failed = pages.filter((p) => !p.markdown)
    const succeeded = pages.filter((p) => p.markdown)

    const processed = processPages(succeeded, config.mode)

    const result: CrawlResult = {
      siteName: config.name!,
      sourceUrl: config.url || config.path || "",
      crawledAt,
      pages: succeeded,
      processed,
      stats: {
        total: pages.length,
        succeeded: succeeded.length,
        failed: failed.length,
        skipped: 0,
      },
    }

    if (config.writeKg) {
      const kgWriter = new KnowledgeGraphWriter()
      kgWriter.write(result)
      log.info(`Ingested ${result.processed.length} pages into knowledge graph`)
    }

    if (config.writeFiles) {
      const fileWriter = new FileWriter(config.outputDir)
      fileWriter.write(result)
      log.info(`Wrote crawl output to ${config.outputDir}`)
    }

    return result
  }

  private async crawlWeb(config: CrawlConfig): Promise<CrawledPage[]> {
    try {
      const client = await getFirecrawl()
      const result = await client.crawlUrl(config.url!, {
        limit: config.limit,
        scrapeOptions: {
          formats: config.mode === "qa" ? ["markdown"] : ["markdown", "html"],
        },
      })

      if (!result || !result.data || !Array.isArray(result.data)) {
        log.warn("Firecrawl returned unexpected response", { result })
        return []
      }

      return result.data.map((item: any, i: number) => pageFromFirecrawl(item, i, config))
    } catch (err) {
      log.error("Web crawl failed", { error: String(err) })
      throw err
    }
  }

  private async crawlLocal(config: CrawlConfig): Promise<CrawledPage[]> {
    const basePath = resolve(config.path || ".")
    if (!existsSync(basePath)) {
      throw new Error(`Path does not exist: ${basePath}`)
    }

    const pages: CrawledPage[] = []

    function walk(dir: string, depth: number) {
      const maxDepth = config.depth ?? 5
      if (depth > maxDepth) return
      let entries: string[]
      try {
        entries = readdirSync(dir)
      } catch {
        return
      }
      for (const entry of entries) {
        const fullPath = resolve(dir, entry)
        let stat: ReturnType<typeof statSync>
        try {
          stat = statSync(fullPath)
        } catch {
          continue
        }
        if (stat.isDirectory()) {
          walk(fullPath, depth + 1)
        } else if (extname(fullPath).toLowerCase() === ".md" && pages.length < config.limit) {
          try {
            const content = readFileSync(fullPath, "utf-8")
            const relPath = relative(basePath, fullPath).replace(/\\/g, "/")
            const id = relPath.replace(/\.md$/i, "")
            const title = extractTitle(content) || id
            const headings = extractHeadings(content)
            const links = extractLinks(content, relPath)
            pages.push({
              id,
              url: relPath,
              title,
              markdown: content,
              rawHtml: undefined,
              headings,
              links,
              depth,
              contentType: guessContentType(relPath, headings),
            })
          } catch {
            // skip unreadable files
          }
        }
        if (pages.length >= config.limit) break
      }
    }

    walk(basePath, 0)
    return pages
  }
}

function pageFromFirecrawl(item: any, _index: number, config: CrawlConfig): CrawledPage {
  const url = item.url || item.metadata?.url || ""
  const id = extractPageId(url, config.url!)
  const markdown = item.markdown || ""
  const html = config.mode !== "qa" ? item.html || item.rawHtml : undefined
  const headings = extractHeadings(markdown)
  const links = extractLinks(markdown, id)

  return {
    id,
    url,
    title: item.title || item.metadata?.title || id,
    markdown,
    rawHtml: html,
    headings,
    links,
    depth: item.metadata?.depth ?? 0,
    contentType: guessContentType(url, headings),
  }
}

function extractPageId(url: string, baseUrl: string): string {
  try {
    const base = new URL(baseUrl)
    const page = new URL(url)
    const path = page.pathname.replace(base.pathname.replace(/\/$/, ""), "").replace(/^\//, "") || "index"
    return path.replace(/\/$/, "") || "index"
  } catch {
    return url
      .replace(/https?:\/\//, "")
      .replace(/[^a-z0-9]/gi, "-")
      .slice(0, 100)
  }
}

function extractTitle(content: string): string {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1]!.trim() : ""
}

function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = []
  const pattern = /^(#{1,6})\s+(.+)$/gm
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    const text = match[2]!.trim()
    const slug = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
    headings.push({ level: match[1]!.length, text, slug })
  }
  return headings
}

function extractLinks(content: string, _pageId: string): { text: string; href: string }[] {
  const links: { text: string; href: string }[] = []
  const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(content)) !== null) {
    const href = match[2]!.trim()
    if (href.startsWith("http") || href.startsWith("/") || href.startsWith("#")) {
      links.push({ text: match[1]!.trim(), href })
    }
  }
  return links
}

function guessContentType(urlOrPath: string, headings: Heading[]): CrawledPage["contentType"] {
  const lower = urlOrPath.toLowerCase()
  if (lower.includes("/api/") || lower.includes("/reference/")) return "api_ref"
  if (lower.includes("/guide/") || lower.includes("/tutorial/")) return "guide"
  for (const h of headings) {
    const text = h.text.toLowerCase()
    if (text.includes("api") || text.includes("reference")) return "api_ref"
    if (text.includes("guide") || text.includes("tutorial")) return "guide"
  }
  return "doc_page"
}

import { mkdirSync, writeFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { createLogger } from "../cli/logger"
import type { CrawlResult, Section } from "./types"

const log = createLogger("docs-crawl-file")

export class FileWriter {
  constructor(private baseDir: string) {}

  write(result: CrawlResult): void {
    const dir = resolve(this.baseDir)
    mkdirSync(dir, { recursive: true })
    mkdirSync(join(dir, "pages"), { recursive: true })

    for (const pp of result.processed) {
      const pagePath = join(dir, "pages", `${pp.page.id}.md`)
      const pageDir = resolve(pagePath, "..")
      mkdirSync(pageDir, { recursive: true })
      writeFileSync(pagePath, pp.page.markdown, "utf-8")
    }

    this.writeManifest(result, dir)
    this.writeSections(result, dir)
    this.writeKnowledgeGraph(result, dir)
    this.writeConfigSnapshot(result, dir)

    log.info(`Files written to ${dir}`)
  }

  private writeManifest(result: CrawlResult, dir: string): void {
    const manifest = {
      siteName: result.siteName,
      sourceUrl: result.sourceUrl,
      crawledAt: result.crawledAt,
      totalPages: result.stats.total,
      succeeded: result.stats.succeeded,
      failed: result.stats.failed,
      pages: result.processed.map((pp) => ({
        id: pp.page.id,
        title: pp.page.title,
        url: pp.page.url,
        sections: pp.sections.length,
        depth: pp.page.depth,
        contentType: pp.page.contentType,
        entities: pp.entities.length,
      })),
    }
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8")
  }

  private writeSections(result: CrawlResult, dir: string): void {
    const sections: Section[] = []
    for (const pp of result.processed) {
      for (const s of pp.sections) {
        sections.push(s)
      }
    }
    writeFileSync(join(dir, "sections.json"), JSON.stringify(sections, null, 2), "utf-8")
  }

  private writeKnowledgeGraph(result: CrawlResult, dir: string): void {
    const nodes: Array<{ id: string; name: string; type: string; context: string }> = []
    const edges: Array<{ source: string; target: string; type: string; weight: number }> = []

    for (const pp of result.processed) {
      nodes.push({
        id: pp.page.id,
        name: pp.page.title,
        type: "doc_page",
        context: pp.page.markdown.slice(0, 200),
      })
      for (const section of pp.sections) {
        nodes.push({
          id: section.id,
          name: section.heading,
          type: "doc_section",
          context: section.content.slice(0, 200),
        })
        edges.push({ source: pp.page.id, target: section.id, type: "has_section", weight: 1.0 })
      }
      for (const entity of pp.entities) {
        nodes.push({
          id: entity.name,
          name: entity.name,
          type: entity.type,
          context: entity.context.slice(0, 200),
        })
        edges.push({ source: pp.page.id, target: entity.name, type: "mentions", weight: 0.7 })
      }
      for (const rel of pp.relationships) {
        edges.push({ source: rel.sourceId, target: rel.targetId, type: rel.type, weight: rel.weight })
      }
    }

    writeFileSync(join(dir, "knowledge-graph.json"), JSON.stringify({ nodes, edges }, null, 2), "utf-8")
  }

  private writeConfigSnapshot(result: CrawlResult, dir: string): void {
    const snapshot = {
      siteName: result.siteName,
      sourceUrl: result.sourceUrl,
      crawledAt: result.crawledAt,
      mode: result.processed.length > 0 ? ((result.processed[0] as (typeof result.processed)[0]).entities.length > 0 ? "kg" : "qa") : "qa",
    }
    writeFileSync(join(dir, "config-snapshot.json"), JSON.stringify(snapshot, null, 2), "utf-8")
  }
}

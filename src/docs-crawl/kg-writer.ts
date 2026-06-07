import { knowledgeGraph } from "../memory/graph"
import { createLogger } from "../cli/logger"
import type { CrawlResult, ProcessedPage } from "./types"

const log = createLogger("docs-crawl-kg")

export class KnowledgeGraphWriter {
  write(result: CrawlResult): void {
    const siteName = result.siteName

    knowledgeGraph.addEntity(siteName, "doc_site", `Documentation site: ${result.sourceUrl}`, result.sourceUrl)

    for (const pp of result.processed) {
      this.writePage(pp, siteName)
    }

    log.info(
      `KG: ${result.processed.length} pages, ${countEntities(result.processed)} entities, ${countRelationships(result.processed)} relationships`,
    )
  }

  private writePage(pp: ProcessedPage, siteName: string): void {
    const page = pp.page
    const pageName = `${siteName}/${page.id}`
    const pageContext = page.markdown.slice(0, 300)

    knowledgeGraph.addEntity(pageName, "doc_page", pageContext, page.url)

    const siteId = this.getEntityId(siteName)
    const pageId = this.getEntityId(pageName)
    if (siteId && pageId) {
      knowledgeGraph.addRelationship(siteId, pageId, "has_page", 1.0)
    }

    for (let i = 0; i < pp.sections.length; i++) {
      const section = pp.sections[i]!
      const sectionName = section.id

      knowledgeGraph.addEntity(sectionName, "doc_section", section.content.slice(0, 500), page.url)

      const secId = this.getEntityId(sectionName)
      if (pageId && secId) {
        knowledgeGraph.addRelationship(pageId, secId, "has_section", 1.0)
      }

      if (i > 0 && secId) {
        const prevSecId = this.getEntityId(pp.sections[i - 1]!.id)
        if (prevSecId) {
          knowledgeGraph.addRelationship(prevSecId, secId, "next_section", 0.5)
        }
      }
    }

    for (const entity of pp.entities) {
      knowledgeGraph.addEntity(entity.name, entity.type, entity.context, page.url)
      const entId = this.getEntityId(entity.name)
      if (pageId && entId) {
        knowledgeGraph.addRelationship(pageId, entId, "mentions", 0.7)
      }
    }

    for (const rel of pp.relationships) {
      const sourceId = this.getEntityId(rel.sourceId)
      const targetId = this.getEntityId(rel.targetId)
      if (sourceId && targetId) {
        knowledgeGraph.addRelationship(sourceId, targetId, rel.type, rel.weight)
      }
    }
  }

  private getEntityId(name: string): string | null {
    const existing = knowledgeGraph.getEntityByName(name)
    return existing?.id ?? null
  }
}

function countEntities(processed: ProcessedPage[]): number {
  const set = new Set<string>()
  for (const pp of processed) {
    for (const e of pp.entities) set.add(e.name)
  }
  return set.size
}

function countRelationships(processed: ProcessedPage[]): number {
  let count = 0
  for (const pp of processed) count += pp.relationships.length
  return count
}

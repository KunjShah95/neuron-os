import type { CrawledPage, ProcessedPage, Section, ExtractedEntity, ExtractedRelationship, CrawlMode } from "./types"

export function processPages(pages: CrawledPage[], mode: CrawlMode): ProcessedPage[] {
  return pages.map((page) => processPage(page, mode))
}

function processPage(page: CrawledPage, mode: CrawlMode): ProcessedPage {
  const sections = extractSections(page.markdown, page.id)
  const entities: ExtractedEntity[] = []
  const relationships: ExtractedRelationship[] = []

  if (mode === "kg" || mode === "both") {
    const extracted = extractEntities(page.markdown, page.id)
    entities.push(...extracted)
    relationships.push(...extractRelationships(extracted, sections))
    if (page.links.length > 0) {
      for (const link of page.links) {
        if (link.href.startsWith("/") || link.href.startsWith("http")) {
          relationships.push({
            sourceId: page.id,
            targetId: normalizeLinkTarget(link.href),
            type: "links_to",
            weight: 1.0,
          })
        }
      }
    }
  }

  return { page, sections, entities, relationships }
}

function extractSections(markdown: string, pageId: string): Section[] {
  const sections: Section[] = []
  const headingPattern = /^(#{1,6})\s+(.+)$/gm
  const headingMatches: Array<{ level: number; text: string; index: number }> = []
  let match: RegExpExecArray | null
  while ((match = headingPattern.exec(markdown)) !== null) {
    headingMatches.push({
      level: match[1]!.length,
      text: match[2]!.trim(),
      index: match.index,
    })
  }

  if (headingMatches.length === 0) {
    if (markdown.trim()) {
      sections.push(makeSection(pageId, "Overview", 1, markdown.trim()))
    }
    return sections
  }

  for (let i = 0; i < headingMatches.length; i++) {
    const h = headingMatches[i]!
    let endIndex: number
    for (let j = i + 1; j < headingMatches.length; j++) {
      if (headingMatches[j]!.level <= h.level) {
        endIndex = headingMatches[j]!.index
        break
      }
    }
    endIndex ??= markdown.length
    const content = markdown.slice(h.index, endIndex).trim()
    sections.push(makeSection(pageId, h.text, h.level, content))
  }

  return sections
}

function makeSection(pageId: string, heading: string, level: number, content: string): Section {
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return {
    id: `${pageId}::section::${slug}`,
    pageId,
    heading,
    level,
    content,
    tokens: Math.ceil(content.length / 4),
  }
}

function extractEntities(markdown: string, pageId: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = []
  const seen = new Set<string>()

  const codeBlockPattern = /```(\w*)\n([\s\S]*?)```/g
  let codeIdx = 0
  let match: RegExpExecArray | null
  while ((match = codeBlockPattern.exec(markdown)) !== null) {
    const language = match[1] || "unknown"
    const code = match[2]!.trim()
    if (code.length >= 10) {
      const name = `${pageId}::code::${++codeIdx}`
      entities.push({
        type: "code_example",
        name,
        context: code.slice(0, 200),
        pageId,
        metadata: { language, lineCount: code.split("\n").length },
      })
    }

    const apiMatch = code.match(/(?:def|function|class|fn)\s+(\w+)/)
    if (apiMatch) {
      const apiName = apiMatch[1]!
      if (!seen.has(apiName)) {
        seen.add(apiName)
        entities.push({
          type: "api_function",
          name: apiName,
          context: apiMatch[0],
          pageId,
          metadata: { language },
        })
      }
    }
  }

  const headingPattern = /^##+\s+(.+)$/gm
  while ((match = headingPattern.exec(markdown)) !== null) {
    const concept = match[1]!.trim()
    if (concept.length >= 3 && !seen.has(concept)) {
      seen.add(concept)
      entities.push({
        type: "doc_concept",
        name: concept,
        context: concept,
        pageId,
      })
    }
  }

  const boldPattern = /\*\*([^*]+)\*\*/g
  while ((match = boldPattern.exec(markdown)) !== null) {
    const word = match[1]!.trim()
    if (word.length >= 3 && word.split(/\s+/).length <= 4 && !seen.has(word)) {
      seen.add(word)
      entities.push({
        type: "doc_concept",
        name: word,
        context: markdown.slice(Math.max(0, match.index - 40), match.index + match[0].length + 80),
        pageId,
      })
    }
  }

  return entities
}

function extractRelationships(entities: ExtractedEntity[], sections: Section[]): ExtractedRelationship[] {
  const rels: ExtractedRelationship[] = []

  for (let i = 0; i < entities.length; i++) {
    const a = entities[i]!
    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j]!
      if (a.type === "api_function" && b.type === "code_example") {
        rels.push({ sourceId: b.name, targetId: a.name, type: "example_of", weight: 0.8 })
      }
    }
  }

  for (const section of sections) {
    for (const entity of entities) {
      if (entity.type === "api_function" && section.content.includes(entity.name)) {
        rels.push({ sourceId: section.id, targetId: entity.name, type: "defines", weight: 1.0 })
      }
    }
  }

  return rels
}

function normalizeLinkTarget(href: string): string {
  try {
    return new URL(href).pathname.replace(/\/$/, "") || "index"
  } catch {
    return href.replace(/^\//, "").replace(/\/$/, "") || "index"
  }
}

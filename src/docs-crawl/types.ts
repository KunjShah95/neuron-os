export type CrawlMode = "qa" | "kg" | "both"

export interface CrawlConfig {
  url?: string
  path?: string
  name?: string
  mode: CrawlMode
  depth: number
  limit: number
  outputDir: string
  writeFiles: boolean
  writeKg: boolean
}

export interface CrawledPage {
  id: string
  url: string
  title: string
  markdown: string
  rawHtml?: string
  headings: Heading[]
  links: { text: string; href: string }[]
  depth: number
  contentType: "doc_page" | "api_ref" | "guide" | "unknown"
}

export interface Heading {
  level: number
  text: string
  slug: string
}

export interface Section {
  id: string
  pageId: string
  heading: string
  level: number
  content: string
  tokens: number
}

export interface ExtractedEntity {
  type: "doc_concept" | "api_function" | "code_example"
  name: string
  context: string
  pageId: string
  sectionId?: string
  metadata?: Record<string, unknown>
}

export interface ExtractedRelationship {
  sourceId: string
  targetId: string
  type: string
  weight: number
}

export interface ProcessedPage {
  page: CrawledPage
  sections: Section[]
  entities: ExtractedEntity[]
  relationships: ExtractedRelationship[]
}

export interface CrawlResult {
  siteName: string
  sourceUrl: string
  crawledAt: string
  pages: CrawledPage[]
  processed: ProcessedPage[]
  stats: { total: number; succeeded: number; failed: number; skipped: number }
}

export interface SiteConfig {
  url?: string
  path?: string
  name: string
  schedule?: string
  depth: number
  limit: number
  mode: CrawlMode
}

export interface DocsCrawlConfig {
  sites: SiteConfig[]
  defaults: {
    outputDir: string
    mode: CrawlMode
  }
}

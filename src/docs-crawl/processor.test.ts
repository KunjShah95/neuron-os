import { describe, it, expect } from "bun:test"
import { processPages } from "./processor"
import type { CrawledPage } from "./types"

const samplePage: CrawledPage = {
  id: "test-page",
  url: "https://example.com/test",
  title: "Test Page",
  markdown: `# Test Page

This is an introduction paragraph about testing.

## Installation

Run \`npm install test\` to get started.

## API Reference

### app.get()

\`\`\`python
def get_item(id: str):
    return {"id": id}
\`\`\`

This is the **main endpoint** for fetching items.

## Usage

Use this library for all your testing needs.
`,
  headings: [
    { level: 1, text: "Test Page", slug: "test-page" },
    { level: 2, text: "Installation", slug: "installation" },
    { level: 2, text: "API Reference", slug: "api-reference" },
    { level: 3, text: "app.get()", slug: "appget" },
    { level: 2, text: "Usage", slug: "usage" },
  ],
  links: [
    { text: "Getting Started", href: "/getting-started" },
    { text: "External", href: "https://other.com/docs" },
  ],
  depth: 0,
  contentType: "doc_page",
}

describe("ContentProcessor", () => {
  it("splits markdown into sections in QA mode", () => {
    const [result] = processPages([samplePage], "qa")
    expect(result.sections.length).toBeGreaterThanOrEqual(4)
    const headings = result.sections.map((s) => s.heading)
    expect(headings).toContain("Test Page")
    expect(headings).toContain("Installation")
    expect(headings).toContain("API Reference")
    expect(headings).toContain("Usage")
  })

  it("extracts entities in KG mode", () => {
    const [result] = processPages([samplePage], "kg")
    expect(result.entities.length).toBeGreaterThan(0)
    const entityNames = result.entities.map((e) => e.name)
    expect(entityNames).toContain("get_item")
    expect(entityNames).toContain("API Reference")
  })

  it("extracts entities in both mode", () => {
    const [result] = processPages([samplePage], "both")
    expect(result.sections.length).toBeGreaterThanOrEqual(4)
    expect(result.entities.length).toBeGreaterThan(0)
  })

  it("extracts relationships in KG mode", () => {
    const [result] = processPages([samplePage], "kg")
    expect(result.relationships.length).toBeGreaterThan(0)
    const relTypes = result.relationships.map((r) => r.type)
    expect(relTypes).toContain("defines")
  })

  it("produces section IDs in correct format", () => {
    const [result] = processPages([samplePage], "qa")
    const section = result.sections.find((s) => s.heading === "Installation")
    expect(section).toBeDefined()
    expect(section!.id).toMatch(/^test-page::section::/)
    expect(section!.id).toContain("installation")
  })

  it("calculates tokens for each section", () => {
    const [result] = processPages([samplePage], "qa")
    for (const section of result.sections) {
      expect(section.tokens).toBeGreaterThan(0)
    }
  })

  it("handles empty markdown gracefully", () => {
    const emptyPage: CrawledPage = {
      ...samplePage,
      id: "empty",
      markdown: "",
      headings: [],
      links: [],
    }
    const [result] = processPages([emptyPage], "qa")
    expect(result.sections.length).toBe(0)
  })

  it("handles markdown with no headings", () => {
    const noHeadingPage: CrawledPage = {
      ...samplePage,
      id: "no-h1",
      markdown: "Just a paragraph of text without any headings.",
      headings: [],
      links: [],
    }
    const [result] = processPages([noHeadingPage], "qa")
    expect(result.sections.length).toBe(1)
    expect(result.sections[0]!.heading).toBe("Overview")
  })
})

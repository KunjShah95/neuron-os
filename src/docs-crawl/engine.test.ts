import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { CrawlEngine } from "./engine"
import { buildConfig } from "./config"
import { randomUUID } from "node:crypto"

const BASE = resolve(import.meta.dir, "..", "..", "tmp", "docs-crawl-test")

function makeSourceDir(): string {
  const dir = join(BASE, `src-${randomUUID().slice(0, 8)}`)
  mkdirSync(dir, { recursive: true })

  writeFileSync(join(dir, "index.md"), `# Welcome

This is the homepage of our test docs.

## Getting Started

Run \`npm start\` to launch the app.

## API

The **main endpoint** is \`GET /api/v1/users\`.

\`\`\`python
def get_users():
    return {"users": []}
\`\`\`

[Installation Guide](/installation)
`, "utf-8")

  writeFileSync(join(dir, "installation.md"), `# Installation

## Requirements

- Node.js 18+
- TypeScript 5+

## Setup

\`\`\`bash
npm install
\`\`\`

[Home](/)
`, "utf-8")

  const nested = join(dir, "nested")
  mkdirSync(nested, { recursive: true })
  writeFileSync(join(nested, "advanced.md"), `# Advanced Topics

## Configuration

Set your environment variables in a \`.env\` file.

## Performance

Use caching for better performance.
`, "utf-8")

  return dir
}

function makeOutputDir(): string {
  const dir = join(BASE, `out-${randomUUID().slice(0, 8)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe("CrawlEngine (local)", () => {
  afterAll(() => {
    if (existsSync(BASE)) rmSync(BASE, { recursive: true, force: true })
  })

  it("crawls local markdown files and produces sections in QA mode", async () => {
    const src = makeSourceDir()
    const engine = new CrawlEngine()
    const config = buildConfig({
      path: src,
      name: "test-docs",
      mode: "qa",
      depth: 5,
      limit: 50,
      output: makeOutputDir(),
    })

    const result = await engine.run(config)

    expect(result.stats.succeeded).toBe(3)
    expect(result.stats.failed).toBe(0)
    expect(result.processed.length).toBe(3)

    const allSections = result.processed.flatMap((p) => p.sections)
    expect(allSections.length).toBeGreaterThanOrEqual(7)

    const allHeadings = allSections.map((s) => s.heading)
    expect(allHeadings).toContain("Welcome")
    expect(allHeadings).toContain("Getting Started")
    expect(allHeadings).toContain("Installation")
    expect(allHeadings).toContain("Requirements")

    for (const section of allSections) {
      expect(section.tokens).toBeGreaterThan(0)
      expect(section.id).toMatch(/::section::/)
    }
  })

  it("crawls local markdown files and extracts entities in KG mode", async () => {
    const src = makeSourceDir()
    const engine = new CrawlEngine()
    const config = buildConfig({
      path: src,
      name: "test-docs",
      mode: "kg",
      depth: 5,
      limit: 50,
      output: makeOutputDir(),
    })

    const result = await engine.run(config)

    expect(result.stats.succeeded).toBe(3)
    const allEntities = result.processed.flatMap((p) => p.entities)
    const entityNames = allEntities.map((e) => e.name)

    expect(entityNames).toContain("get_users")
    expect(entityNames).toContain("Getting Started")

    const allRels = result.processed.flatMap((p) => p.relationships)
    const relTypes = allRels.map((r) => r.type)
    expect(relTypes).toContain("defines")
    expect(relTypes).toContain("links_to")
  })

  it("writes output files to disk when writeFiles=true", async () => {
    const src = makeSourceDir()
    const outputDirPath = makeOutputDir()
    const engine = new CrawlEngine()
    const config = buildConfig({
      path: src,
      name: "test-docs",
      mode: "both",
      depth: 5,
      limit: 50,
      output: outputDirPath,
    })

    await engine.run(config)

    expect(existsSync(join(outputDirPath, "manifest.json"))).toBe(true)
    expect(existsSync(join(outputDirPath, "sections.json"))).toBe(true)
    expect(existsSync(join(outputDirPath, "knowledge-graph.json"))).toBe(true)
    expect(existsSync(join(outputDirPath, "config-snapshot.json"))).toBe(true)
    expect(existsSync(join(outputDirPath, "pages", "index.md"))).toBe(true)
    expect(existsSync(join(outputDirPath, "pages", "installation.md"))).toBe(true)
    expect(existsSync(join(outputDirPath, "pages", "nested", "advanced.md"))).toBe(true)

    const manifest = JSON.parse(readFileSync(join(outputDirPath, "manifest.json"), "utf-8"))
    expect(manifest.siteName).toBe("test-docs")
    expect(manifest.succeeded).toBe(3)
    expect(manifest.pages.length).toBe(3)

    const sections = JSON.parse(readFileSync(join(outputDirPath, "sections.json"), "utf-8"))
    expect(sections.length).toBeGreaterThanOrEqual(7)
  })

  it("supports depth limiting", async () => {
    const src = makeSourceDir()
    const engine = new CrawlEngine()
    const config = buildConfig({
      path: src,
      name: "test-docs",
      mode: "qa",
      depth: 0,
      limit: 50,
      output: makeOutputDir(),
    })

    const result = await engine.run(config)

    expect(result.stats.succeeded).toBe(2)
    const pageIds = result.processed.map((p) => p.page.id)
    expect(pageIds).toContain("index")
    expect(pageIds).toContain("installation")
    expect(pageIds).not.toContain("nested/advanced")
  })

  it("throws on non-existent path", async () => {
    const engine = new CrawlEngine()
    const config = buildConfig({
      path: join(BASE, "does-not-exist"),
      name: "missing",
      mode: "qa",
    })

    expect(engine.run(config)).rejects.toThrow(/does not exist/i)
  })
})

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import type { CrawlConfig, CrawlMode, DocsCrawlConfig, SiteConfig } from "./types"

export function getDefaultOutputDir(name: string): string {
  return resolve(process.cwd(), "data", "docs-crawl", name)
}

export function loadConfigFile(filePath?: string): DocsCrawlConfig | null {
  const path = filePath || resolve(process.cwd(), "data", "docs-crawl-config.jsonc")
  if (!existsSync(path)) return null

  try {
    const raw = readFileSync(path, "utf-8")
    const cleaned = raw
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("//"))
      .join("\n")
    return JSON.parse(cleaned) as DocsCrawlConfig
  } catch {
    return null
  }
}

export function buildConfig(opts: {
  url?: string
  path?: string
  name?: string
  mode?: string
  depth?: number
  limit?: number
  output?: string
  noFiles?: boolean
  noKg?: boolean
}): CrawlConfig {
  const name = opts.name || (opts.url ? new URL(opts.url).hostname.replace(/^www\./, "") : "docs")
  const mode: CrawlMode = (opts.mode as CrawlMode) || "qa"
  return {
    url: opts.url,
    path: opts.path,
    name,
    mode,
    depth: opts.depth ?? 2,
    limit: opts.limit ?? 50,
    outputDir: opts.output || getDefaultOutputDir(name),
    writeFiles: !opts.noFiles,
    writeKg: !opts.noKg,
  }
}

export function siteToConfig(site: SiteConfig): CrawlConfig {
  return {
    url: site.url,
    path: site.path,
    name: site.name,
    mode: site.mode,
    depth: site.depth,
    limit: site.limit,
    outputDir: getDefaultOutputDir(site.name),
    writeFiles: true,
    writeKg: true,
  }
}

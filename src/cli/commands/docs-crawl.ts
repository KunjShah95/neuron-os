import type { Command } from "commander"
import { theme } from "../theme"
import { buildConfig, loadConfigFile, siteToConfig, CrawlEngine } from "../../docs-crawl"

export function registerDocsCrawl(program: Command) {
  const cmd = program
    .command("docscrawl")
    .description("Crawl documentation sites into structured Markdown + knowledge graph")

  cmd
    .command("crawl [url]")
    .description("Crawl a documentation website or local directory")
    .option("-m, --mode <mode>", "qa, kg, or both", "qa")
    .option("-d, --depth <n>", "Max crawl depth", (v) => parseInt(v, 10), 2)
    .option("-l, --limit <n>", "Max pages", (v) => parseInt(v, 10), 50)
    .option("-o, --output <dir>", "Output directory")
    .option("--no-files", "Skip writing files to disk")
    .option("--no-kg", "Skip knowledge graph ingestion")
    .option("--local", "Crawl local markdown files instead of URL")
    .action(async (url: string | undefined, opts: Record<string, unknown>) => {
      if (!url && !opts.local) {
        console.log(theme.error("  URL or --local path required"))
        return
      }

      const config = buildConfig({
        url: opts.local ? undefined : url,
        path: opts.local ? url : undefined,
        mode: opts.mode,
        depth: opts.depth,
        limit: opts.limit,
        output: opts.output,
        noFiles: opts.files === false,
        noKg: opts.kg === false,
      })

      console.log(theme.heading(`\n  Crawling: ${config.url || config.path}`))
      console.log(`  Mode: ${config.mode} | Depth: ${config.depth} | Limit: ${config.limit}`)
      console.log()

      try {
        const engine = new CrawlEngine()
        const result = await engine.run(config)
        console.log(theme.success(`  ✓ Crawl complete`))
        console.log(`  Pages: ${result.stats.succeeded} succeeded, ${result.stats.failed} failed`)
        console.log(`  Output: ${config.outputDir}`)
      } catch (err) {
        console.log(theme.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`))
      }
    })

  cmd
    .command("config")
    .description("Run all crawls defined in the config file")
    .action(async () => {
      const config = loadConfigFile()
      if (!config || !config.sites || config.sites.length === 0) {
        console.log(theme.dim("  No sites configured in data/docs-crawl-config.jsonc"))
        return
      }

      console.log(theme.heading(`  Running ${config.sites.length} configured crawl(s)`))
      console.log()

      for (const site of config.sites) {
        console.log(`  Crawling: ${site.name} (${site.url || site.path})`)
        try {
          const engine = new CrawlEngine()
          const crawlConfig = siteToConfig(site)
          crawlConfig.mode = site.mode || config.defaults?.mode || "qa"
          const result = await engine.run(crawlConfig)
          console.log(theme.success(`  ✓ ${result.stats.succeeded} pages crawled`))
        } catch (err) {
          console.log(theme.error(`  ✗ ${err instanceof Error ? err.message : String(err)}`))
        }
        console.log()
      }
    })

  cmd
    .command("list")
    .description("List crawled documentation sites")
    .action(async () => {
      const { existsSync, readdirSync } = await import("node:fs")
      const { resolve } = await import("node:path")
      const crawlDir = resolve(process.cwd(), "data", "docs-crawl")
      if (!existsSync(crawlDir)) {
        console.log(theme.dim("  No crawled sites yet."))
        return
      }
      const sites = readdirSync(crawlDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
      if (sites.length === 0) {
        console.log(theme.dim("  No crawled sites yet."))
        return
      }
      console.log(theme.heading("  Crawled Sites:"))
      console.log()
      for (const site of sites) {
        const manifestPath = resolve(crawlDir, site, "manifest.json")
        if (existsSync(manifestPath)) {
          const { readFileSync } = await import("node:fs")
          try {
            const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"))
            console.log(
              `  ${theme.accent(site)} — ${manifest.succeeded || 0} pages (${manifest.crawledAt || "unknown"})`,
            )
          } catch {
            console.log(`  ${theme.accent(site)}`)
          }
        } else {
          console.log(`  ${theme.accent(site)}`)
        }
      }
    })
}

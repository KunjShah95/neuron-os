import { createLogger } from "../cli/logger"
import { loadConfigFile, siteToConfig } from "./config"
import { CrawlEngine } from "./engine"

const log = createLogger("docs-crawl-cron")

export function registerCrawlJobs(): void {
  const config = loadConfigFile()
  if (!config || !config.sites || config.sites.length === 0) {
    log.debug("No docs-crawl sites configured for cron")
    return
  }

  for (const site of config.sites) {
    if (!site.schedule) continue
    registerSiteJob(site as { name: string; schedule: string; url?: string; path?: string; depth?: number; limit?: number; mode?: string })
  }
}

function registerSiteJob(site: {
  name: string
  schedule: string
  url?: string
  path?: string
  depth?: number
  limit?: number
  mode?: string
}): void {
  log.info(`Registering crawl job: ${site.name} (every ${site.schedule})`)

  const timer = setInterval(async () => {
    log.info(`Running scheduled crawl: ${site.name}`)
    try {
      const engine = new CrawlEngine()
      const crawlConfig = siteToConfig(site as Parameters<typeof siteToConfig>[0])
      const result = await engine.run(crawlConfig)
      log.info(`Scheduled crawl complete: ${site.name} (${result.stats.succeeded} pages)`)
    } catch (err) {
      log.error(`Scheduled crawl failed: ${site.name}`, { error: String(err) })
    }
  }, parseCronInterval(site.schedule))

  if (typeof process !== "undefined" && typeof process.on === "function") {
    process.on("exit", () => clearInterval(timer))
  }
}

function parseCronInterval(schedule: string): number {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length < 5) return 3600000

  const p = (i: number) => parseInt(parts[i] ?? "0", 10)

  if (!isNaN(p(0)) && !isNaN(p(1)) && !isNaN(p(2))) {
    if (p(0) === 0 && p(1) === 6) return 604800000
    if (p(0) === 0 && p(1) === 0) return 86400000
    if (p(0) === 0) return 3600000
  }

  return 3600000
}

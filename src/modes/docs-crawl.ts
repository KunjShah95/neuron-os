import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import { loadConfigFile } from "../docs-crawl"
import type { Mode } from "./types"

export const docsCrawlMode: Mode = {
  id: "docs-crawl",
  name: "Docs Crawl",
  description: "Crawl documentation sites into structured Markdown + knowledge graph",

  async run() {
    const lines: string[] = [""]
    const config = loadConfigFile()

    if (config && config.sites.length > 0) {
      lines.push(`  ${theme.heading("Configured Sites")}`)
      lines.push("")
      for (const site of config.sites) {
        const schedule = site.schedule ? theme.dim(` [every ${site.schedule}]`) : ""
        lines.push(`  ${theme.accent(site.name.padEnd(20))} ${site.url || site.path}${schedule}`)
        lines.push(`  ${theme.dim(`depth=${site.depth}, limit=${site.limit}, mode=${site.mode}`)}`)
        lines.push("")
      }
    } else {
      lines.push(`  ${theme.muted("No configured sites. Create data/docs-crawl-config.jsonc or use CLI:")}`)
      lines.push("")
    }

    lines.push(`  ${theme.muted("CLI Commands:")}`)
    lines.push(`  ${theme.dim("aegis docscrawl crawl <url>")}`)
    lines.push(`  ${theme.dim("aegis docscrawl crawl --local ./docs")}`)
    lines.push(`  ${theme.dim("aegis docscrawl config")}`)
    lines.push(`  ${theme.dim("aegis docscrawl list")}`)

    return showInfoScreen("Docs Crawl", lines, { back: true })
  },
}

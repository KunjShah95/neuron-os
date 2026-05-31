import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import { listActiveJobs } from "../cron"
import type { Mode } from "./types"

export const cronMode: Mode = {
  id: "cron",
  name: "Cron",
  description: "Scheduled jobs and heartbeat",

  async run() {
    const jobs = await listActiveJobs()
    const lines: string[] = [""]

    if (jobs.length === 0) {
      lines.push(`  ${theme.muted("No cron jobs scheduled.")}`)
    } else {
      lines.push(`  ${theme.heading("Scheduled Jobs")}`)
      lines.push("")
      for (const job of jobs) {
        const typeInfo = job.agentType ? theme.dim(` [${job.agentType}]`) : ""
        lines.push(`  ${theme.accent(job.name.padEnd(20))} every ${theme.bold(job.schedule)}${typeInfo}`)
        lines.push(`  ${theme.dim(job.goal.slice(0, 100))}`)
        lines.push("")
      }
    }

    lines.push(`  ${theme.muted("Use CLI: aegis cron add <name> <schedule> <goal>")}`)
    lines.push(`  ${theme.muted("Use CLI: aegis cron remove <name>")}`)
    lines.push(`  ${theme.muted("Use CLI: aegis cron heartbeat")}`)

    return showInfoScreen("Cron Jobs", lines, { back: true })
  },
}

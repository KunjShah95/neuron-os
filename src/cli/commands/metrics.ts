import type { Command } from "commander"
import { theme } from "../theme"
import { agentManager } from "../../agent/manager"
import { soulManager } from "../../agent/soul"

function tryFetch(url: string): Promise<unknown> {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  })
}

export function registerMetrics(program: Command) {
  program
    .command("metrics")
    .description("Show system metrics snapshot")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const data = await tryFetch("http://localhost:8080/api/v1/metrics")
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2))
          return
        }
        const d = data as Record<string, unknown>
        const agents = d.agents as Record<string, number>
        const souls = d.souls as Record<string, unknown>
        const plugins = d.plugins as Record<string, unknown>
        const system = d.system as Record<string, unknown>

        console.log()
        console.log(`  ${theme.bold("Metrics Snapshot")}`)
        console.log(`  ${theme.muted("─".repeat(50))}`)
        console.log(`  ${theme.info("Agents:")}   ${agents.total} total, ${agents.running} running`)
        console.log(`  ${theme.info("Souls:")}    ${souls.total} total, avg mood ${souls.avgMoodScore as number}/100`)
        console.log(`  ${theme.info("Plugins:")}  ${plugins.installed} installed`)
        console.log(`  ${theme.info("Uptime:")}   ${Math.floor((system.uptime as number) / 60)}m`)
        console.log(`  ${theme.info("Version:")}  ${system.version as string}`)
        console.log()
      } catch {
        // Fallback: local data
        if (opts.json) {
          const souls = soulManager.list()
          const agents = agentManager.list()
          console.log(JSON.stringify({
            agents: { total: agents.length, running: agents.filter((a) => a.status === "running").length },
            souls: { total: souls.length },
          }, null, 2))
          return
        }

        const souls = soulManager.list()
        const agents = agentManager.list()
        const running = agents.filter((a) => a.status === "running").length
        console.log()
        console.log(`  ${theme.bold("Metrics Snapshot")} ${theme.muted("(local)")}`)
        console.log(`  ${theme.muted("─".repeat(50))}`)
        console.log(`  ${theme.info("Agents:")}   ${agents.length} total, ${running} running`)
        console.log(`  ${theme.info("Souls:")}    ${souls.length} registered`)
        console.log()
      }
    })
}

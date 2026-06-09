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

export function registerHealth(program: Command) {
  program
    .command("health")
    .description("Show system health overview")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      try {
        const data = await tryFetch("http://localhost:8080/api/v1/health")
        if (opts.json) {
          console.log(JSON.stringify(data, null, 2))
          return
        }
        const d = data as Record<string, unknown>
        console.log()
        console.log(`  ${theme.bold("System Health")}`)
        console.log(`  ${theme.muted("─".repeat(50))}`)
        console.log(`  ${theme.info("Status:")}   ${theme.success("✓ OK")}  (v${d.version as string})`)
        console.log(`  ${theme.info("Uptime:")}   ${Math.floor((d.uptime as number) / 60)}m`)
        const agents = d.agents as Record<string, number>
        console.log(`  ${theme.info("Agents:")}   ${agents.running}/${agents.total} running`)
        const souls = d.souls as Record<string, unknown>
        console.log(`  ${theme.info("Souls:")}    ${souls.total} registered`)
        const plugins = d.plugins as Record<string, unknown>
        console.log(`  ${theme.info("Plugins:")}  ${plugins.installed} installed`)
        console.log()
      } catch {
        // Fallback: local data
        if (opts.json) {
          const souls = soulManager.list()
          const agents = agentManager.list()
          console.log(JSON.stringify({
            status: "ok",
            agents: { total: agents.length, running: agents.filter((a) => a.status === "running").length },
            souls: { total: souls.length },
          }, null, 2))
          return
        }

        const souls = soulManager.list()
        const agents = agentManager.list()
        const running = agents.filter((a) => a.status === "running").length
        console.log()
        console.log(`  ${theme.bold("System Health")} ${theme.muted("(local)")}`)
        console.log(`  ${theme.muted("─".repeat(50))}`)
        console.log(`  ${theme.info("Status:")}   ${theme.success("✓ OK")}`)
        console.log(`  ${theme.info("Agents:")}   ${running}/${agents.length} running`)
        console.log(`  ${theme.info("Souls:")}    ${souls.length} registered`)
        console.log()
      }
    })
}

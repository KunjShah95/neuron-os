import type { Command } from "commander"
import { theme } from "../theme"
import { agentMemory } from "../../memory"

export function registerAgentMemory(program: Command) {
  const am = program.command("agentmemory").alias("am").description("Manage agentmemory sidecar connection")

  am.command("status")
    .description("Show agentmemory connection status and stats")
    .action(async () => {
      const available = await agentMemory.isAvailable()
      if (!available) {
        console.log(theme.dim("  agentmemory server not running"))
        console.log(theme.dim("  Start it with: npx @agentmemory/agentmemory"))
        return
      }

      const health = await agentMemory.getHealth()
      const stats = await agentMemory.getStats()

      console.log(theme.heading("  AgentMemory Status"))
      console.log()
      console.log(`  ${theme.accent("Status".padEnd(16))} ${theme.success("connected")}`)
      if (health) {
        console.log(`  ${theme.accent("Service".padEnd(16))} ${health.service}`)
      }
      if (stats.totalSessions !== undefined) {
        console.log(`  ${theme.accent("Sessions".padEnd(16))} ${stats.totalSessions}`)
      }
      console.log()
      console.log(theme.dim("  Memory server:") + ` ${process.env.AGENTMEMORY_URL || "http://localhost:3111"}`)
    })

  am.command("search <query>")
    .description("Search agentmemory with semantic query")
    .option("-l, --limit <n>", "Max results", "5")
    .action(async (query: string, opts: { limit?: string }) => {
      const available = await agentMemory.isAvailable()
      if (!available) {
        console.log(theme.dim("  agentmemory server not running"))
        return
      }

      const limit = parseInt(opts.limit ?? "5", 10)
      const results = await agentMemory.search(query, limit)

      if (results.length === 0) {
        console.log(theme.dim("  No results found."))
        return
      }

      console.log(theme.heading(`  Search: "${query}"`))
      console.log()
      for (const r of results) {
        const score = theme.muted(`[${(r.score * 100).toFixed(0)}%]`)
        console.log(`  ${score} ${r.content.slice(0, 200)}`)
        if (r.source) console.log(`    ${theme.dim(r.source)}`)
        console.log()
      }
    })

  am.command("connect")
    .description("Test connection to agentmemory server")
    .action(async () => {
      console.log(theme.info("  Testing agentmemory connection..."))

      const available = await agentMemory.isAvailable()
      if (!available) {
        console.log(theme.error("  ✗ Could not connect"))
        console.log(theme.dim("  Ensure agentmemory is running:"))
        console.log(theme.dim("    npx @agentmemory/agentmemory"))
        process.exitCode = 1
        return
      }

      const health = await agentMemory.getHealth()
      console.log(theme.success("  ✓ Connected to agentmemory"))
      if (health) {
        console.log(`  ${theme.dim("Service:")} ${health.service}`)
        console.log(`  ${theme.dim("Viewer:")} ${health.viewerPort ? `http://localhost:${health.viewerPort}` : "n/a"}`)
      }
    })
}

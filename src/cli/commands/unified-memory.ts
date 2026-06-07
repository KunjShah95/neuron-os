import type { Command } from "commander"
import { theme } from "../theme"
import { UnifiedMemoryQuery } from "../../memory/unified-query"

const STORE_NAMES = ["recall", "vector", "sessions", "experience"] as const

export function registerUnifiedMemory(program: Command): void {
  const mem = program.commands.find((c) => c.name() === "memory")
  if (!mem) return

  mem
    .command("query <question>")
    .description("Search across all memory stores")
    .option("--stores <stores>", `Comma-separated: ${STORE_NAMES.join(",")} (default: all)`)
    .option("--store <name>", `Search only one store: ${STORE_NAMES.join("|")}`)
    .option("--limit <n>", "Results per store", (v) => parseInt(v, 10), 5)
    .action(async (question: string, opts: { stores?: string; store?: string; limit: number }) => {
      const stores = opts.store ? [opts.store] : opts.stores ? opts.stores.split(",").map((s) => s.trim()) : undefined

      const results = await UnifiedMemoryQuery.search({
        query: question,
        stores: stores as any,
        limit: opts.limit,
      })

      if (results.length === 0) {
        console.log(theme.dim("  No matching memory found."))
        return
      }

      for (const r of results) {
        const tag = theme.accent(`[${r.store}]`)
        const pct = theme.dim(`(${(r.score * 100).toFixed(0)}%)`)
        console.log(`  ${tag} ${pct}  ${r.content.slice(0, 200)}`)
        if (r.sessionId) {
          console.log(`    ${theme.dim(`session: ${r.sessionId}`)}`)
        }
        console.log()
      }
    })

  mem
    .command("status")
    .description("Show stats across all memory stores")
    .action(async () => {
      const stats = await UnifiedMemoryQuery.getStoreStats()
      console.log(theme.heading("  Unified Memory Status"))
      console.log()
      console.log(
        `  ${theme.bold("Recall:")}       ${stats.recall.indexedTurns} turns across ${stats.recall.sessions} sessions`,
      )
      console.log(`  ${theme.bold("Vector:")}       ${stats.vector.entries} entries`)
      console.log(
        `  ${theme.bold("Sessions:")}     ${stats.sessions.total} sessions, ${stats.sessions.messages} messages`,
      )
      console.log(
        `  ${theme.bold("Experience:")}   ${stats.experience.total} total, ${stats.experience.successRate}% success rate`,
      )
      console.log()
    })
}

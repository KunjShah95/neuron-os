import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { memorySystem, vectorMemory } from "../../memory"
import type { ExtractedFact } from "../../memory/types"
import { registerMemoryPolicy } from "./memory-policy"

export function registerMemory(program: Command) {
  const mem = program
    .command("memory")
    .description("Manage memory and vector search")

  mem
    .command("show")
    .description("Show current MEMORY.md content")
    .action(async () => {
      const content = await memorySystem.loadMemory()
      if (!content.trim()) {
        console.log(theme.dim("  Memory is empty."))
        return
      }
      console.log(content)
    })

  registerMemoryPolicy(mem)

  mem
    .command("add <content>")
    .description("Append content to long-term memory")
    .action(async (content: string) => {
      await memorySystem.appendToMemory(content)
      console.log(theme.success("  ✓ Saved to MEMORY.md"))
    })

  mem
    .command("search <query>")
    .description("Search memory and daily logs")
    .option("--vector", "Also search vector memory", false)
    .action(async (query: string, opts: { vector?: boolean }) => {
      const results = await memorySystem.search(query)

      if (opts.vector) {
        await vectorMemory.initialize()
        const vecResults = await vectorMemory.search(query)
        if (vecResults.length > 0) {
          console.log(theme.heading("  Vector Search Results:"))
          console.log()
          for (const r of vecResults) {
            console.log(`  ${theme.accent("→")} ${r.content.slice(0, 200)}`)
            console.log(`    ${theme.dim(`[${r.source}] ${r.timestamp}`)}`)
            console.log()
          }
        }
      }

      if (results.length === 0) {
        console.log(theme.dim("  No results found."))
        return
      }

      console.log(theme.heading("  Search Results:"))
      console.log()
      for (const r of results) {
        const source = theme.accent(`[${r.source}]`)
        const time = theme.dim(r.timestamp)
        console.log(`  ${source} ${time}`)
        const lines = r.content.split("\n").filter(Boolean).slice(0, 5)
        for (const line of lines) {
          console.log(`    ${line.slice(0, 120)}`)
        }
        console.log()
      }
    })

  mem
    .command("facts")
    .description("Show extracted facts from conversations")
    .option("--category <cat>", "Filter by category: preference, project, identity, etc")
    .action(async (opts: { category?: string }) => {
      if (opts.category) {
        const facts = await memorySystem.getFactsByCategory(opts.category as ExtractedFact["category"])
        if (facts.length === 0) {
          console.log(theme.dim(`  No facts found for category "${opts.category}".`))
          return
        }
        console.log(theme.heading(`  Facts [${opts.category}]:`))
        console.log()
        for (const f of facts) {
          const conf = f.confidence > 0.8 ? theme.success("high") : f.confidence > 0.5 ? theme.warn("med") : theme.dim("low")
          console.log(`  • ${f.fact} (${conf})`)
        }
      } else {
        const facts = await memorySystem.getAllFacts()
        if (facts.length === 0) {
          console.log(theme.dim("  No facts extracted yet."))
          return
        }
        const grouped: Record<string, typeof facts> = {}
        for (const f of facts) {
          (grouped[f.category] ??= []).push(f)
        }
        for (const [category, catFacts] of Object.entries(grouped)) {
          console.log(theme.heading(`  ${category}:`))
          console.log()
          for (const f of catFacts.slice(0, 10)) {
            console.log(`  • ${f.fact}`)
          }
          if (catFacts.length > 10) {
            console.log(`  ${theme.dim(`    … and ${catFacts.length - 10} more`)}`)
          }
          console.log()
        }
      }
    })

  // Default: show status
  mem.action(async () => {
    showBanner()
    const content = await memorySystem.loadMemory()
    await vectorMemory.initialize()
    const vecStats = await vectorMemory.getStats()
    console.log()
    if (!content.trim()) {
      console.log(`  ${theme.warn("Memory is empty")}`)
    } else {
      const lines = content.split("\n").filter(Boolean)
      console.log(`  ${theme.success(`● ${lines.length} lines in MEMORY.md`)}`)
    }
    console.log(`  ${theme.dim(`  Vector entries: ${vecStats.total}`)}`)
    console.log()
    console.log(`  ${theme.muted("Subcommands: show, add, search, facts, vector, stats, policy")}`)
    console.log()
  })

  mem
    .command("stats")
    .description("Show memory system stats")
    .action(async () => {
      showBanner()
      const content = await memorySystem.loadMemory()
      await vectorMemory.initialize()
      const vecStats = await vectorMemory.getStats()
      const { sessionStore } = await import("../../memory/session-persistence")

      const lines = content.split("\n").filter(Boolean)
      const sessionCount = sessionStore.listSessions().length

      console.log(theme.heading("  Memory System Statistics"))
      console.log()
      console.log(`  ${theme.bold("MEMORY.md:")}    ${lines.length} lines`)
      console.log(`  ${theme.bold("Vector:")}       ${vecStats.total} entries`)
      console.log(`  ${theme.bold("Sessions:")}     ${sessionCount} total`)
      if (vecStats.total > 0) {
        console.log()
        console.log(theme.dim("  By category:"))
        for (const [cat, count] of Object.entries(vecStats.byCategory)) {
          console.log(`    ${theme.accent(cat.padEnd(20))} ${count}`)
        }
      }
      console.log()
    })

  mem
    .command("vector")
    .description("Vector memory (semantic search) stats")
    .action(async () => {
      await vectorMemory.initialize()
      const stats = await vectorMemory.getStats()
      console.log(theme.heading("  Vector Memory:"))
      console.log(`  Total entries: ${theme.bold(String(stats.total))}`)
      console.log()
      for (const [cat, count] of Object.entries(stats.byCategory)) {
        console.log(`  ${theme.accent(cat.padEnd(20))} ${count}`)
      }
    })
}

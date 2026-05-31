import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import { memorySystem, vectorMemory } from "../memory"
import type { Mode } from "./types"

export const memoryMode: Mode = {
  id: "memory",
  name: "Memory",
  description: "Long-term memory, facts, and vector search",

  async run() {
    const content = await memorySystem.loadMemory()
    const allFacts = await memorySystem.getAllFacts()
    await vectorMemory.initialize()
    const vecStats = await vectorMemory.getStats()

    const lines: string[] = [""]

    lines.push(`  ${theme.heading("Memory")}`)
    lines.push(`  ${theme.muted(`${content.length} characters`)}`)
    lines.push("")

    if (content.trim()) {
      const preview = content.split("\n").slice(0, 15)
      for (const line of preview) {
        if (line.trim()) lines.push(`  ${theme.dim(line.slice(0, 80))}`)
      }
      if (content.split("\n").length > 15) {
        lines.push(`  ${theme.muted("  ... (truncated)")}`)
      }
    } else {
      lines.push(`  ${theme.muted("Memory is empty.")}`)
    }

    lines.push("")
    lines.push(`  ${theme.heading("Facts")}`)
    const grouped: Record<string, typeof allFacts> = {}
    for (const f of allFacts) {
      (grouped[f.category] ??= []).push(f)
    }
    if (Object.keys(grouped).length === 0) {
      lines.push(`  ${theme.muted("No facts extracted yet.")}`)
    } else {
      for (const [category, catFacts] of Object.entries(grouped)) {
        lines.push(`  ${theme.accent(category)} (${catFacts.length})`)
        for (const f of catFacts.slice(0, 5)) {
          lines.push(`    ${theme.dim(f.fact.slice(0, 80))}`)
        }
        if (catFacts.length > 5) {
          lines.push(`    ${theme.muted(`... and ${catFacts.length - 5} more`)}`)
        }
      }
    }

    lines.push("")
    lines.push(`  ${theme.heading("Vector Memory")}`)
    lines.push(`  ${theme.muted(`Total entries: ${vecStats.total}`)}`)
    for (const [cat, count] of Object.entries(vecStats.byCategory)) {
      lines.push(`  ${theme.accent(cat.padEnd(20))} ${count}`)
    }

    lines.push("")
    lines.push(`  ${theme.muted("Use CLI: aegis memory add <content>")}`)
    lines.push(`  ${theme.muted("Use CLI: aegis memory search <query> [--vector]")}`)

    return showInfoScreen("Memory", lines, { back: true })
  },
}

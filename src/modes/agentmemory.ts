import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import { agentMemory } from "../memory"
import type { Mode } from "./types"

export const agentMemoryMode: Mode = {
  id: "agentmemory",
  name: "AgentMemory",
  description: "agentmemory sidecar status and search",

  async run() {
    const available = await agentMemory.isAvailable()
    const lines: string[] = [""]

    if (!available) {
      lines.push(`  ${theme.warn("agentmemory server not running")}`)
      lines.push("")
      lines.push(`  ${theme.dim("Start it with:")}`)
      lines.push(`  ${theme.dim("  npx @agentmemory/agentmemory")}`)
      lines.push("")
      lines.push(`  ${theme.dim("Or install globally:")}`)
      lines.push(`  ${theme.dim("  npm install -g @agentmemory/agentmemory")}`)
      lines.push(`  ${theme.dim("  agentmemory")}`)
      lines.push("")
      lines.push(`  ${theme.muted("The local memory system still works without it.")}`)
      return showInfoScreen("AgentMemory", lines, { back: true })
    }

    const health = await agentMemory.getHealth()
    const stats = await agentMemory.getStats()
    const sessions = await agentMemory.listSessions()

    lines.push(`  ${theme.success("● Connected")}`)
    lines.push("")
    lines.push(`  ${theme.heading("Server")}`)
    if (health) {
      lines.push(`  ${theme.accent("Service".padEnd(16))} ${health.service}`)
    }
    lines.push(`  ${theme.accent("URL".padEnd(16))} ${process.env.AGENTMEMORY_URL || "http://localhost:3111"}`)
    lines.push("")

    lines.push(`  ${theme.heading("Stats")}`)
    if (stats.totalSessions !== undefined) {
      lines.push(`  ${theme.accent("Sessions".padEnd(16))} ${stats.totalSessions}`)
    }
    if (health?.viewerPort) {
      lines.push(`  ${theme.accent("Viewer".padEnd(16))} http://localhost:${health.viewerPort}`)
    }
    lines.push("")

    if (sessions.length > 0) {
      lines.push(`  ${theme.heading("Recent Sessions")}`)
      for (const s of sessions.slice(0, 5)) {
        const summary = s.summary ? s.summary.slice(0, 80) : "—"
        lines.push(`  ${theme.dim(s.id.slice(0, 8))}  ${summary}`)
      }
      lines.push("")
    }

    lines.push(`  ${theme.muted("Use CLI: aegis agentmemory search <query>")}`)
    lines.push(`  ${theme.muted("Use CLI: aegis agentmemory status")}`)

    return showInfoScreen("AgentMemory", lines, { back: true })
  },
}

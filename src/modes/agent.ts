import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import { agentManager } from "../agent/manager"
import { getAgentType } from "../agent/agent-types"
import type { Mode } from "./types"

export const agentMode: Mode = {
  id: "agent",
  name: "Agent Manager",
  description: "List, inspect, and manage agents",

  async run() {
    const agents = agentManager.list()
    const lines: string[] = [""]

    if (agents.length === 0) {
      lines.push(`  ${theme.muted("No agents running.")}`)
      lines.push("")
      lines.push(`  ${theme.muted("Use CLI: aegis agent spawn <name> [--type <type>]")}`)
    } else {
      lines.push(`  ${theme.heading(`Agents (${agents.length})`)}`)
      lines.push("")

      const statusColor: Record<string, (s: string) => string> = {
        spawning: theme.warn, running: theme.success, idle: theme.info,
        busy: theme.accent, stopping: theme.warn, stopped: theme.muted, error: theme.error,
      }

      for (const a of agents) {
        const color = statusColor[a.status] ?? theme.dim
        const statusBadge = color(`● ${a.status}`)
        const uptime = a.spawnTime ? `${Math.floor((Date.now() - a.spawnTime) / 1000)}s` : "-"
        const typeInfo = a.def.agentType ? theme.dim(` [${a.def.agentType}]`) : ""
        lines.push(`  ${theme.bold(a.def.name)}${typeInfo}  ${statusBadge}  pid:${a.pid}  uptime:${uptime}`)
        if (a.def.tags?.length) {
          lines.push(`    tags: ${a.def.tags.join(", ")}`)
        }

        const type = a.def.agentType ? getAgentType(a.def.agentType) : null
        if (type) {
          lines.push(`    tools: ${type.tools.filter(t => t.allow).map(t => t.name).join(", ")}`)
        }
        lines.push("")
      }
    }

    const allTypes = agentManager.list()
    lines.push(`  ${theme.heading("Agent Types")}`)
    lines.push("")
    const { getPrimaryAgentTypes, getSubagentTypes } = await import("../agent/agent-types")
    for (const t of getPrimaryAgentTypes()) {
      const modelInfo = t.modelHint ? theme.dim(` [${t.modelHint}]`) : ""
      lines.push(`  ${theme.accent(t.name.padEnd(14))} ${t.description}${modelInfo}`)
    }
    lines.push("")
    for (const t of getSubagentTypes()) {
      const modelInfo = t.modelHint ? theme.dim(` [${t.modelHint}]`) : ""
      lines.push(`  ${theme.accent(t.name.padEnd(14))} ${t.description}${modelInfo}`)
    }

    return showInfoScreen("Agents", lines, { back: true })
  },
}

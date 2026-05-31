import cliTruncate from "cli-truncate"
import { theme, box } from "../../cli/theme"
import type { Region } from "../layout"
import type { AppState } from "../store"

const statusDot: Record<string, { sym: string; color: (s: string) => string }> = {
  running: { sym: box.bullet, color: theme.success },
  idle: { sym: box.bullet, color: theme.warn },
  stopped: { sym: box.dot, color: theme.muted },
  error: { sym: box.cross, color: theme.error },
}

export function renderAgentList(state: AppState, region: Region): string[] {
  const lines: string[] = []

  // Heading
  lines.push(theme.heading(cliTruncate(" AGENTS", region.width)))

  if (state.agents.size === 0) {
    lines.push(theme.muted(cliTruncate(" No agents running", region.width)))
    return lines
  }

  for (const agent of state.agents.values()) {
    const entry = statusDot[agent.status]
    if (!entry) continue
    const statusLine = ` ${entry.sym} ${agent.name}`
    const toolInfo = agent.currentTool ? theme.muted(` ${agent.currentTool}`) : ""
    const inner = cliTruncate(statusLine + toolInfo, region.width)
    lines.push(entry.color(inner))
  }

  return lines
}

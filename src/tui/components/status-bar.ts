import cliTruncate from "cli-truncate"
import { theme, box } from "../../cli/theme"
import type { Region } from "../layout"
import type { AppState } from "../store"

export function renderStatusBar(state: AppState, region: Region): string {
  const m = state.metrics
  const parts = [
    theme.accent(box.bullet) + theme.muted(` MEM:${m.memPercent}%`),
    theme.info(box.bullet) + theme.muted(` CPU:${m.cpuPercent}%`),
    theme.muted(`SESS:${m.sessionCount}`),
    theme.muted(`UP:${formatUptime(m.uptime)}`),
  ]
  const line = parts.join(theme.muted(` ${box.dot} `))
  // ╰─ ● MEM:0% · ● CPU:0% · SESS:0 · UP:0m ─────────────────────╯
  const fillWidth = Math.max(0, region.width - line.length - 5)
  return theme.muted(box.bl + box.h + " ") + line + theme.muted(" " + box.h.repeat(fillWidth) + box.br)
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

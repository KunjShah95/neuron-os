import cliTruncate from "cli-truncate"
import { theme, box } from "../../cli/theme"
import type { Region } from "../layout"
import type { AppState } from "../store"

const typeColor: Record<string, (s: string) => string> = {
  info: theme.muted,
  success: theme.success,
  warn: theme.warn,
  error: theme.error,
  event: theme.info,
}

const typeIndicator: Record<string, string> = {
  info: box.dot,
  success: box.check,
  warn: "!",
  error: box.cross,
  event: box.arrow,
}

export function renderActivityLog(state: AppState, region: Region): string[] {
  const lines: string[] = []

  // Heading
  lines.push(theme.heading(cliTruncate(" ACTIVITY LOG", region.width)))

  if (region.height <= 1) return lines

  const scroll = state.ui.logScroll
  const visible = region.height - 1
  const start = Math.max(0, state.log.length - visible - scroll)
  const end = Math.min(state.log.length, start + visible)

  for (let i = start; i < end; i++) {
    const entry = state.log[i]
    if (!entry) continue
    const color = typeColor[entry.type] ?? theme.muted
    const indicator = typeIndicator[entry.type] ?? box.dot
    const text = cliTruncate(` ${indicator} ${entry.timestamp} ${entry.text}`, region.width)
    lines.push(color(text))
  }

  // Fill remaining space
  while (lines.length < region.height) {
    lines.push("")
  }

  return lines
}

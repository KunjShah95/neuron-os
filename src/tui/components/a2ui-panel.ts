/**
 * A2UI panel — renders agent-emitted widgets in the TUI dashboard.
 *
 * Connected to the A2uiManager singleton to receive real-time widget events.
 * Displays widgets grouped by scope, with a configurable max visible widgets.
 */

import cliTruncate from "cli-truncate"
import { theme } from "../../cli/theme"
import type { Region } from "../layout"
import type { AppState } from "../store"
import { a2uiManager, renderA2uiWidget } from "../../tools/a2ui"

const WIDGET_TITLE_COLORS: Record<string, (s: string) => string> = {
  status_card: theme.success,
  task_list: theme.info,
  progress_bar: theme.warn,
  action_button: theme.accent,
  log_viewer: theme.muted,
  metric_chart: theme.info,
  panel: theme.heading,
  grid: theme.heading,
}

export function renderA2uiPanel(_state: AppState, region: Region): string[] {
  const lines: string[] = []

  // Heading
  lines.push(theme.heading(cliTruncate(" A2UI WIDGETS", region.width)))

  if (region.height <= 1) return lines

  const scopes = a2uiManager.getScopes()
  if (scopes.length === 0) {
    const emptyMsg = cliTruncate(" No A2UI widgets yet", region.width)
    lines.push(theme.muted(emptyMsg))
    while (lines.length < region.height) lines.push("")
    return lines
  }

  const visibleHeight = region.height - 1 // minus heading
  let linesRendered = 0

  // Show up to 3 scopes with their first few widgets
  const displayScopes = scopes.slice(0, 3)

  for (const scope of displayScopes) {
    if (linesRendered >= visibleHeight) break

    const scopeWidgets = a2uiManager.getScopeWidgets(scope).slice(0, 5) // max 5 widgets per scope

    // Scope header
    const scopePreview = cliTruncate(` ${theme.muted(scope)}`, region.width)
    lines.push(scopePreview)
    linesRendered++

    for (const widget of scopeWidgets) {
      if (linesRendered >= visibleHeight) break

      const widgetLines = renderA2uiWidget(widget, true)
      const color = WIDGET_TITLE_COLORS[widget.type] ?? theme.muted

      for (const wl of widgetLines) {
        if (linesRendered >= visibleHeight) break
        const truncated = cliTruncate(color(wl), region.width)
        lines.push(truncated)
        linesRendered++
      }
    }

    // Add blank line between scopes
    if (linesRendered < visibleHeight) {
      lines.push("")
      linesRendered++
    }
  }

  // Fill remaining space
  while (lines.length < region.height) {
    lines.push("")
  }

  return lines
}

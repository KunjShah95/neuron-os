import cliTruncate from "cli-truncate"
import { theme } from "../../cli/theme"
import type { Region } from "../layout"
import type { AppState } from "../store"

export function renderProviders(state: AppState, region: Region): string[] {
  const lines: string[] = []
  lines.push(theme.heading(cliTruncate(" PROVIDERS", region.width)))

  const list: string[] = state.providers ?? []
  if (list.length === 0) {
    lines.push(theme.muted(cliTruncate(" No providers registered", region.width)))
    return lines
  }
  const idx = state.providerIndex ?? 0
  for (let i = 0; i < list.length; i++) {
    const name = list[i]
    const prefix = i === idx ? "> " : "  "
    const line = `${prefix}${name}`
    lines.push(i === idx ? theme.success(cliTruncate(line, region.width)) : cliTruncate(line, region.width))
  }

  lines.push("")
  lines.push(theme.muted(cliTruncate("Enter to set provider, Tab to cycle focus", region.width)))
  return lines
}

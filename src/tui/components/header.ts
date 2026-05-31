import cliTruncate from "cli-truncate"
import { theme, box } from "../../cli/theme"
import type { Region } from "../layout"

export function renderHeader(region: Region): string {
  const title = " AEGIS DASHBOARD "
  const version = "v0.1.0  Ctrl+Q Quit  "
  const dots = Math.max(0, region.width - title.length - version.length - 4)
  const left = box.tl + box.h + " "
  const right = box.h.repeat(dots) + " " + version + box.tr
  // ╭─ AEGIS DASHBOARD ──────────────────── Ctrl+Q Quit ╮
  const line = theme.muted(left) + theme.heading(title.trim()) + theme.muted(" " + right)
  return cliTruncate(line, region.width)
}

import cliTruncate from "cli-truncate"
import { theme, box } from "../../cli/theme"
import type { ChatRegion } from "../layout"

export function renderChatHeader(region: ChatRegion): string {
  const title = " AEGIS CHAT "
  const hint = "Ctrl+Q Quit  "
  const dots = Math.max(0, region.width - title.length - hint.length - 4)
  const left = box.tl + box.h + " "
  const right = box.h.repeat(dots) + " " + hint + box.tr
  // ╭─ AEGIS CHAT ──────────────────────── Ctrl+Q Quit ╮
  const line = theme.muted(left) + theme.heading(title.trim()) + theme.muted(" " + right)
  return cliTruncate(line, region.width)
}

import cliTruncate from "cli-truncate"
import { theme, box } from "../../cli/theme"
import type { ChatRegion } from "../layout"
import type { ChatState } from "../store"
import { wrapText } from "../utils"

export function renderMessages(state: ChatState, region: ChatRegion): string[] {
  const lines: string[] = []

  if (region.height <= 0) return lines

  // Build rendered lines from messages
  const renderedLines: string[] = []

  for (let i = 0; i < state.messages.length; i++) {
    const msg = state.messages[i]
    if (!msg) continue
    const isLast = i === state.messages.length - 1

    // Header for each message
    if (msg.role === "user") {
      renderedLines.push(theme.info(` ${box.arrow} ${theme.text(`You (${msg.timestamp})`)}`))
    } else if (msg.role === "assistant") {
      const label = msg.status === "streaming" ? "Aegis (streaming...)" : `Aegis (${msg.timestamp})`
      renderedLines.push(theme.accent(` ${box.arrow} ${theme.text(label)}`))
    } else {
      renderedLines.push(theme.muted(` ${box.dot} System (${msg.timestamp})`))
    }

    // Message content with word wrap
    const contentWidth = region.width - 4
    if (contentWidth > 0 && msg.content) {
      const wrapped = wrapText(msg.content, contentWidth)
      for (const wLine of wrapped) {
        const padded = `  ${wLine}`
        renderedLines.push(cliTruncate(padded, region.width))
      }
    }

    // Subtle divider between messages
    if (!isLast || msg.status === "complete") {
      renderedLines.push("")
    }
  }

  // Compute scroll offset
  const totalLines = renderedLines.length
  const scrollOffset = state.ui.scrolledUp
    ? Math.min(state.ui.scrollOffset, Math.max(0, totalLines - region.height))
    : 0

  // Calculate visible slice
  const start = Math.max(0, totalLines - region.height - scrollOffset)
  const end = Math.min(totalLines, start + region.height)

  for (let i = start; i < end; i++) {
    lines.push(renderedLines[i] ?? "")
  }

  // Fill remaining space
  while (lines.length < region.height) {
    lines.push("")
  }

  // If scrolled up and new content, show indicator
  if (state.ui.scrolledUp && state.ui.isStreaming) {
    const indicator = theme.warn(` \u25BC New content arriving...`)
    lines[region.height - 1] = cliTruncate(indicator, region.width)
  }

  return lines
}

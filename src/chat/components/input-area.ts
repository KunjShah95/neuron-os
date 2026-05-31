import cliTruncate from "cli-truncate"
import { theme, box } from "../../cli/theme"
import type { ChatRegion } from "../layout"
import type { ChatState } from "../store"

export function renderInputArea(state: ChatState, region: ChatRegion): string[] {
  const lines: string[] = []
  const input = state.ui.input
  const inputLines = input.split("\n")
  const cursorBlink = state.dirty ? "\u2588" : " "

  for (let i = 0; i < region.height; i++) {
    const prompt = i === 0 ? theme.accent(`${box.v} `) : theme.muted(`${box.v} `)
    const lineText = inputLines[i] ?? ""
    let textLine: string

    if (state.ui.cursorRow === i) {
      // This line has the cursor
      const before = lineText.slice(0, state.ui.cursorCol)
      const after = lineText.slice(state.ui.cursorCol)
      textLine = before + cursorBlink + after
    } else {
      textLine = lineText
    }

    const full = prompt + textLine
    lines.push(cliTruncate(full, region.width))
  }

  return lines
}

export function renderChatHint(state: ChatState, region: ChatRegion): string {
  if (state.ui.isStreaming) {
    return theme.muted(cliTruncate(` ${box.dot} Streaming... Esc to cancel`, region.width))
  }
  return theme.muted(cliTruncate(` ${box.dot} Enter send | Alt+Enter newline | ${box.arrow}${box.arrow} history | /provider /sessions /clear`, region.width))
}

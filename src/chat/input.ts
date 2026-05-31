import type { ChatState } from "./store"

export type ChatKeyEvent =
  | { type: "char"; char: string }
  | { type: "up" }
  | { type: "down" }
  | { type: "left" }
  | { type: "right" }
  | { type: "enter" }
  | { type: "alt_enter" }
  | { type: "escape" }
  | { type: "ctrl_q" }
  | { type: "ctrl_c" }
  | { type: "ctrl_l" }
  | { type: "toggle_picker" }
  | { type: "backspace" }
  | { type: "delete" }
  | { type: "home" }
  | { type: "end" }
  | { type: "page_up" }
  | { type: "page_down" }
  | { type: "toggle_picker" }
  | { type: "unknown"; raw: string }

export function parseChatKey(raw: string): ChatKeyEvent {
  // Escape sequences (ANSI)
  if (raw === "\x1b[A") return { type: "up" }
  if (raw === "\x1b[B") return { type: "down" }
  if (raw === "\x1b[C") return { type: "right" }
  if (raw === "\x1b[D") return { type: "left" }
  if (raw === "\x1b[5~") return { type: "page_up" }
  if (raw === "\x1b[6~") return { type: "page_down" }
  if (raw === "\x1b[H") return { type: "home" }
  if (raw === "\x1b[F") return { type: "end" }
  if (raw === "\x1b[3~") return { type: "delete" }
  if (raw === "\x1b") return { type: "escape" }

  // Ctrl sequences
  if (raw === "\x11") return { type: "ctrl_q" }
  if (raw === "\x10") return { type: "toggle_picker" }
  if (raw === "\x0c") return { type: "ctrl_l" }
  if (raw === "\x03") return { type: "ctrl_c" }
  if (raw === "\x10") return { type: "toggle_picker" }

  // Alt+Enter (legacy escape sequence and modern CSI u format)
  if (raw === "\x1b\x0a" || raw === "\x1b\r" || raw === "\x1b[13;3u") return { type: "alt_enter" }

  // Enter
  if (raw === "\r" || raw === "\n") return { type: "enter" }
  if (raw === "\t") return { type: "char", char: "\t" }
  if (raw === "\x7f" || raw === "\b") return { type: "backspace" }

  // Printable character
  if (raw.length === 1 && raw.charCodeAt(0) >= 32) {
    return { type: "char", char: raw }
  }

  return { type: "unknown", raw }
}

export type ChatActionResult = "continue" | "quit" | "send" | "newline" | "cancel_stream"

export function handleChatKey(state: ChatState, key: ChatKeyEvent): ChatActionResult {
  const ui = state.ui

  switch (key.type) {
    case "ctrl_q":
    case "ctrl_c":
      return "quit"

    case "escape":
      if (ui.isStreaming) {
        return "cancel_stream"
      }
      // Clear input if non-empty
      if (ui.input.length > 0) {
        ui.input = ""
        ui.cursorCol = 0
        ui.cursorRow = 0
        ui.inputLines = 1
        state.dirty = true
      }
      return "continue"

    case "enter":
      if (!ui.isStreaming && ui.input.trim()) {
        return "send"
      }
      return "continue"

    case "alt_enter":
      insertChar(state, "\n")
      return "newline"

    case "up":
      if (ui.input.includes("\n") && ui.cursorRow > 0) {
        moveCursorUp(state)
      } else if (!ui.isStreaming) {
        // History recall
        if (ui.history.length > 0 && ui.historyIndex < ui.history.length - 1) {
          ui.historyIndex++
          ui.input = ui.history[ui.history.length - 1 - ui.historyIndex] ?? ""
          ui.cursorCol = ui.input.length
          ui.cursorRow = countLines(ui.input) - 1
          updateInputLines(state)
        }
      }
      state.dirty = true
      return "continue"

    case "down":
      if (ui.input.includes("\n") && cursorCanMoveDown(state)) {
        moveCursorDown(state)
      } else if (!ui.isStreaming) {
        if (ui.historyIndex > 0) {
          ui.historyIndex--
          ui.input = ui.history[ui.history.length - 1 - ui.historyIndex] ?? ""
          ui.cursorCol = ui.input.length
          ui.cursorRow = countLines(ui.input) - 1
          updateInputLines(state)
        } else if (ui.historyIndex === 0) {
          ui.historyIndex = -1
          ui.input = ""
          ui.cursorCol = 0
          ui.cursorRow = 0
          updateInputLines(state)
        }
      }
      state.dirty = true
      return "continue"

    case "left":
      if (ui.cursorCol > 0) {
        ui.cursorCol--
        state.dirty = true
      } else if (ui.cursorRow > 0) {
        ui.cursorRow--
        const lines = ui.input.split("\n")
        ui.cursorCol = (lines[ui.cursorRow] ?? "").length
        state.dirty = true
      }
      return "continue"

    case "right": {
      const lines = ui.input.split("\n")
      const currentLine = lines[ui.cursorRow] ?? ""
      if (ui.cursorCol < currentLine.length) {
        ui.cursorCol++
        state.dirty = true
      } else if (ui.cursorRow < lines.length - 1) {
        ui.cursorRow++
        ui.cursorCol = 0
        state.dirty = true
      }
      return "continue"
    }

    case "home":
      ui.cursorCol = 0
      state.dirty = true
      return "continue"

    case "end": {
      const lines = ui.input.split("\n")
      const currentLine = lines[ui.cursorRow] ?? ""
      ui.cursorCol = currentLine.length
      state.dirty = true
      return "continue"
    }

    case "page_up":
      ui.scrollOffset += Math.max(1, Math.floor(state.messages.length / 3))
      ui.scrolledUp = true
      state.dirty = true
      return "continue"

    case "page_down":
      if (ui.scrolledUp) {
        ui.scrollOffset = Math.max(0, ui.scrollOffset - Math.max(1, Math.floor(state.messages.length / 3)))
        if (ui.scrollOffset === 0) {
          ui.scrolledUp = false
        }
        state.dirty = true
      }
      return "continue"

    case "backspace":
      if (ui.input.length > 0 && (ui.cursorCol > 0 || ui.cursorRow > 0)) {
        deleteBeforeCursor(state)
        state.dirty = true
      }
      return "continue"

    case "char":
      if (!ui.isStreaming) {
        insertChar(state, key.char)
        state.dirty = true
      }
      return "continue"

    default:
      return "continue"
  }
}

// --- Input manipulation helpers ---

function insertChar(state: ChatState, ch: string) {
  const ui = state.ui
  const lines = ui.input.split("\n")
  const line = lines[ui.cursorRow] ?? ""
  const before = line.slice(0, ui.cursorCol)
  const after = line.slice(ui.cursorCol)
  lines[ui.cursorRow] = before + ch + after
  ui.input = lines.join("\n")

  if (ch === "\n") {
    ui.cursorRow++
    ui.cursorCol = 0
  } else {
    ui.cursorCol += ch.length
  }
  updateInputLines(state)
}

function deleteBeforeCursor(state: ChatState) {
  const ui = state.ui
  const lines = ui.input.split("\n")
  const line = lines[ui.cursorRow] ?? ""

  if (ui.cursorCol > 0) {
    const before = line.slice(0, ui.cursorCol - 1)
    const after = line.slice(ui.cursorCol)
    lines[ui.cursorRow] = before + after
    ui.input = lines.join("\n")
    ui.cursorCol--
  } else if (ui.cursorRow > 0) {
    const prevLine = lines[ui.cursorRow - 1] ?? ""
    ui.cursorCol = prevLine.length
    lines[ui.cursorRow - 1] = prevLine + line
    lines.splice(ui.cursorRow, 1)
    ui.input = lines.join("\n")
    ui.cursorRow--
  }
  updateInputLines(state)
}

function moveCursorUp(state: ChatState) {
  const ui = state.ui
  if (ui.cursorRow <= 0) return
  const lines = ui.input.split("\n")
  ui.cursorRow--
  const prevLine = lines[ui.cursorRow] ?? ""
  ui.cursorCol = Math.min(ui.cursorCol, prevLine.length)
  state.dirty = true
}

function moveCursorDown(state: ChatState) {
  const ui = state.ui
  const lines = ui.input.split("\n")
  if (ui.cursorRow >= lines.length - 1) return
  ui.cursorRow++
  const nextLine = lines[ui.cursorRow] ?? ""
  ui.cursorCol = Math.min(ui.cursorCol, nextLine.length)
  state.dirty = true
}

function cursorCanMoveDown(state: ChatState): boolean {
  const ui = state.ui
  const lines = ui.input.split("\n")
  return ui.cursorRow < lines.length - 1
}

function countLines(text: string): number {
  if (!text) return 1
  return text.split("\n").length
}

function updateInputLines(state: ChatState) {
  state.ui.inputLines = countLines(state.ui.input)
}

import { describe, it, expect } from "bun:test"
/**
 * Unit tests for the Chat TUI module.
 *
 * Tests layout calculation, header rendering, store state mutations,
 * text wrapping, message rendering, input area, chat hints, key parsing,
 * input handling, and the model picker component.
 */

import { calculateChatLayout } from "./layout"
import type { ChatRegion } from "./layout"
import { wrapText } from "./utils"
import {
  createInitialChatState,
  addUserMessage,
  addAssistantMessage,
  appendToStreamingMessage,
  finalizeStreamingMessage,
  setStreamingError,
} from "./store"
import type { PickerItem } from "./store"
import { parseChatKey, handleChatKey } from "./input"
import type { ChatKeyEvent } from "./input"
import { renderChatHeader } from "./components/header"
import { renderMessages } from "./components/messages"
import { renderInputArea, renderChatHint } from "./components/input-area"
import { renderPicker } from "./components/picker"

function stripAnsi(s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, "")
}

function checkKey(raw: string, expected: ChatKeyEvent["type"], _label: string) {
  const result = parseChatKey(raw)
  expect(result.type).toBe(expected)
}

describe("Chat Tests", () => {
  // ══════════════════════════════════════════════════════════════════
  //  1. Chat Layout
  // ══════════════════════════════════════════════════════════════════

  it("should calculate layout for 80x24 terminal", () => {
    const layout80x24 = calculateChatLayout(24, 80, 1)
    expect(layout80x24.header.height).toBe(1)
    expect(layout80x24.header.y).toBe(0)
    expect(layout80x24.header.width).toBe(80)
    expect(layout80x24.messages.height > 0).toBe(true)
    expect(layout80x24.messages.y).toBe(1)
    expect(layout80x24.messages.width).toBe(80)
    expect(layout80x24.input.height).toBe(1)
    expect(layout80x24.input.width).toBe(80)
    expect(layout80x24.hint.height).toBe(1)
    expect(layout80x24.hint.y).toBe(layout80x24.input.y + 1)

    const totalHeight =
      layout80x24.header.height + layout80x24.messages.height + layout80x24.input.height + layout80x24.hint.height
    expect(totalHeight).toBe(24)
  })

  it("should degrade gracefully on small terminal 40x10", () => {
    const layout40x10 = calculateChatLayout(10, 40, 1)
    expect(layout40x10.messages.height >= 1).toBe(true)
    expect(layout40x10.input.height >= 1).toBe(true)
    expect(layout40x10.header.height === 1).toBe(true)
    expect(
      layout40x10.header.height + layout40x10.messages.height + layout40x10.input.height + layout40x10.hint.height,
    ).toBe(10)
  })

  it("should grow input area for multiline input", () => {
    const layoutMultiline = calculateChatLayout(24, 80, 5)
    expect(layoutMultiline.input.height).toBe(5)
    expect(layoutMultiline.messages.height).toBe(24 - 1 - 5 - 1)
  })

  it("should cap multiline input at 8 lines", () => {
    const layoutCapped = calculateChatLayout(24, 80, 99)
    expect(layoutCapped.input.height).toBe(8)
    expect(layoutCapped.messages.height >= 1).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  2. Chat Header
  // ══════════════════════════════════════════════════════════════════

  it("should render header with correct format", () => {
    const headerRegion: ChatRegion = { x: 0, y: 0, width: 80, height: 1 }
    const headerText = renderChatHeader(headerRegion)
    const headerPlain = stripAnsi(headerText)
    expect(headerPlain.startsWith("\u256d")).toBe(true)
    expect(headerPlain.endsWith("\u256e")).toBe(true)
    expect(headerPlain.includes("AEGIS CHAT")).toBe(true)
    expect(headerPlain.includes("Ctrl+Q")).toBe(true)
    expect(headerPlain.length).toBe(80)
  })

  it("should render narrow header", () => {
    const narrowHeaderRegion: ChatRegion = { x: 0, y: 0, width: 20, height: 1 }
    const narrowHeader = renderChatHeader(narrowHeaderRegion)
    expect(stripAnsi(narrowHeader).length <= 20).toBe(true)
    expect(stripAnsi(narrowHeader).startsWith("\u256d")).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  3. Chat Store State Mutations
  // ══════════════════════════════════════════════════════════════════

  it("should create initial chat state", () => {
    const state = createInitialChatState()
    expect(state.messages.length).toBe(1)
    expect(state.messages[0]?.role).toBe("assistant")
    expect(state.messages[0]?.status).toBe("complete")
    expect(!state.ui.isStreaming).toBe(true)
    expect(state.ui.input).toBe("")
    expect(state.ui.history.length).toBe(0)
    expect(state.dirty).toBe(true)
  })

  it("should add user message and update history", () => {
    const state = createInitialChatState()
    addUserMessage(state, "Hello!")
    expect(state.messages.length).toBe(2)
    expect(state.messages[1]?.role).toBe("user")
    expect(state.messages[1]?.content).toBe("Hello!")
    expect(state.ui.input).toBe("")
    expect(state.ui.history.length).toBe(1)
    expect(state.ui.history[0]).toBe("Hello!")
  })

  it("should add assistant streaming message", () => {
    const state = createInitialChatState()
    addUserMessage(state, "Hi")
    addAssistantMessage(state)
    expect(state.messages.length).toBe(3)
    expect(state.messages[2]?.role).toBe("assistant")
    expect(state.messages[2]?.status).toBe("streaming")
    expect(state.ui.isStreaming).toBe(true)
  })

  it("should append streaming content", () => {
    const state = createInitialChatState()
    addUserMessage(state, "Hi")
    addAssistantMessage(state)
    appendToStreamingMessage(state, "Hello ")
    appendToStreamingMessage(state, "there!")
    expect(state.messages[2]?.content).toBe("Hello there!")
    expect(state.dirty).toBe(true)
  })

  it("should finalize streaming message", () => {
    const state = createInitialChatState()
    addUserMessage(state, "Hi")
    addAssistantMessage(state)
    appendToStreamingMessage(state, "Done")
    finalizeStreamingMessage(state)
    expect(state.messages[2]?.status).toBe("complete")
    expect(!state.ui.isStreaming).toBe(true)
  })

  it("should handle streaming error", () => {
    const state = createInitialChatState()
    addUserMessage(state, "Hi")
    addAssistantMessage(state)
    setStreamingError(state, "API error 500")
    // setStreamingError sets error on the last streaming message (index 2)
    expect(state.messages[2]?.status).toBe("error")
    expect(!state.ui.isStreaming).toBe(true)
  })

  it("should cap history at 100 entries", () => {
    const state = createInitialChatState()
    for (let i = 0; i < 105; i++) {
      addUserMessage(state, `msg-${i}`)
    }
    expect(state.ui.history.length <= 100).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  4. wrapText Utility
  // ══════════════════════════════════════════════════════════════════

  it("should handle edge cases", () => {
    expect(wrapText("", 10).length).toBe(1)
    expect(wrapText("hello", 0).length).toBe(0)
    expect(wrapText("hello", -1).length).toBe(0)
  })

  it("should return single word on one line", () => {
    const result = wrapText("hello", 10)
    expect(result.length).toBe(1)
    expect(result[0]).toBe("hello")
  })

  it("should keep multiple words on one line when they fit", () => {
    const result = wrapText("hello world", 20)
    expect(result.length).toBe(1)
  })

  it("should wrap words exceeding max width", () => {
    const result = wrapText("hello world foo bar baz", 10)
    expect(result.length >= 2).toBe(true)
    for (const line of result) {
      expect(line.length <= 10).toBe(true)
    }
  })

  it("should preserve existing newlines", () => {
    const result = wrapText("hello\nworld", 80)
    expect(result.length).toBe(2)
    expect(result[0]).toBe("hello")
    expect(result[1]).toBe("world")
  })

  it("should preserve empty lines", () => {
    const result = wrapText("hello\n\nworld", 80)
    expect(result.length).toBe(3)
    expect(result[1]).toBe("")
  })

  it("should handle long single word exceeding max width", () => {
    const result = wrapText("superlongwordthatexceedsmaxwidth", 10)
    expect(result.length >= 1).toBe(true)
  })

  it("should trim leading and trailing whitespace", () => {
    const result = wrapText("  hello world  ", 80)
    expect(result.length).toBe(1)
    expect(result[1]).toBe(undefined)
  })

  // ══════════════════════════════════════════════════════════════════
  //  5. Messages Component Rendering
  // ══════════════════════════════════════════════════════════════════

  it("should render messages for fresh state", () => {
    const freshState = createInitialChatState()
    const msgRegion: ChatRegion = { x: 0, y: 1, width: 80, height: 10 }
    const msgLines = renderMessages(freshState, msgRegion)
    expect(msgLines.length).toBe(10)
    expect(stripAnsi(msgLines[0]!).includes("Aegis")).toBe(true)
    expect(msgLines.some((l) => stripAnsi(l).trim() !== "")).toBe(true)
  })

  it("should render user and assistant messages", () => {
    const state = createInitialChatState()
    addUserMessage(state, "Write a function")
    addAssistantMessage(state)
    appendToStreamingMessage(state, "Here's a function:")
    const msgLines2 = renderMessages(state, { x: 0, y: 1, width: 80, height: 15 })
    expect(stripAnsi(msgLines2.join("")).includes("You")).toBe(true)
    expect(stripAnsi(msgLines2.join("")).includes("Write a function")).toBe(true)
    expect(stripAnsi(msgLines2.join("")).includes("Here")).toBe(true)
  })

  it("should show streaming indicator", () => {
    const state = createInitialChatState()
    addUserMessage(state, "Write a function")
    addAssistantMessage(state)
    appendToStreamingMessage(state, "Here's a function:")
    const msgLines2 = renderMessages(state, { x: 0, y: 1, width: 80, height: 15 })
    expect(
      stripAnsi(msgLines2.join("")).includes("streaming") || stripAnsi(msgLines2.join("")).includes("Streaming"),
    ).toBe(true)
  })

  it("should render narrow message region", () => {
    const freshState = createInitialChatState()
    const narrowMsgRegion: ChatRegion = { x: 0, y: 1, width: 10, height: 5 }
    const narrowMsgLines = renderMessages(freshState, narrowMsgRegion)
    expect(narrowMsgLines.length).toBe(5)
    expect(stripAnsi(narrowMsgLines[0]!).length <= 10).toBe(true)
  })

  it("should render zero-height region as empty", () => {
    const freshState = createInitialChatState()
    const emptyLines = renderMessages(freshState, { x: 0, y: 0, width: 80, height: 0 })
    expect(emptyLines.length).toBe(0)
  })

  // ══════════════════════════════════════════════════════════════════
  //  6. Input Area Component Rendering
  // ══════════════════════════════════════════════════════════════════

  it("should render empty input area", () => {
    const inputState = createInitialChatState()
    const inputRegion: ChatRegion = { x: 0, y: 22, width: 80, height: 1 }
    const inputLines = renderInputArea(inputState, inputRegion)
    expect(inputLines.length).toBe(1)
    expect(stripAnsi(inputLines[0]!).includes("\u2502")).toBe(true)
  })

  it("should render input area with content", () => {
    const inputState = createInitialChatState()
    inputState.ui.input = "test input"
    const inputLines2 = renderInputArea(inputState, { x: 0, y: 22, width: 80, height: 1 })
    expect(stripAnsi(inputLines2[0]!).includes("test")).toBe(true)
    expect(stripAnsi(inputLines2[0]!).includes("input")).toBe(true)
  })

  it("should render multiline input", () => {
    const multilineState = createInitialChatState()
    multilineState.ui.input = "line 1\nline 2\nline 3"
    multilineState.ui.inputLines = 3
    multilineState.ui.cursorRow = 2
    multilineState.ui.cursorCol = 3
    const mlRegion: ChatRegion = { x: 0, y: 20, width: 80, height: 3 }
    const mlLines = renderInputArea(multilineState, mlRegion)
    expect(mlLines.length).toBe(3)
    expect(stripAnsi(mlLines[0]!).includes("line 1")).toBe(true)
  })

  it("should truncate long input in narrow region", () => {
    const inputState = createInitialChatState()
    inputState.ui.input = "very long input text"
    const narrowInputRegion: ChatRegion = { x: 0, y: 22, width: 10, height: 1 }
    const narrowInputLines = renderInputArea(inputState, narrowInputRegion)
    expect(stripAnsi(narrowInputLines[0]!).length <= 10).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  7. Chat Hint Rendering
  // ══════════════════════════════════════════════════════════════════

  it("should render idle hint", () => {
    const hintState = createInitialChatState()
    const hintRegion: ChatRegion = { x: 0, y: 23, width: 80, height: 1 }
    const idleHint = renderChatHint(hintState, hintRegion)
    const idleHintPlain = stripAnsi(idleHint)
    expect(idleHintPlain.includes("Enter")).toBe(true)
    expect(idleHintPlain.includes("Alt+Enter")).toBe(true)
    expect(!idleHintPlain.includes("Streaming")).toBe(true)
    expect(idleHintPlain.length <= 80).toBe(true)
  })

  it("should render streaming hint", () => {
    const hintState = createInitialChatState()
    hintState.ui.isStreaming = true
    const hintRegion: ChatRegion = { x: 0, y: 23, width: 80, height: 1 }
    const streamingHint = renderChatHint(hintState, hintRegion)
    const streamingHintPlain = stripAnsi(streamingHint)
    expect(streamingHintPlain.includes("Streaming")).toBe(true)
    expect(streamingHintPlain.includes("Esc")).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  8. Input Parsing
  // ══════════════════════════════════════════════════════════════════

  it("should parse arrow keys", () => {
    checkKey("\x1b[A", "up", "↑ arrow")
    checkKey("\x1b[B", "down", "↓ arrow")
    checkKey("\x1b[C", "right", "→ arrow")
    checkKey("\x1b[D", "left", "← arrow")
  })

  it("should parse navigation keys", () => {
    checkKey("\x1b[5~", "page_up", "Page Up")
    checkKey("\x1b[6~", "page_down", "Page Down")
    checkKey("\x1b[H", "home", "Home")
    checkKey("\x1b[F", "end", "End")
    checkKey("\x1b[3~", "delete", "Delete")
  })

  it("should parse control keys", () => {
    checkKey("\x1b", "escape", "Escape")
    checkKey("\x11", "ctrl_q", "Ctrl+Q")
    checkKey("\x03", "ctrl_c", "Ctrl+C")
    checkKey("\x0c", "ctrl_l", "Ctrl+L")
  })

  it("should parse enter and alt-enter", () => {
    checkKey("\r", "enter", "Enter")
    checkKey("\n", "enter", "Newline as Enter")
    checkKey("\x1b\r", "alt_enter", "Alt+Enter (\x1b\\r)")
    checkKey("\x1b[13;3u", "alt_enter", "Alt+Enter (CSI u)")
  })

  it("should parse backspace and printable chars", () => {
    checkKey("\x7f", "backspace", "Backspace")
    checkKey("a", "char", "Printable char 'a'")
    checkKey("Z", "char", "Printable char 'Z'")
    checkKey(" ", "char", "Space character")
    checkKey("\x01", "unknown", "Unmapped ctrl-a")
  })

  // ══════════════════════════════════════════════════════════════════
  //  9. Chat Input Handling
  // ══════════════════════════════════════════════════════════════════

  it("should handle basic text entry", () => {
    const state = createInitialChatState()
    expect(handleChatKey(state, { type: "char", char: "h" })).toBe("continue")
    expect(state.ui.input).toBe("h")
    expect(state.ui.cursorCol).toBe(1)

    handleChatKey(state, { type: "char", char: "i" })
    expect(state.ui.input).toBe("hi")
  })

  it("should handle backspace", () => {
    const state = createInitialChatState()
    state.ui.input = "hi"
    state.ui.cursorCol = 2
    handleChatKey(state, { type: "backspace" })
    expect(state.ui.input).toBe("h")
    expect(state.ui.cursorCol).toBe(1)
  })

  it("should send on enter with non-empty input", () => {
    const state = createInitialChatState()
    state.ui.input = "hello"
    expect(handleChatKey(state, { type: "enter" })).toBe("send")
  })

  it("should continue on enter with empty input", () => {
    const state = createInitialChatState()
    state.ui.input = ""
    expect(handleChatKey(state, { type: "enter" })).toBe("continue")
  })

  it("should quit on ctrl+q and ctrl+c", () => {
    const state = createInitialChatState()
    expect(handleChatKey(state, { type: "ctrl_q" })).toBe("quit")
    expect(handleChatKey(state, { type: "ctrl_c" })).toBe("quit")
  })

  it("should clear input on escape during idle", () => {
    const state = createInitialChatState()
    state.ui.input = "something"
    expect(handleChatKey(state, { type: "escape" })).toBe("continue")
    expect(state.ui.input).toBe("")
  })

  it("should cancel stream on escape during streaming", () => {
    const state = createInitialChatState()
    state.ui.isStreaming = true
    expect(handleChatKey(state, { type: "escape" })).toBe("cancel_stream")
  })

  it("should handle cursor movement", () => {
    const state = createInitialChatState()
    state.ui.input = "hello world"
    state.ui.cursorCol = 5
    state.ui.cursorRow = 0

    handleChatKey(state, { type: "left" })
    expect(state.ui.cursorCol).toBe(4)
    handleChatKey(state, { type: "right" })
    expect(state.ui.cursorCol).toBe(5)
    handleChatKey(state, { type: "home" })
    expect(state.ui.cursorCol).toBe(0)
    handleChatKey(state, { type: "end" })
    expect(state.ui.cursorCol).toBe("hello world".length)
  })

  it("should recall history on up/down arrows", () => {
    const state = createInitialChatState()
    state.ui.history = ["first", "second", "third"]
    state.ui.historyIndex = -1

    handleChatKey(state, { type: "up" })
    expect(state.ui.input).toBe("third")
    expect(state.ui.historyIndex).toBe(0)

    handleChatKey(state, { type: "up" })
    expect(state.ui.input).toBe("second")
    expect(state.ui.historyIndex).toBe(1)

    handleChatKey(state, { type: "down" })
    expect(state.ui.input).toBe("third")

    handleChatKey(state, { type: "down" })
    expect(state.ui.input).toBe("")
    expect(state.ui.historyIndex).toBe(-1)
  })

  it("should insert tab character", () => {
    const state = createInitialChatState()
    handleChatKey(state, { type: "char", char: "\t" })
    expect(state.ui.input).toBe("\t")
  })

  it("should block typing during streaming", () => {
    const state = createInitialChatState()
    state.ui.isStreaming = true
    handleChatKey(state, { type: "char", char: "x" })
    expect(state.ui.input).toBe("")
  })

  it("should handle page up/down scrolling", () => {
    const state = createInitialChatState()
    for (let i = 0; i < 10; i++) {
      addUserMessage(state, `msg ${i}`)
      addAssistantMessage(state)
      finalizeStreamingMessage(state)
    }
    expect(state.ui.scrolledUp).toBe(false)

    handleChatKey(state, { type: "page_up" })
    expect(state.ui.scrolledUp === true).toBe(true)
    expect(state.ui.scrollOffset > 0).toBe(true)

    handleChatKey(state, { type: "page_down" })
    expect(state.ui.scrollOffset >= 0).toBe(true)
  })

  it("should handle multiline cursor up/down", () => {
    const state = createInitialChatState()
    state.ui.input = "line A\nline B\nline C"
    state.ui.cursorRow = 1
    state.ui.cursorCol = 3

    handleChatKey(state, { type: "up" })
    expect(state.ui.cursorRow).toBe(0)

    handleChatKey(state, { type: "down" })
    expect(state.ui.cursorRow).toBe(1)
  })

  it("should wrap cursor left to previous line at line start", () => {
    const state = createInitialChatState()
    state.ui.input = " line A\nline B"
    state.ui.cursorRow = 1
    state.ui.cursorCol = 0

    handleChatKey(state, { type: "left" })
    expect(state.ui.cursorRow).toBe(0)
    expect(state.ui.cursorCol).toBe(7)
  })

  it("should wrap cursor right to next line at line end", () => {
    const state = createInitialChatState()
    state.ui.input = "line A\nline B"
    state.ui.cursorRow = 0
    state.ui.cursorCol = 6

    handleChatKey(state, { type: "right" })
    expect(state.ui.cursorRow).toBe(1)
    expect(state.ui.cursorCol).toBe(0)
  })

  it("should handle delete key", () => {
    const state = createInitialChatState()
    state.ui.input = "hello"
    expect(handleChatKey(state, { type: "delete" })).toBe("continue")
  })

  // ══════════════════════════════════════════════════════════════════
  //  10. Model Picker
  // ══════════════════════════════════════════════════════════════════

  it("should render picker with items", () => {
    const pItems: PickerItem[] = [
      { kind: "provider", name: "anthropic", active: true },
      { kind: "model", provider: "anthropic", id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { kind: "model", provider: "anthropic", id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
      { kind: "provider", name: "openai", active: false },
      { kind: "model", provider: "openai", id: "gpt-4o", label: "GPT-4o" },
    ]
    const pRegion: ChatRegion = { x: 47, y: 1, width: 34, height: 10 }
    const pLines = renderPicker(pRegion, pItems, 0, "anthropic")
    expect(pLines.length === pRegion.height).toBe(true)

    const pHeader = stripAnsi(pLines[0] || "")
    expect(pHeader.includes("Models/Providers")).toBe(true)
    expect(stripAnsi(pLines[1] || "").includes(">")).toBe(true)
    expect(stripAnsi(pLines[4] || "").includes("openai")).toBe(true)
    expect(stripAnsi(pLines[5] || "").includes("GPT-4o")).toBe(true)
  })

  it("should scroll picker to selected index", () => {
    const pItems: PickerItem[] = [
      { kind: "provider", name: "anthropic", active: true },
      { kind: "model", provider: "anthropic", id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { kind: "model", provider: "anthropic", id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
      { kind: "provider", name: "openai", active: false },
      { kind: "model", provider: "openai", id: "gpt-4o", label: "GPT-4o" },
    ]
    const pRegion: ChatRegion = { x: 47, y: 1, width: 34, height: 10 }
    const pLines2 = renderPicker(pRegion, pItems, 4, "anthropic")
    expect(stripAnsi(pLines2[5] || "").includes("GPT-4o")).toBe(true)
  })

  it("should render empty picker", () => {
    const pRegion: ChatRegion = { x: 47, y: 1, width: 34, height: 10 }
    const emptyP = renderPicker(pRegion, [], 0, "anthropic")
    expect(emptyP.length === pRegion.height).toBe(true)
  })

  it("should initialize picker state correctly", () => {
    const ps = createInitialChatState()
    expect(ps.ui.showPicker === false).toBe(true)
    expect(ps.ui.pickerIndex === 0).toBe(true)
    expect(ps.ui.pickerItems.length === 0).toBe(true)
  })

  it("should include picker region in layout when picker is shown", () => {
    const lnp = calculateChatLayout(24, 80, 1)
    expect(lnp.picker === undefined).toBe(true)

    const lwp = calculateChatLayout(24, 80, 1, true)
    expect(lwp.picker !== undefined).toBe(true)
    expect(lwp.picker!.width === 34).toBe(true)
    expect(lwp.messages.width === 45).toBe(true)
  })
})

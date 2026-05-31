// ── Chat TUI Unit Tests ───────────────────────────────────────────────
// Tests all src/chat/*.ts modules without requiring a TTY.
// Style: pure assertion-based, no test framework dependency.

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
import type { ChatState, PickerItem } from "./store"
import { parseChatKey, handleChatKey } from "./input"
import type { ChatKeyEvent } from "./input"
import { renderChatHeader } from "./components/header"
import { renderMessages } from "./components/messages"
import { renderInputArea, renderChatHint } from "./components/input-area"

let passed = 0
let failed = 0

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "")
}

function assert(condition: boolean, label: string) {
  if (condition) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.error(`  ❌ ${label}`)
  }
}

function assertEqual<T>(a: T, b: T, label: string) {
  if (a === b) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.error(`  ❌ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

// ══════════════════════════════════════════════════════════════════════
//  1. Chat Layout
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Layout ===")

// Standard 80x24 terminal
const layout80x24 = calculateChatLayout(24, 80, 1)
assertEqual(layout80x24.header.height, 1, "header height = 1")
assertEqual(layout80x24.header.y, 0, "header y = 0")
assertEqual(layout80x24.header.width, 80, "header width = 80")

// Messages should fill the space between header, input, and hint
assert(layout80x24.messages.height > 0, "messages region has height > 0")
assertEqual(layout80x24.messages.y, 1, "messages y = 1")
assertEqual(layout80x24.messages.width, 80, "messages width = 80")

// Input (1 line)
assertEqual(layout80x24.input.height, 1, "input height = 1 (single line)")
assertEqual(layout80x24.input.width, 80, "input width = 80")

// Hint
assertEqual(layout80x24.hint.height, 1, "hint height = 1")
assertEqual(layout80x24.hint.y, layout80x24.input.y + 1, "hint below input")

// Sum of heights should equal rows
const totalHeight = layout80x24.header.height + layout80x24.messages.height + layout80x24.input.height + layout80x24.hint.height
assertEqual(totalHeight, 24, "all regions sum to terminal height")

// Small terminal (40x10) — graceful degradation
const layout40x10 = calculateChatLayout(10, 40, 1)
assert(layout40x10.messages.height >= 1, "small terminal: messages has at least 1 row")
assert(layout40x10.input.height >= 1, "small terminal: input has at least 1 row")
assert(layout40x10.header.height === 1, "small terminal: header = 1 row")
assertEqual(
  layout40x10.header.height + layout40x10.messages.height + layout40x10.input.height + layout40x10.hint.height,
  10,
  "small terminal: all regions sum to 10",
)

// Multiline input (5 lines) — input area grows
const layoutMultiline = calculateChatLayout(24, 80, 5)
assertEqual(layoutMultiline.input.height, 5, "multiline: input height = 5")
assertEqual(layoutMultiline.messages.height, 24 - 1 - 5 - 1, "multiline: messages shrinks accordingly")

// Multiline capped at 8
const layoutCapped = calculateChatLayout(24, 80, 99)
assertEqual(layoutCapped.input.height, 8, "multiline: input capped at 8")
assert(layoutCapped.messages.height >= 1, "multiline: messages still has space")

// ══════════════════════════════════════════════════════════════════════
//  2. Chat Header
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Header ===")

const headerRegion: ChatRegion = { x: 0, y: 0, width: 80, height: 1 }
const headerText = renderChatHeader(headerRegion)
const headerPlain = stripAnsi(headerText)
assert(headerPlain.startsWith("\u256d"), "header starts with ╭")
assert(headerPlain.endsWith("\u256e"), "header ends with ╮")
assert(headerPlain.includes("AEGIS CHAT"), "header contains 'AEGIS CHAT'")
assert(headerPlain.includes("Ctrl+Q"), "header contains 'Ctrl+Q'")
assertEqual(headerPlain.length, 80, "header is exactly terminal width")

// Narrow terminal
const narrowHeaderRegion: ChatRegion = { x: 0, y: 0, width: 20, height: 1 }
const narrowHeader = renderChatHeader(narrowHeaderRegion)
assert(stripAnsi(narrowHeader).length <= 20, "narrow header fits in 20 cols")
assert(stripAnsi(narrowHeader).startsWith("\u256d"), "narrow header starts with ╭")

// ══════════════════════════════════════════════════════════════════════
//  3. Chat Store State Mutations
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Store ===")

const state = createInitialChatState()
assertEqual(state.messages.length, 1, "initial state has 1 message (welcome)")
assertEqual(state.messages[0]?.role, "assistant", "welcome message is from assistant")
assertEqual(state.messages[0]?.status, "complete", "welcome message status = complete")
assert(!state.ui.isStreaming, "initial state: not streaming")
assertEqual(state.ui.input, "", "initial state: empty input")
assertEqual(state.ui.history.length, 0, "initial state: empty history")
assert(state.dirty, "initial state: dirty = true")

// Add user message
addUserMessage(state, "Hello!")
assertEqual(state.messages.length, 2, "after addUserMessage: 2 messages")
assertEqual(state.messages[1]?.role, "user", "new message is from user")
assertEqual(state.messages[1]?.content, "Hello!", "user message content = 'Hello!'")
assertEqual(state.ui.input, "", "input cleared after send")
assertEqual(state.ui.history.length, 1, "history has 1 entry")
assertEqual(state.ui.history[0], "Hello!", "history[0] = 'Hello!'")

// Add assistant streaming message
addAssistantMessage(state)
assertEqual(state.messages.length, 3, "after addAssistantMessage: 3 messages")
assertEqual(state.messages[2]?.role, "assistant", "new message is from assistant")
assertEqual(state.messages[2]?.status, "streaming", "assistant message status = streaming")
assert(state.ui.isStreaming, "isStreaming = true")

// Append streaming content
appendToStreamingMessage(state, "Hello ")
appendToStreamingMessage(state, "there!")
assertEqual(state.messages[2]?.content, "Hello there!", "streaming content accumulated")
assert(state.dirty, "dirty after append")

// Finalize streaming
finalizeStreamingMessage(state)
assertEqual(state.messages[2]?.status, "complete", "after finalize: status = complete")
assert(!state.ui.isStreaming, "after finalize: isStreaming = false")

// Error handling
addAssistantMessage(state)
setStreamingError(state, "API error 500")
assertEqual(state.messages[3]?.status, "error", "error message status = error")
assert(!state.ui.isStreaming, "after error: isStreaming = false")

// History capped at 100
for (let i = 0; i < 105; i++) {
  addUserMessage(state, `msg-${i}`)
}
assert(state.ui.history.length <= 100, "history capped at 100 entries")

// ══════════════════════════════════════════════════════════════════════
//  4. wrapText Utility
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== wrapText ===")

assertEqual(wrapText("", 10).length, 1, "empty text returns [\"\"] (the empty line is preserved)")
assertEqual(wrapText("hello", 0).length, 0, "maxWidth=0 returns []")
assertEqual(wrapText("hello", -1).length, 0, "maxWidth=-1 returns []")

// Single word fits
let result = wrapText("hello", 10)
assertEqual(result.length, 1, "single word fits on one line")
assertEqual(result[0], "hello", "single word content correct")

// Multiple words on one line
result = wrapText("hello world", 20)
assertEqual(result.length, 1, "'hello world' fits on one line")

// Wrapping
result = wrapText("hello world foo bar baz", 10)
assert(result.length >= 2, "long text wraps to multiple lines")
for (const line of result) {
  assert(line.length <= 10, `wrapped line "${line}" length ${line.length} <= 10`)
}

// Preserve existing newlines
result = wrapText("hello\nworld", 80)
assertEqual(result.length, 2, "newlines preserved: 2 lines")
assertEqual(result[0], "hello", "first line = 'hello'")
assertEqual(result[1], "world", "second line = 'world'")

// Empty lines preserved
result = wrapText("hello\n\nworld", 80)
assertEqual(result.length, 3, "double newline: 3 lines")
assertEqual(result[1], "", "middle line is empty")

// Long single word (wider than maxWidth) — should still work
result = wrapText("superlongwordthatexceedsmaxwidth", 10)
assert(result.length >= 1, "long word is still placed (may exceed width)")

// Leading/trailing whitespace trimming
result = wrapText("  hello world  ", 80)
assertEqual(result.length, 1, "whitespace-trimmed text wraps to 1 line")
assertEqual(result[1], undefined, "no second line")

// ══════════════════════════════════════════════════════════════════════
//  5. Messages Component Rendering
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Messages Component ===")

const freshState = createInitialChatState()
const msgRegion: ChatRegion = { x: 0, y: 1, width: 80, height: 10 }
const msgLines = renderMessages(freshState, msgRegion)
assertEqual(msgLines.length, 10, "messages component fills 10 rows")
assert(stripAnsi(msgLines[0]!).includes("Aegis"), "first line mentions 'Aegis'")
assert(msgLines.some((l) => stripAnsi(l).trim() !== ""), "at least one non-empty line")

// With user + assistant messages
const state2 = createInitialChatState()
addUserMessage(state2, "Write a function")
addAssistantMessage(state2)
appendToStreamingMessage(state2, "Here's a function:")
const msgLines2 = renderMessages(state2, { x: 0, y: 1, width: 80, height: 15 })
assert(stripAnsi(msgLines2.join("")).includes("You"), "user message header 'You' rendered")
assert(stripAnsi(msgLines2.join("")).includes("Write a function"), "user message content rendered")
assert(stripAnsi(msgLines2.join("")).includes("Here"), "assistant streaming content rendered")

// Streaming indicator
assert(stripAnsi(msgLines2.join("")).includes("streaming") || stripAnsi(msgLines2.join("")).includes("Streaming"), "streaming indicator visible in messages")

// Very narrow region
const narrowMsgRegion: ChatRegion = { x: 0, y: 1, width: 10, height: 5 }
const narrowMsgLines = renderMessages(freshState, narrowMsgRegion)
assertEqual(narrowMsgLines.length, 5, "narrow messages fills 5 rows")
assert(stripAnsi(narrowMsgLines[0]!).length <= 10, "narrow messages: each line <= 10 chars")

// Zero height region
const emptyLines = renderMessages(freshState, { x: 0, y: 0, width: 80, height: 0 })
assertEqual(emptyLines.length, 0, "zero height region returns []")

// ══════════════════════════════════════════════════════════════════════
//  6. Input Area Component Rendering
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Input Area ===")

const inputState = createInitialChatState()
const inputRegion: ChatRegion = { x: 0, y: 22, width: 80, height: 1 }
const inputLines = renderInputArea(inputState, inputRegion)
assertEqual(inputLines.length, 1, "single-line input renders 1 row")
assert(stripAnsi(inputLines[0]!).includes("\u2502"), "input starts with │ prompt")

// With content
inputState.ui.input = "test input"
const inputLines2 = renderInputArea(inputState, { x: 0, y: 22, width: 80, height: 1 })
assert(stripAnsi(inputLines2[0]!).includes("test"), "input content 'test' visible")
assert(stripAnsi(inputLines2[0]!).includes("input"), "input content 'input' visible")

// Multiline input rendering
const multilineState = createInitialChatState()
multilineState.ui.input = "line 1\nline 2\nline 3"
multilineState.ui.inputLines = 3
multilineState.ui.cursorRow = 2
multilineState.ui.cursorCol = 3
const mlRegion: ChatRegion = { x: 0, y: 20, width: 80, height: 3 }
const mlLines = renderInputArea(multilineState, mlRegion)
assertEqual(mlLines.length, 3, "multiline input renders 3 rows")
assert(stripAnsi(mlLines[0]!).includes("line 1"), "first line rendered")

// Narrow input
const narrowInputRegion: ChatRegion = { x: 0, y: 22, width: 10, height: 1 }
inputState.ui.input = "very long input text"
const narrowInputLines = renderInputArea(inputState, narrowInputRegion)
// cli-truncate should visually truncate to 10 cols. strip ANSI to check visual width.
assert(stripAnsi(narrowInputLines[0]!).length <= 10, "narrow input: line <= 10 chars")

// ══════════════════════════════════════════════════════════════════════
//  7. Chat Hint Rendering
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Chat Hint ===")

const hintState = createInitialChatState()
const hintRegion: ChatRegion = { x: 0, y: 23, width: 80, height: 1 }

const idleHint = renderChatHint(hintState, hintRegion)
const idleHintPlain = stripAnsi(idleHint)
assert(idleHintPlain.includes("Enter"), "idle hint mentions 'Enter'")
assert(idleHintPlain.includes("Alt+Enter"), "idle hint mentions 'Alt+Enter'")
assert(!idleHintPlain.includes("Streaming"), "idle hint doesn't mention Streaming")
assert(idleHintPlain.length <= 80, "idle hint fits in 80 cols")

// Streaming hint
hintState.ui.isStreaming = true
const streamingHint = renderChatHint(hintState, hintRegion)
const streamingHintPlain = stripAnsi(streamingHint)
assert(streamingHintPlain.includes("Streaming"), "streaming hint mentions 'Streaming'")
assert(streamingHintPlain.includes("Esc"), "streaming hint mentions 'Esc'")

// ══════════════════════════════════════════════════════════════════════
//  8. Input Parsing
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Input Parsing ===")

function checkKey(raw: string, expected: ChatKeyEvent["type"], label: string) {
  const result = parseChatKey(raw)
  assertEqual(result.type, expected, label)
}

checkKey("\x1b[A", "up", "↑ arrow")
checkKey("\x1b[B", "down", "↓ arrow")
checkKey("\x1b[C", "right", "→ arrow")
checkKey("\x1b[D", "left", "← arrow")
checkKey("\x1b[5~", "page_up", "Page Up")
checkKey("\x1b[6~", "page_down", "Page Down")
checkKey("\x1b[H", "home", "Home")
checkKey("\x1b[F", "end", "End")
checkKey("\x1b[3~", "delete", "Delete")
checkKey("\x1b", "escape", "Escape")
checkKey("\x11", "ctrl_q", "Ctrl+Q")
checkKey("\x03", "ctrl_c", "Ctrl+C")
checkKey("\x0c", "ctrl_l", "Ctrl+L")
checkKey("\r", "enter", "Enter")
checkKey("\n", "enter", "Newline as Enter")
checkKey("\x1b\r", "alt_enter", "Alt+Enter (\\x1b\\r)")
checkKey("\x1b[13;3u", "alt_enter", "Alt+Enter (CSI u)")
checkKey("\x7f", "backspace", "Backspace")
checkKey("a", "char", "Printable char 'a'")
checkKey("Z", "char", "Printable char 'Z'")
checkKey(" ", "char", "Space character")
checkKey("\x01", "unknown", "Unmapped ctrl-a")

// ══════════════════════════════════════════════════════════════════════
//  9. Chat Input Handling
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Input Handling ===")

// Basic text entry
const is1 = createInitialChatState()
assertEqual(handleChatKey(is1, { type: "char", char: "h" }), "continue", "char handler returns 'continue'")
assertEqual(is1.ui.input, "h", "typing 'h' appends")
assertEqual(is1.ui.cursorCol, 1, "cursor after 'h'")

handleChatKey(is1, { type: "char", char: "i" })
assertEqual(is1.ui.input, "hi", "typing 'hi'")

// Backspace
handleChatKey(is1, { type: "backspace" })
assertEqual(is1.ui.input, "h", "backspace removes 'i'")
assertEqual(is1.ui.cursorCol, 1, "cursor after backspace")

// Enter sends non-empty input
const is2 = createInitialChatState()
is2.ui.input = "hello"
assertEqual(handleChatKey(is2, { type: "enter" }), "send", "enter sends non-empty input")

// Enter does nothing on empty input
is2.ui.input = ""
assertEqual(handleChatKey(is2, { type: "enter" }), "continue", "enter on empty returns 'continue'")

// Ctrl+Q quits
assertEqual(handleChatKey(is2, { type: "ctrl_q" }), "quit", "ctrl_q returns 'quit'")
assertEqual(handleChatKey(is2, { type: "ctrl_c" }), "quit", "ctrl_c returns 'quit'")

// Escape clears input or cancels streaming
const is3 = createInitialChatState()
is3.ui.input = "something"
assertEqual(handleChatKey(is3, { type: "escape" }), "continue", "escape on non-empty returns 'continue'")
assertEqual(is3.ui.input, "", "escape clears input")

// Escape during streaming
const is4 = createInitialChatState()
is4.ui.isStreaming = true
assertEqual(handleChatKey(is4, { type: "escape" }), "cancel_stream", "escape during streaming returns 'cancel_stream'")

// Cursor movement
const is5 = createInitialChatState()
is5.ui.input = "hello world"
is5.ui.cursorCol = 5
is5.ui.cursorRow = 0
handleChatKey(is5, { type: "left" })
assertEqual(is5.ui.cursorCol, 4, "left moves cursor back")
handleChatKey(is5, { type: "right" })
assertEqual(is5.ui.cursorCol, 5, "right moves cursor forward")
handleChatKey(is5, { type: "home" })
assertEqual(is5.ui.cursorCol, 0, "home moves to column 0")
handleChatKey(is5, { type: "end" })
assertEqual(is5.ui.cursorCol, "hello world".length, "end moves to end of line")

// History recall
const is6 = createInitialChatState()
is6.ui.history = ["first", "second", "third"]
is6.ui.historyIndex = -1
handleChatKey(is6, { type: "up" })
assertEqual(is6.ui.input, "third", "↑ recalls last history entry")
assertEqual(is6.ui.historyIndex, 0, "historyIndex = 0 after first up")
handleChatKey(is6, { type: "up" })
assertEqual(is6.ui.input, "second", "↑↑ recalls second-to-last")
assertEqual(is6.ui.historyIndex, 1, "historyIndex = 1 after second up")
handleChatKey(is6, { type: "down" })
assertEqual(is6.ui.input, "third", "↓ returns to third")
handleChatKey(is6, { type: "down" })
assertEqual(is6.ui.input, "", "↓↓ clears when back at end")
assertEqual(is6.ui.historyIndex, -1, "historyIndex = -1 after cycling through")

// Tab character inserts into input
const is7 = createInitialChatState()
handleChatKey(is7, { type: "char", char: "\t" })
assertEqual(is7.ui.input, "\t", "tab inserts into input")

// Cannot type during streaming
const is8 = createInitialChatState()
is8.ui.isStreaming = true
handleChatKey(is8, { type: "char", char: "x" })
assertEqual(is8.ui.input, "", "chars blocked during streaming")

// PgUp/PgDn scrolling
const is9 = createInitialChatState()
for (let i = 0; i < 10; i++) {
  addUserMessage(is9, `msg ${i}`)
  addAssistantMessage(is9)
  finalizeStreamingMessage(is9)
}
assertEqual(is9.ui.scrolledUp, false, "initial state: not scrolled up")
handleChatKey(is9, { type: "page_up" })
assert(is9.ui.scrolledUp === true, "PgUp: scrolled up = true")
assert(is9.ui.scrollOffset > 0, "PgUp: scroll offset > 0")

handleChatKey(is9, { type: "page_down" })
// After PgDn, may have reduced scroll offset
assert(is9.ui.scrollOffset >= 0, "PgDn: scroll offset >= 0")

// Multiline cursor movement
const is10 = createInitialChatState()
is10.ui.input = "line A\nline B\nline C"
is10.ui.cursorRow = 1
is10.ui.cursorCol = 3
handleChatKey(is10, { type: "up" })
assertEqual(is10.ui.cursorRow, 0, "multiline ↑: cursor row 0")
handleChatKey(is10, { type: "down" })
assertEqual(is10.ui.cursorRow, 1, "multiline ↓: cursor row 1")

// Left at start of line moves to previous line
const is11 = createInitialChatState()
is11.ui.input = " line A\nline B"
is11.ui.cursorRow = 1
is11.ui.cursorCol = 0
handleChatKey(is11, { type: "left" })
assertEqual(is11.ui.cursorRow, 0, "← at start: moves to previous line")
assertEqual(is11.ui.cursorCol, 7, "← at start: cursor at end of prev line")

// Right at end of line moves to next line
const is12 = createInitialChatState()
is12.ui.input = "line A\nline B"
is12.ui.cursorRow = 0
is12.ui.cursorCol = 6
handleChatKey(is12, { type: "right" })
assertEqual(is12.ui.cursorRow, 1, "→ at end: moves to next line")
assertEqual(is12.ui.cursorCol, 0, "→ at end: cursor at start of next line")

// Delete key
const is13 = createInitialChatState()
is13.ui.input = "hello"
assertEqual(handleChatKey(is13, { type: "delete" }), "continue", "delete key returns continue")

// ══════════════════════════════════════════════════════════════════════
//  9. Model Picker
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Model Picker ===")

import { renderPicker } from "./components/picker"

const pItems: PickerItem[] = [
  { kind: "provider", name: "anthropic", active: true },
  { kind: "model", provider: "anthropic", id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { kind: "model", provider: "anthropic", id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
  { kind: "provider", name: "openai", active: false },
  { kind: "model", provider: "openai", id: "gpt-4o", label: "GPT-4o" },
]

const pRegion: ChatRegion = { x: 47, y: 1, width: 34, height: 10 }
const pLines = renderPicker(pRegion, pItems, 0, "anthropic")
assert(pLines.length === 10, "picker renders 10 lines")
const pHeaderPlain = stripAnsi(pLines[0] || "")
assert(pHeaderPlain.includes("Models/Providers"), "picker header has title")

const pLine1Plain = stripAnsi(pLines[1] || "")
assert(pLine1Plain.includes(">"), "selected provider shows > marker")
assert(pLine1Plain.includes("anthropic"), "active provider name rendered")

const pLine3Plain = stripAnsi(pLines[3] || "")
assert(pLine3Plain.includes("openai"), "inactive provider name rendered")

const pLine5Plain = stripAnsi(pLines[5] || "")
assert(pLine5Plain.includes("GPT-4o"), "model label visible")

// Selection at end scrolls viewport
const pLines2 = renderPicker(pRegion, pItems, 4, "anthropic")
const pLineLastPlain = stripAnsi(pLines2[pLines2.length - 1] || "")
assert(pLineLastPlain.includes("GPT-4o") || !pLineLastPlain.trim(), "selection scrolls to show selected item")

// Empty items
const emptyPickerLines = renderPicker(pRegion, [], 0, "anthropic")
assert(emptyPickerLines.length === 10, "empty picker still renders 10 lines")

// Picker state initializes correctly
const pickerState = createInitialChatState()
assert(pickerState.ui.showPicker === false, "initial state showPicker = false")
assert(pickerState.ui.pickerIndex === 0, "initial state pickerIndex = 0")
assert(pickerState.ui.pickerItems.length === 0, "initial state pickerItems empty")

// Layout includes picker region when showPicker=true
const layoutNoPicker = calculateChatLayout(24, 80, 1)
assert(layoutNoPicker.picker === undefined, "layout: no picker region when closed")

const layoutWithPicker = calculateChatLayout(24, 80, 1, true)
assert(layoutWithPicker.picker !== undefined, "layout: picker region exists when open")
assert(layoutWithPicker.picker.width === 34, "layout: picker width is 34")
assert(layoutWithPicker.messages.width === 45, "layout: messages shrinks when picker open")

// ══════════════════════════════════════════════════════════════════════
//  Summary
// ══════════════════════════════════════════════════════════════════════

console.log("")
console.log(`Tests: ${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)

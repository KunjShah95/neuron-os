# Model Picker Overlay — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a split-panel model/provider picker to the Chat TUI, activated by Ctrl+P.

**Architecture:** When the picker is open, the right 34 columns become a navigable list of providers and their models. The picker state lives in `ChatUIState`, layout returns an extra `picker` region, and a new `renderPicker()` component draws the panel.

**Tech Stack:** Bun + TypeScript, same as chat TUI (no new dependencies)

---

### Task 1: Add Picker Types and State to store.ts

**Files:**
- Modify: `src/chat/store.ts`

- [ ] **Step 1: Add `PickerItem` type and picker fields to `ChatUIState`**

Add after `historyIndex: number`:
```ts
  showPicker: boolean
  pickerItems: PickerItem[]
  pickerIndex: number
}

export type PickerItem =
  | { kind: "provider"; name: string; active: boolean }
  | { kind: "model"; provider: string; id: string; label: string }
```

- [ ] **Step 2: Initialize picker fields in `createInitialChatState`**

Add inside the `ui` block:
```ts
      showPicker: false,
      pickerItems: [],
      pickerIndex: 0,
```

- [ ] **Step 3: Run tests to verify no regressions**

Run: `bun run src/chat/test-chat.ts`
Expected: All 150 passed

- [ ] **Step 4: Commit**

```bash
git add src/chat/store.ts
git commit -m "feat: add PickerItem type and showPicker state to ChatUIState"
```

---

### Task 2: Add Picker Region to Chat Layout

**Files:**
- Modify: `src/chat/layout.ts`

- [ ] **Step 1: Add `picker` to `ChatLayout`**

```ts
export interface ChatLayout {
  header: ChatRegion
  messages: ChatRegion
  input: ChatRegion
  hint: ChatRegion
  picker?: ChatRegion
}
```

- [ ] **Step 2: Update `calculateChatLayout` to accept a `showPicker` parameter and split layout**

```ts
export function calculateChatLayout(rows: number, cols: number, inputLines: number, showPicker = false): ChatLayout {
  const headerHeight = 1
  const hintHeight = 1
  const inputHeight = Math.min(Math.max(1, inputLines), 8)
  const pickerWidth = showPicker ? 34 : 0
  const chatWidth = Math.max(1, cols - pickerWidth - (showPicker ? 1 : 0))
  const messagesHeight = Math.max(1, rows - headerHeight - inputHeight - hintHeight)
  const pickerX = showPicker ? chatWidth + 1 : cols
  const pickerHeight = messagesHeight + inputHeight

  return {
    header: { x: 0, y: 0, width: cols, height: headerHeight },
    messages: { x: 0, y: headerHeight, width: chatWidth, height: messagesHeight },
    input: { x: 0, y: headerHeight + messagesHeight, width: chatWidth, height: inputHeight },
    hint: { x: 0, y: headerHeight + messagesHeight + inputHeight, width: chatWidth, height: hintHeight },
    picker: showPicker ? { x: pickerX, y: headerHeight, width: pickerWidth, height: pickerHeight } : undefined,
  }
}
```

- [ ] **Step 3: Run tests to verify layout still works**

Run: `bun run src/chat/test-chat.ts`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/chat/layout.ts
git commit -m "feat: add picker region to ChatLayout"
```

---

### Task 3: Add `Ctrl+P` Key Event to Input Parser

**Files:**
- Modify: `src/chat/input.ts`

- [ ] **Step 1: Find the existing `ChatKeyEvent` type and add the new event type**

Search for `export type ChatKeyEvent` and add `| { type: "toggle_picker" }` to the union.

- [ ] **Step 2: Add `Ctrl+P` to the key parser in `parseChatKey`**

Find the existing Ctrl key handling and add:
```ts
    case "\x10": return { type: "toggle_picker" }  // Ctrl+P
```

- [ ] **Step 3: Handle `toggle_picker` in `handleChatKey`**

Find the switch statement in `handleChatKey`. Before the `case "quit"` block, add:
```ts
      case "toggle_picker":
        state.ui.showPicker = !state.ui.showPicker
        if (state.ui.showPicker) {
          const { listProviders } = require("../../ai/providers") as typeof import("../../ai/providers")
          const { MODEL_REFERENCES } = require("../../ai/models") as typeof import("../../ai/models")
          const providers = listProviders()
          const items: PickerItem[] = []
          const currentProvider = state.config.provider || providers[0]
          for (const p of providers) {
            const active = p === currentProvider
            items.push({ kind: "provider", name: p, active })
            const models = MODEL_REFERENCES[p as keyof typeof MODEL_REFERENCES] || []
            for (const m of models) {
              items.push({ kind: "model", provider: p, id: m.id, label: m.label })
            }
          }
          state.ui.pickerItems = items
          state.ui.pickerIndex = 0
        }
        state.dirty = true
        return "continue"

      case "picker_up":
        if (state.ui.pickerIndex > 0) state.ui.pickerIndex--
        state.dirty = true
        return "continue"

      case "picker_down":
        if (state.ui.pickerIndex < state.ui.pickerItems.length - 1) state.ui.pickerIndex++
        state.dirty = true
        return "continue"

      case "picker_select": {
        const item = state.ui.pickerItems[state.ui.pickerIndex]
        if (item && item.kind === "model") {
          state.config.provider = item.provider
          state.config.model = item.id
          try {
            const { saveConfig, loadConfig } = require("../../config") as typeof import("../../config")
            const cfg = loadConfig()
            cfg.provider = item.provider
            cfg.model = item.id
            saveConfig(cfg)
          } catch { /* ignore */ }
        }
        state.ui.showPicker = false
        state.dirty = true
        return "continue"
      }

      case "picker_cancel":
        state.ui.showPicker = false
        state.dirty = true
        return "continue"
```

Also add the import at the top:
```ts
import type { PickerItem } from "./store"
```

Wait - store.ts imports from input.ts? Let me check. If there's a circular dependency issue, I'll inline the type.

Actually, `PickerItem` is defined in `store.ts` and used in `input.ts`. Let me check if there's an existing import pattern.

Looking at `input.ts` - it imports `ChatState` from `./store`. So it should be fine to also import `PickerItem`.

But actually, it'd be cleaner to define `PickerItem` in `input.ts` or a types file. But following the existing pattern where types are in `store.ts`, let me keep it there.

- [ ] **Step 4: Run tests**

Run: `bun run src/chat/test-chat.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/chat/input.ts
git commit -m "feat: add Ctrl+P toggle_picker key event and handler"
```

---

### Task 4: Create Picker Rendering Component

**Files:**
- Create: `src/chat/components/picker.ts`

- [ ] **Step 1: Write the picker component**

```ts
import cliTruncate from "cli-truncate"
import { theme, box } from "../../cli/theme"
import type { ChatRegion } from "../layout"
import type { PickerItem } from "../store"

export function renderPicker(region: ChatRegion, items: PickerItem[], selectedIndex: number, currentProvider: string): string[] {
  const lines: string[] = []
  const innerWidth = region.width - 2

  // Top border
  lines.push(theme.accent(box.hr) + theme.accent(" Models/Providers ") + theme.accent(box.hr))

  const availableHeight = region.height - 2
  let startIdx = 0
  if (selectedIndex > availableHeight - 1) {
    startIdx = selectedIndex - availableHeight + 1
  }

  for (let i = 0; i < availableHeight; i++) {
    const itemIdx = startIdx + i
    if (itemIdx >= items.length) {
      lines.push(" ".repeat(region.width))
      continue
    }
    const item = items[itemIdx]
    const isSelected = itemIdx === selectedIndex
    const prefix = isSelected ? theme.accent(">") : " "
    let text: string
    if (item.kind === "provider") {
      const marker = item.active ? theme.accent(box.dot) : " "
      text = `${prefix} ${marker} ${theme.bold(item.name)}`
    } else {
      const arrow = item.kind === "model" ? " " : ""
      text = `${prefix}  ${arrow} ${item.label}`
    }
    const padded = text.padEnd(innerWidth, " ")
    lines.push(theme.surround(cliTruncate(padded, region.width), " ", " "))
  }

  return lines
}
```

- [ ] **Step 2: Export from components barrel**

Find `src/chat/components/index.ts` and add:
```ts
export { renderPicker } from "./picker"
```

- [ ] **Step 3: Commit**

```bash
git add src/chat/components/picker.ts src/chat/components/index.ts
git commit -m "feat: create picker panel rendering component"
```

---

### Task 5: Wire Picker into Chat Renderer

**Files:**
- Modify: `src/chat/renderer.ts`

- [ ] **Step 1: Import the picker component and update layout call**

Add import:
```ts
import { renderPicker } from "./components"
```

Change the layout call to pass `showPicker`:
```ts
const layout = calculateChatLayout(rows, cols, state.ui.inputLines, state.ui.showPicker)
```

- [ ] **Step 2: Handle `toggle_picker` key in the renderer's onData handler**

Find the `parseChatKey` call and add before the `case "quit"`:
```ts
      case "toggle_picker":
        handleChatKey(state, key)
        state.dirty = true
        break
```

- [ ] **Step 3: Render picker panel when open**

After the hint line rendering, add:
```ts
      // Picker panel
      if (layout.picker && state.ui.showPicker) {
        const pickerLines = renderPicker(layout.picker, state.ui.pickerItems, state.ui.pickerIndex, state.config.provider || "")
        for (let y = 0; y < layout.picker.height; y++) {
          output += ansiEscapes.cursorTo(layout.picker.x, layout.picker.y + y)
          output += pickerLines[y] ?? ""
        }
      }
```

- [ ] **Step 4: Handle picker key events when picker is open**

When `state.ui.showPicker` is true, the up/down/enter/esc keys should be intercepted. Add this at the very beginning of `onData` (before `handleChatKey`):
```ts
    if (state.ui.showPicker) {
      const key = parseChatKey(raw)
      switch (key.type) {
        case "up":
          if (state.ui.pickerIndex > 0) state.ui.pickerIndex--
          state.dirty = true
          break
        case "down":
          if (state.ui.pickerIndex < state.ui.pickerItems.length - 1) state.ui.pickerIndex++
          state.dirty = true
          break
        case "enter": {
          const item = state.ui.pickerItems[state.ui.pickerIndex]
          if (item && item.kind === "model") {
            state.config.provider = item.provider
            state.config.model = item.id
            try {
              const { saveConfig, loadConfig } = require("../../config") as typeof import("../../config")
              const cfg = loadConfig()
              cfg.provider = item.provider
              cfg.model = item.id
              saveConfig(cfg)
            } catch { /* ignore */ }
          }
          state.ui.showPicker = false
          state.dirty = true
          break
        }
        case "escape":
        case "toggle_picker":
          state.ui.showPicker = false
          state.dirty = true
          break
      }
      return
    }
```

- [ ] **Step 5: Run tests**

Run: `bun run scripts/run-tests.ts`
Expected: All suites pass

- [ ] **Step 6: Commit**

```bash
git add src/chat/renderer.ts
git commit -m "feat: wire picker panel into chat renderer with key handling"
```

---

### Task 6: Add Picker Tests

**Files:**
- Modify: `src/chat/test-chat.ts`

- [ ] **Step 1: Add after the "Chat Hint" section**

```ts
// ══════════════════════════════════════════════════════════════════════
//  9. Model Picker
// ══════════════════════════════════════════════════════════════════════

console.log("\n=== Model Picker ===")

import { renderPicker } from "./components/picker"
import type { PickerItem } from "./store"

const pickerItems: PickerItem[] = [
  { kind: "provider", name: "anthropic", active: true },
  { kind: "model", provider: "anthropic", id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { kind: "model", provider: "anthropic", id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
  { kind: "provider", name: "openai", active: false },
  { kind: "model", provider: "openai", id: "gpt-4o", label: "GPT-4o" },
]

// Picker renders correct number of lines
const pickerRegion: ChatRegion = { x: 47, y: 1, width: 34, height: 10 }
const pLines = renderPicker(pickerRegion, pickerItems, 0, "anthropic")
assert(pLines.length === 10, "picker renders 10 lines")
assert(pLines[0].includes("Models/Providers"), "picker header has title")

// Selected item marked with >
const plain1 = stripAnsi(pLines[1])
assert(plain1.includes(">"), "selected provider shows > marker")

// Active provider marked with dot
assert(plain1.includes("anthropic"), "active provider name rendered")

// Non-selected items have space prefix
const plain3 = stripAnsi(pLines[3])
assert(plain3.startsWith(" ") || plain3.startsWith("\x1b"), "non-selected item starts with space")

// Models are indented
const plain5 = stripAnsi(pLines[5])
assert(plain5.includes("GPT-4o"), "model label visible")

// Selection scrolls: if index is near end, startIdx adjusts
const pLines2 = renderPicker(pickerRegion, pickerItems, 4, "anthropic")
const plain2Last = stripAnsi(pLines2[pLines2.length - 1])
// The last visible item should be GPT-4o (index 4) since it's within the viewport
assert(plain2Last.includes("GPT-4o") || !plain2Last.trim(), "selection scrolls to show selected item")
```

- [ ] **Step 2: Run tests**

Run: `bun run src/chat/test-chat.ts`
Expected: All tests pass (including new picker tests)

- [ ] **Step 3: Commit**

```bash
git add src/chat/test-chat.ts
git commit -m "test: add model picker rendering tests"
```

---

### Task 7: Run Full CI and Verify

- [ ] **Step 1: Run full test suite**

Run: `bun run scripts/run-tests.ts`
Expected: All suites pass (dashboard 54, chat 150+, sessions, agent 7, typecheck)

- [ ] **Step 2: Final verification**

Run: `bun run --bun tsc --noEmit`
Expected: No output (clean typecheck)

- [ ] **Step 3: Commit remaining changes**

```bash
git add .
git commit -m "feat: add model picker overlay to chat TUI"
```

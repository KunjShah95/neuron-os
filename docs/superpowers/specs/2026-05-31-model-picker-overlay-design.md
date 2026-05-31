# Model Picker Overlay — Design Spec

**Date:** 2026-05-31
**Project:** Aegis (neuron-os)
**Status:** Approved

## Overview

Add a split-panel model/provider picker to the Chat TUI, allowing users to visually browse and switch providers/models without memorizing slash command syntax.

## Trigger

- `Ctrl+P` — toggle picker open/closed
- `/model` — slash command (alias to `Ctrl+P`)
- `Esc` — dismiss picker when open

## Layout

When the picker is open, the chat layout splits horizontally:
- Picker panel: rightmost 34 columns, full height (minus header)
- Chat area: remaining left columns, shrunk accordingly

The picker has a bordered frame with title ` Models/Providers `.

## Navigation

- `↑/↓` — move selection through a flat list of items
- `Enter` — select the highlighted item (selects model, updates state+config, closes picker)
- `Esc` — dismiss picker without changes

## Data Model

Picker items are a flat array generated from `listProviders()` and `MODEL_REFERENCES`:

```
> anthropic (selected)
    Claude Sonnet 4
    Claude 3.5 Sonnet
    Claude 3 Opus
  * openai
    GPT-4o
    GPT-4o Mini
  deepseek
    DeepSeek Chat
```

- `>` indicates current selection (the row being navigated)
- `*` indicates the currently active provider
- Selecting a model updates `state.config.provider` and `state.config.model`, then calls `saveConfig()` to persist

## State Changes

**ChatUIState** additions:
```ts
showPicker: boolean
pickerItems: PickerItem[]  // flat list
pickerIndex: number
```

Where `PickerItem` is:
```ts
type PickerItem =
  | { kind: "provider"; name: string; active: boolean }
  | { kind: "model"; provider: string; id: string; label: string }
```

## Files Changed

| File | Change |
|------|--------|
| `src/chat/store.ts` | Add picker state fields to `ChatUIState`, `PickerItem` type |
| `src/chat/layout.ts` | Add `picker?: ChatRegion` to `ChatLayout`, calculate picker width |
| `src/chat/input.ts` | Parse `Ctrl+P` as `{ type: "toggle_picker" }` |
| `src/chat/components/picker.ts` | New file: render picker panel |
| `src/chat/renderer.ts` | Handle `toggle_picker` key, render picker when open, handle picker key events |

## Key Handling

When `showPicker` is true, `handleChatKey` enters a picker-mode branch:
- `↑/↓` → adjust `pickerIndex`
- `Enter` → select item, update config, close picker
- `Esc` → close picker
- Other keys → ignored (not forwarded to chat)

## Persistence

Selecting a model is equivalent to `/provider set <provider> model=<model>` — updates `state.config` and calls `saveConfig()`.

## Tests

- Picker renders correct items for registered providers
- Navigation wraps around at top/bottom
- Enter on provider skips to first model of that provider
- Enter on model selects and closes picker
- Esc dismisses without changes
- Ctrl+P toggles open/closed

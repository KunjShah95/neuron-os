---
title: Creating a Mode
description: Step-by-step guide to creating a new Aegis mode — Mode interface, registration, key events, and best practices
---

# Creating a Mode

> **Last updated:** May 2026  
> **Module:** `src/modes/`  
> **Pattern:** Register a `Mode` object in the mode registry

## Overview

Modes are interactive terminal UIs that run as the main application loop. They provide specialized interfaces (chat, config, status, MCP, setup, etc.). Each mode implements a simple `Mode` interface and registers itself on import.

## The `Mode` Interface

```typescript
interface Mode {
  id: string        // Unique identifier (e.g., "chat", "config", "status")
  name: string      // Human-readable name (e.g., "Chat", "Configuration")
  description: string // One-line description for the wakeup picker
  run(): Promise<"back" | "quit">
}
```

The `run()` method returns:
- `"back"` — Return to the wakeup menu
- `"quit"` — Exit the application entirely

## Step-by-Step: Creating a New Mode

### 1. Create the Mode File

Create `src/modes/my-mode.ts`:

```typescript
import type { Mode } from "./types"

async function runMyMode(): Promise<"back" | "quit"> {
  // Your interactive loop here
  console.log("Welcome to My Mode!")
  console.log("Press Ctrl+C or type 'quit' to exit")

  // Simple input loop
  for await (const line of console) {
    if (line === "quit") return "back"
    if (line === "exit") return "quit"
    console.log(`You said: ${line}`)
  }

  return "back"
}

export const myMode: Mode = {
  id: "my-mode",
  name: "My Custom Mode",
  description: "A custom mode that does X, Y, and Z",
  run: runMyMode,
}
```

### 2. Register the Mode

Add your mode to the registry in `src/modes/index.ts`:

```typescript
import { myMode } from "./my-mode"

export function registerAllModes() {
  registerMode(dashboardMode)
  registerMode(chatMode)
  registerMode(statusMode)
  // ... existing modes
  registerMode(myMode)  // ← add here
}
```

### 3. Add CLI Entry

For modes that should be launchable from the CLI (e.g., `aegis my-mode`), add a command in `src/cli/commands/index.ts`:

```typescript
import { myMode } from "../../modes/my-mode"
// In the command map:
"my-mode": {
  description: "Run my custom mode",
  run: () => myMode.run(),
},
```

### 4. Auto-Discovery in Wakeup Picker

Modes registered via `registerMode()` automatically appear in the `aegis wakeup` picker — no additional wiring needed. The wakeup script calls `listModes()` from the registry and presents all modes along with non-mode commands (`ask`, `plan`, `agent-run`, `telegram`).

## Built-in Mode Examples

### Chat Mode (`src/modes/builtin.ts`)

The chat mode creates a full-screen chat interface with:
- Message rendering with scrollback
- Streaming response support
- Provider/model picker UI
- Session persistence
- Checkpoint/rewind

### Config Mode (`src/modes/config.ts`)

Configuration management with:
- Lists all vault entries in a table
- Supports `set`, `get`, `delete` subcommands
- Shows scope and timestamps

### Status Mode (`src/modes/status.ts`)

System overview with:
- Running agents list with status
- System metrics (memory, uptime)
- Active providers
- Recent log entries

### MCP Mode (`src/modes/mcp.ts`)

MCP server management:
- Start/stop MCP server (stdio or HTTP)
- List connected MCP clients
- View tool definitions

## Key Event Handling

Modes receive raw keyboard input. Use `parseKey()` from `types.ts`:

```typescript
import { parseKey, type KeyEvent } from "./types"

function handleKey(raw: string): void {
  const key = parseKey(raw)
  switch (key.type) {
    case "ctrl_c":
      process.exit(0)
    case "enter":
      // Process input
      break
    case "char":
      // Append character
      break
    case "up":
      // History navigation
      break
    case "escape":
      // Cancel or go back
      break
    // ... handle other key events
  }
}
```

Available key events: `char`, `up`, `down`, `left`, `right`, `enter`, `tab`, `escape`, `ctrl_p`, `ctrl_q`, `ctrl_c`, `ctrl_l`, `backspace`, `delete`, `home`, `end`, `page_up`, `page_down`.

## Best Practices

1. **Keep `run()` returning `"back"` or `"quit"`** — This lets the launcher manage navigation
2. **Use async/await for I/O** — Mode run functions are async
3. **Handle Ctrl+C gracefully** — Bridge it to `"quit"` return
4. **Use the logger** — Import `createLogger` from `src/cli/logger.ts` for structured logging
5. **Access shared state** — Use the `agentManager` singleton or `memorySystem` singleton for global state
6. **Terminal raw mode** — Use `process.stdin.setRawMode(true)` for interactive input, restore on exit
7. **Error isolation** — Wrap the mode loop in try/catch and log errors without crashing

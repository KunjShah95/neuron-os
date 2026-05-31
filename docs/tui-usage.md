# Aegis TUI: Daily Usage Guide

Aegis has two Terminal User Interfaces: the **Dashboard** (agent/session monitor) and the **Chat** (AI conversation). Both run in your terminal using an alternate screen — they take over the full terminal window and restore it when you quit.

---

## Launching the TUI

### Via the interactive launcher

```bash
bun run index.ts wakeup
# or globally: aegis wakeup
```

Select **Dashboard** or **Chat** from the menu.

### Direct commands

```bash
# Dashboard (agent monitor)
bun run index.ts dashboard
bun run index.ts dash          # alias

# Chat (AI conversation)
bun run index.ts chat
bun run index.ts c             # alias
```

### Global install

```bash
bun link   # one-time setup
aegis wakeup
aegis dashboard
aegis chat
```

---

## 1. Dashboard TUI

The Dashboard is a live agent monitoring panel. It shows running agents, system metrics, and an activity log — think of it as "htop for AI agents."

### Layout

```
╭─ AEGIS DASHBOARD ──────────────────── Ctrl+Q Quit ╮   ← header
│ AGENTS              │ ACTIVITY LOG                   │
│ ● test-agent (build)│ ✓ Agent "test-agent" spawned   │
│ ● idle-agent (plan) │ ! Agent "idle-agent" idle      │
│                     │ · Agent heartbeat OK           │
│                     │                                │
│                     │                                │
│                     │                                │
╰─ ● MEM:7% · ● CPU:0% · SESS:1 · UP:42m ──────────╯   ← status bar
$ _                                                      ← command bar
```

| Panel | Description |
|-------|-------------|
| **Header** | Rounded corners (`╭╮`), shows app name and quit hint |
| **Left panel** | Agent list — running agents with status indicators |
| **Right panel** | Activity log — scrolling event stream |
| **Status bar** | Bottom border (`╰╯`) with system metrics |
| **Command bar** | `$` prompt at the bottom — type commands here |

### Status indicators

#### Agent list

| Symbol | Meaning |
|--------|---------|
| `●` green | Agent is running or busy |
| `●` yellow | Agent is idle (no active task) |
| `·` muted | Agent is stopped |
| `✕` red | Agent encountered an error |

#### Activity log

| Symbol | Type |
|--------|------|
| `·` | Info — general status messages |
| `✓` | Success — agent spawned, recovered, etc. |
| `→` | Event — lifecycle events (exits, state changes) |
| `!` | Warning — recovery attempts, potential issues |
| `✕` | Error — failures, crashes, errors |

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| **Tab** | Cycle focus: log → agents → command → log |
| **Up/Down** | Scroll activity log (when log/agents focused); recall command history (when command focused) |
| **PgUp/PgDn** | Scroll activity log by 10 lines |
| **Enter** | Execute the typed command |
| **Backspace** | Delete character before cursor |
| **Ctrl+Q** / **Ctrl+C** | Quit the dashboard |
| All other chars | Type into the command bar |

### Available commands

Type any command at the `$` prompt and press Enter.

| Command | Description | Example |
|---------|-------------|---------|
| `spawn <name>` | Launch an agent | `spawn my-builder` |
| `spawn <name> --type <type>` | Launch with agent type | `spawn review --type review` |
| `spawn <name> --script <path>` | Launch with custom script | `spawn debug --script ./worker.ts` |
| `spawn <name> --tag <tag>` | Launch with tags | `spawn review --tag code-review` |
| `kill <name>` | Stop an agent by name | `kill my-builder` |
| `kill all` | Stop all running agents | `kill all` |
| `list` / `ls` | Show all agents with status, pid, uptime | `list` |
| `status` / `st` | Show system info (version, runtime, memory, uptime) | `status` |
| `help` / `h` | Show available commands | `help` |

**Short aliases:** `s` for `spawn`, `k` for `kill`, `h` for `help`.

### Example dashboard workflow

```bash
# Launch the dashboard
bun run index.ts dashboard

# Inside the dashboard:
# 1. Spawn agents
$ spawn builder-1
$ spawn reviewer-1
$ spawn monitor-1

# 2. Check what's running
$ list

# 3. Kill specific agent
$ kill reviewer-1

# 4. Kill everything
$ kill all

# 5. Quit
#   → Press Ctrl+Q
```

---

## 2. Chat TUI

The Chat is a streaming AI conversation interface powered by Anthropic (Claude).

### Layout

```
╭─ AEGIS CHAT ────────────────────────── Ctrl+Q Quit ╮   ← header
│                                                       │
│ → You (12:00:01)                                     │
│   Write a function that calculates fibonacci          │
│                                                       │
│ → Aegis (12:00:03)                                   │
│   Here's a fibonacci function:                       │
│                                                       │
│   function fib(n) {                                  │
│     if (n <= 1) return n                             │
│     return fib(n-1) + fib(n-2)                       │
│   }                                                   │
│                                                       │
│ │ input text here▐                                   │   ← input area
│ · Enter to send | Alt+Enter newline | →→ history | Ctrl+Q quit  ← hint
```

### Status indicator

| Symbol | Meaning |
|--------|---------|
| `→` | User or assistant message |
| `·` | System message |
| `█` (flashing) | Cursor — shows where text is inserted |

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| **Enter** | Send message (when input is non-empty) |
| **Alt+Enter** | Insert a newline (multiline input) |
| **Up/Down** | Navigate message history (when input empty); navigate within multiline input |
| **Left/Right** | Move cursor within input |
| **Home** | Jump to start of current line |
| **End** | Jump to end of current line |
| **PgUp** | Scroll up through message history |
| **PgDn** | Scroll back down to latest messages |
| **Backspace** | Delete character before cursor |
| **Escape** | Cancel streaming response / clear input |
| **Ctrl+Q** / **Ctrl+C** | Quit chat |

### While streaming

| Key | Action |
|-----|--------|
| **Escape** | Cancel the current streaming response |
| All other keys | Blocked until streaming completes |

### Example chat session

```bash
# Launch chat
bun run index.ts chat

# Inside the chat:
# → You (12:00:01)
#   Write a fibonacci function
#   [Press Enter]
#
# → Aegis (streaming...)
#   Here's a fibonacci function...
#   [Text streams in real-time]
#
# → Aegis (12:00:03)
#   [Complete response]
#
#   [Continue the conversation...]
```

---

## 3. Daily Life Workflows

### Development session

```bash
# 1. Start with wakeup
aegis wakeup

# 2. Select Dashboard
# 3. Spawn development agents
$ spawn builder-1 --tag frontend
$ spawn reviewer-1

# 4. Switch to Chat for AI help
#    (launch a separate terminal)
aegis chat

# 5. Ask questions while watching agents in dashboard
```

### AI-assisted coding

```bash
# Terminal 1: Dashboard — monitor agent activity
aegis dash

# Terminal 2: Chat — talk to AI
aegis chat
```

### Debugging

```bash
# 1. Launch dashboard
aegis dash

# 2. Spawn a debug agent
$ spawn debugger --script src/agent/agent-worker.ts

# 3. Watch activity log for errors
#    (use Up/Down to scroll the log)

# 4. Kill and respawn if needed
$ kill debugger
$ spawn debugger --tag debug-session-2
```

---

## 4. Tips & Tricks

### Terminal requirements

- Minimum terminal size: **80x24** characters
- Requires a **TTY** (no piping or redirecting stdin)
- Supports any modern terminal emulator that handles ANSI escape codes (iTerm2, Windows Terminal, Alacritty, Kitty, etc.)

### Handling issues

| Problem | Fix |
|---------|-----|
| Dashboard doesn't render | Check terminal size — needs ≥80x24 |
| "Dashboard requires a TTY" | Run directly in a terminal, not via pipe/redirect |
| Agent won't spawn | Check the script path is correct, or use the default |
| Chat streaming is slow | Check your Anthropic API key and internet connection |
| Terminal left in weird state | Run `reset` or `stty sane` |
| Cursor disappeared | Run `tput cnorm` or `echo -e '\033[?25h'` |
| Colors look wrong | Make sure your terminal supports 24-bit color (`TERM=xterm-256color` or similar) |

### About the dirty flag

The TUI renders at **10fps (dashboard)** / **20fps (chat)**. It only redraws when the state changes (tracked by an internal `dirty` flag). This means:

- Typing feels responsive
- Streaming text updates smoothly
- CPU usage is minimal when idle

---

## 5. Command Reference (Quick Card)

### Dashboard

| Command | Alias | Args | Description |
|---------|-------|------|-------------|
| `spawn` | `s` | `<name> [--type <type>] [--script <path>] [--tag <tag>]` | Launch an agent |
| `kill` | `k` | `<name>` or `all` | Stop agent(s) |
| `list` | `ls` | — | List all agents |
| `status` | `st` | — | Show system info |
| `help` | `h` | — | Show commands |

### Keyboard

| Key | Dashboard | Chat |
|-----|-----------|------|
| Enter | Execute command | Send message |
| Ctrl+Q | Quit | Quit |
| Tab | Cycle focus | — |
| ↑↓ | Scroll log / history | History / multiline nav |
| ← → | — | Cursor movement |
| PgUp/PgDn | Scroll log ±10 | Scroll messages |
| Esc | — | Cancel stream / clear |
| Alt+Enter | — | Newline |
| Home/End | — | Line start/end |
| Backspace | Delete char | Delete char |

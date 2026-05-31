# Aegis TUI — Quick Reference Card

## Launch

| Mode | Command | Description |
|------|---------|-------------|
| Mode Launcher | `aegis` (no args) | Interactive mode selector |
| Interactive menu | `aegis wakeup` | Also opens mode launcher |
| Dashboard | `aegis dashboard` / `aegis dash` | Agent monitoring TUI |
| Chat | `aegis chat` / `aegis c` | AI conversation TUI |
| Status | `aegis status` | System info |
| Skills | `aegis skills` | Skills browser |
| Config | `aegis config` | Credential viewer |
| Cron | `aegis cron` | Scheduled jobs |
| Memory | `aegis memory` | Memory & facts |
| AgentMemory | `aegis agentmemory` / `aegis am` | Sidecar status & search |
| Agent | `aegis agent` | Agent list |
| Setup | `aegis setup` | Setup wizard |
| Serve | `aegis serve` | API server info |
| MCP | `aegis mcp` | MCP server info |

Or via bun: `bun run index.ts <command>`

---

## Mode Launcher Keyboard

| Key | Action |
|-----|--------|
| **↑** / **↓** | Navigate modes |
| **Enter** | Launch selected mode |
| **Ctrl+Q** / **Ctrl+C** | Quit |

## Info Screen Keyboard (status, skills, config, cron, memory, agent, serve, mcp)

| Key | Action |
|-----|--------|
| **↑** / **↓** | Scroll content |
| **PgUp** / **PgDn** | Scroll by 10 lines |
| **Esc** | Go back to mode launcher |
| **Ctrl+Q** / **Ctrl+C** | Quit |

---

## Dashboard — Layout

```
╭─ AEGIS DASHBOARD ──── v0.1.0  Ctrl+Q Quit ╮
│ AGENTS              │ ACTIVITY LOG           │
│ ● running-agent     │ ✓ Agent spawned        │
│ ● idle-agent        │ → Agent exited         │
│                     │ ✕ Error occurred       │
╰─ ● MEM:7% · ● CPU:0% · SESS:1 · UP:42m ──╯
$ <command input here>
```

### Dashboard — Keyboard

| Key | Action |
|-----|--------|
| **Tab** | Cycle focus: log → agents → command |
| **↑** / **↓** | Scroll activity log / Recall command history |
| **PgUp** / **PgDn** | Scroll log by 10 lines |
| **Enter** | Execute command |
| **Backspace** | Delete character |
| **Ctrl+Q** / **Ctrl+C** | Quit dashboard |

### Dashboard — Commands

| Command | Alias | Action |
|---------|-------|--------|
| `spawn <name>` | `s` | Launch an agent |
| `spawn <name> --type <type>` | | Launch with agent type (build, plan, etc.) |
| `spawn <name> --script <path>` | | Launch with custom script |
| `spawn <name> --tag <tag>` | | Launch with tags |
| `kill <name>` | `k` | Stop an agent by name |
| `kill all` | | Stop all running agents |
| `list` | `ls` | Show all agents (status, pid, uptime) |
| `status` | `st` | Show system info (version, runtime, memory, uptime) |
| `providers` | | List configured AI providers |
| `sessions` | | List saved chat sessions |
| `help` | `h` | Show commands |

---

## Chat — Layout

```
╭─ AEGIS CHAT ──────────── v0.1.0  Ctrl+Q Quit ╮
│ → You (12:00:01)                               │
│   Ask a question...                            │
│ → Aegis (streaming...)                         │
│   Response streaming here...                   │
│ │ input text█                                  │
│ · Enter to send | Alt+Enter newline | →→ history | Ctrl+Q quit
```

### Chat — Keyboard

| Key | Action |
|-----|--------|
| **Enter** | Send message |
| **Alt+Enter** | Insert newline (multiline) |
| **↑** / **↓** | Message history / Multiline navigation |
| **←** / **→** | Move cursor |
| **Home** / **End** | Jump to line start / end |
| **PgUp** / **PgDn** | Scroll message history |
| **Esc** | Cancel streaming / Clear input |
| **Ctrl+P** | Open model picker |
| **Backspace** | Delete character |
| **Ctrl+Q** / **Ctrl+C** | Quit chat |

### Chat — Slash Commands

| Command | Description |
|---------|-------------|
| `/provider list` | List available AI providers |
| `/provider set <name> [model=<model>]` | Switch provider |
| `/sessions list` | List saved sessions |
| `/sessions load <id>` | Resume a session |
| `/checkpoint <label>` | Create a checkpoint |
| `/rewind <id>` | Rewind to a checkpoint |
| `/shell` | Toggle shell mode |
| `/clear` | Clear chat |

---

## Status Indicators

### Agent List

| Symbol | Meaning |
|--------|---------|
| `●` green | Running / busy |
| `●` yellow | Idle (no active task) |
| `·` muted | Stopped |
| `✕` red | Error |

### Activity Log

| Symbol | Type |
|--------|------|
| `·` | Info message |
| `✓` | Success (spawned, recovered) |
| `→` | Event (exited, state change) |
| `!` | Warning (recovery, issues) |
| `✕` | Error (failure, crash) |

### Chat

| Symbol | Meaning |
|--------|---------|
| `→ You` | Your message |
| `→ Aegis` | AI response |
| `·` | System message |
| `█` | Cursor position |
| `Streaming...` | Response in progress |

---

## Requirements

- Terminal ≥ **80×24**
- **TTY** required (no pipes)
- ANSI escape code support
- **Chat only:** `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` env var

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Weird terminal state | `reset` or `stty sane` |
| Cursor missing | `tput cnorm` |

# Aegis TUI Platform — Design Spec

**Project:** neuron-os / Aegis  
**Date:** 2026-05-30  
**Status:** Approved design, ready for implementation  

## Overview

Aegis is "The Operating System for Autonomous AI Agents." This spec covers the first three phases of the TUI platform: CLI Core + Branding, Interactive Wizard System, and Dashboard TUI. These form the user-facing surface of Aegis before the agent runtime engine is built beneath it.

---

## Phase 1: CLI Core + Branding

### Purpose

Establish the CLI binary, visual identity, command tree, and output conventions — everything that makes Aegis feel like a coherent terminal product.

### Color Palette

| Token | Hex | Usage |
|---|---|---|
| `accent` | `#00D4AA` | Headings, branding |
| `accentBright` | `#00F0C8` | Highlights |
| `info` | `#5BABFF` | Informational |
| `success` | `#2FBF71` | Success states |
| `warn` | `#FFB020` | Warnings |
| `error` | `#E23D2D` | Errors |
| `muted` | `#8B8F97` | Secondary text |

### Banner

- `figlet.textSync("AEGIS", { font: "Big" })` rendered in accent teal
- Below: `v0.1.0 — The Operating System for Autonomous AI Agents` in muted gray
- Only emits on TTY (not pipes/`--json`/`--plain`)
- Emits once per session (singleton flag)
- No emoji — pure typography

### CLI Output Conventions

- `theme.heading()` — bold teal for section titles
- `theme.info()` — blue for informational text
- `theme.success()` — green for success messages
- `theme.warn()` — amber for warnings
- `theme.error()` — red for errors
- `theme.muted()` — gray for hints, secondary info, help text
- `NO_COLOR` env var respected (disables all styling)
- `--json` flag suppresses all non-JSON output
- `--plain` flag disables ANSI styling (for piping)

### Command Tree (commander)

```
Aegis <command>

Commands:
  wakeup        Show banner and enter interactive mode
  setup         Configure and initialize Aegis workspace
  dashboard     Open live dashboard TUI
  agent         Manage AI agents (stub)
  chat          Open chat TUI (stub)
  status        Quick system status overview
  help          Display help

Global Options:
  --json        JSON output
  --plain       No ANSI styling
  -V, --version Show version
```

### Stub Commands

`setup`, `dashboard`, `agent`, `chat` register as Commander commands with `action()` stubs that print `theme.info("Coming soon...")`. This establishes the full tree from day one so users see a complete product.

### Files

```
src/
├── index.ts                    # Entry: commander setup, program.parseAsync
├── cli/
│   ├── banner.ts               # figlet banner + singleton guard
│   ├── palette.ts              # Color token constants
│   ├── theme.ts                # Chalk wrapper mapping tokens to semantic roles
│   ├── guard.ts                # guardCancel() for @clack prompts
│   └── commands/
│       ├── index.ts            # registerAllCommands(program)
│       ├── wakeup.ts           # Banner → prompt for mode
│       ├── setup.ts            # Stub
│       ├── dashboard.ts        # Stub
│       ├── agent.ts            # Stub
│       ├── chat.ts             # Stub
│       └── status.ts           # Quick system status
```

### Dependencies

- Add `picocolors` (lightweight ANSI, already used by @clack internally)

---

## Phase 2: Interactive Wizard System

### Purpose

A reusable abstraction for all interactive flows. Wizard logic is written against a `WizardPrompter` interface — the same code works in terminal, HTTP, or test environments.

### WizardPrompter Interface

```ts
interface WizardPrompter {
  intro(title: string): Promise<void>
  outro(msg: string): Promise<void>
  note(text: string, title?: string): Promise<void>
  select<T>(params: { message: string; options: Option<T>[]; initialValue?: T }): Promise<T>
  multiselect<T>(params: { message: string; options: Option<T>[]; initialValues?: T[] }): Promise<T[]>
  text(params: { message: string; placeholder?: string; defaultValue?: string; validate?: (v: string) => string | undefined }): Promise<string>
  confirm(params: { message: string; initialValue?: boolean }): Promise<boolean>
  progress(label: string): { start(msg: string): void; message(msg: string): void; stop(msg: string): void }
}
```

### ClackPrompter Implementation

- Wraps every `@clack/prompts` call
- `guardCancel()` wraps each prompt — Ctrl+C throws `WizardCancelledError` (typed error)
- `progress()` wraps clack's `spinner()` with `.start()`/`.stop()`/`.message()`
- Optional `MockPrompter` in test mode with `vi.fn()` stubs

### GuardCancel Pattern

```ts
function guardCancel<T>(value: T | symbol): T {
  if (isCancel(value)) throw new WizardCancelledError()
  return value
}
```

All top-level flow handlers catch `WizardCancelledError` and clean up with `cancel()` + `process.exit(0)`.

### Flows

**`aegis setup`**:
1. `intro("Aegis Setup")` with security note
2. `text` — Workspace directory (`~/.aegis` default)
3. `select` — Default model provider (Claude, GPT, Ollama, DeepSeek, or custom)
4. `text` — Agent name (`"main"` default)
5. `confirm` — Start gateway on boot?
6. `progress` — Apply configuration (write JSON to disk)
7. `outro("Setup complete!")`

**`aegis onboard`** (future — in Phase 6):  
QuickStart (sensible defaults, minimal prompts) vs Advanced (every knob exposed). Uses same Prompter interface.

### Files

```
src/wizard/
├── types.ts                  # WizardPrompter interface + WizardCancelledError
├── clack-prompter.ts         # ClackPrompter implementation
├── guard.ts                  # guardCancel() re-export
└── flows/
    ├── index.ts              # Flow registry
    ├── setup.ts              # aegis setup flow
    └── onboard.ts            # aegis onboard flow (stub)
```

### Dependencies

- `@clack/prompts@^1.4` (already in package.json)

---

## Phase 3: Dashboard TUI

### Purpose

Live full-screen terminal dashboard showing agent status, activity log, system metrics, and keyboard-driven command input.

### Approach

Custom ANSI render loop — no heavy widget library. This keeps the binary small and gives us full control.

### Screen Layout

```
┌────────────────────────────────────────────────────────┐
│  AEGIS DASHBOARD                       v0.1.0  Ctrl+Q  │  header bar (accent bg)
├──────────────┬─────────────────────────────────────────┤
│  AGENTS      │  ACTIVITY LOG                           │
│  ┌────────┐  │  12:00:23  agent main → idle            │
│  │ main   │  │  12:00:01  agent worker-1 → running     │
│  │ ● idle │  │  11:59:55  tool call: bash "npm test"   │
│  └────────┘  │  11:59:50  session abc123 created       │
│  ┌────────┐  │                                         │
│  │worker-1│  │  (scrollable, newest at bottom)         │
│  │ ● run  │  │                                         │
│  └────────┘  │                                         │
│  ┌────────┐  │                                         │
│  │worker-2│  │                                         │
│  │ ○ stop │  │                                         │
│  └────────┘  │                                         │
├──────────────┴─────────────────────────────────────────┤
│  MEM: 46%  │  CPU: 12%  │  SESSIONS: 3  │  UPTIME: 2h  │  status bar (muted)
├────────────────────────────────────────────────────────┤
│  > _                                                    │  command bar (accent prompt)
└────────────────────────────────────────────────────────┘
```

### Keybindings

| Key | Action |
|---|---|
| `↑/↓` | Scroll activity log |
| `PgUp/PgDn` | Page scroll activity log |
| `Tab` | Cycle focus: log → agent list → command bar |
| `Enter` | Submit command in command bar |
| `Ctrl+Q` | Quit dashboard |
| `Ctrl+L` | Clear log |
| `Esc` | Deselect / close |

### Render Loop

```
loop:
  store.update()                     # Poll metrics, check agent states
  screen = compose(store)            # Build frame string
  ansiEscapes.eraseScreen()
  process.stdout.write(screen)
  wait(frameTime)                    # ~100ms for 10fps
  key = readKey()                    # Non-blocking via stdin raw mode
  handle(key)
```

- 10fps render rate (100ms frame time)
- Only re-render if state changed (dirty flag)
- On frame render: cursor to (0,0), redraw content regions, redraw borders only if needed

### Components

**Header** — Top bar line, accent-background, title left-aligned, version + quit hint right-aligned.

**Agent List** — Cards for each agent. Agent card shows name, status indicator (`● running` green, `● idle` yellow, `○ stopped` gray, `✕ error` red), optional tool-typing indicator. Only visible agents listed; empty state shows "No agents running" in muted.

**Activity Log** — Scrollable list of timestamped events. Events: agent state changes, tool calls, session events, errors. Max ~1000 entries in ring buffer; older ones evicted. Scroll offset tracked in store.

**Status Bar** — Thin bar with key-value metrics separated by `│`. Metrics: MEM%, CPU%, session count, uptime. Updated every render tick via polling.

**Command Bar** — Single input line at bottom. `>` prompt in accent. Inline editing with cursor. History (↑ to recall previous commands). Only simple commands initially; future can route to agent.

### Store (State)

```ts
interface Store {
  agents: Map<string, AgentState>
  log: LogEntry[]
  metrics: { mem: number; cpu: number; sessionCount: number; uptime: number }
  ui: { logScroll: number; focus: 'log' | 'agents' | 'command'; input: string; history: string[] }
}
```

### Data Flow

- `store.ts` holds plain mutable state
- Components read from store, render functions produce string regions
- Render tick: measure widths → compose regions → write to stdout
- Input handler mutates store.ui, triggers re-render
- Metrics timer (every 2s) reads `process.memoryUsage()` + `os.cpus()`, pushes to store.metrics
- Agent state updates come from event system (stub in Phase 3 — hardcoded demo data by default)

### Files

```
src/tui/
├── renderer.ts              # Render loop: clear → compose → write
├── layout.ts                # Region dimensions, split calculations
├── components/
│   ├── header.ts            # Top bar
│   ├── agent-list.ts        # Agent card list
│   ├── activity-log.ts      # Scrollable event stream
│   ├── status-bar.ts        # Metrics bar
│   └── command-bar.ts       # Input line
├── store.ts                 # Shared state + update helpers
└── input.ts                 # Raw mode stdin → key events
```

### Dependencies

- `ansi-escapes` — cursor positioning, screen erase, alternate screen
- `cli-truncate` — truncate strings to terminal width
- `@types/node` (already in package.json) — `process.stdin.setRawMode()`

---

## Implementation Order

| Step | Phase | What | Deps |
|---|---|---|---|
| 1 | P1 | `palette.ts`, `theme.ts`, `guard.ts` | `picocolors` |
| 2 | P1 | `banner.ts` + singleton | `figlet` (have) |
| 3 | P1 | `commands/index.ts` — register all stubs | — |
| 4 | P1 | `index.ts` — wire up commander | `commander` (have) |
| 5 | P1 | `wakeup.ts` — banner + prompt cycle | Step 2 |
| 6 | P1 | `status.ts` — quick status (version, uptime, config path) | Step 1 |
| 7 | P2 | `wizard/types.ts` — WizardPrompter interface | — |
| 8 | P2 | `wizard/clack-prompter.ts` — implementation | `@clack/prompts` (have) |
| 9 | P2 | `wizard/flows/setup.ts` — setup flow | Step 8 |
| 10 | P3 | `tui/store.ts` — state + update helpers | — |
| 11 | P3 | `tui/layout.ts` — region calculations | — |
| 12 | P3 | `tui/components/*.ts` — all 5 components | `ansi-escapes`, `cli-truncate` |
| 13 | P3 | `tui/input.ts` — keyboard handler | — |
| 14 | P3 | `tui/renderer.ts` — main loop | Steps 10-13 |
| 15 | P3 | Wire `dashboard` command to launch TUI | Step 14 |

---

---

## Full Vision: Aegis Platform (Phases 4-10)

Incorporating features from OpenClaw, Hermes, OpenCode, and Claude Code.

### Phase 4: Agent Runtime Engine
- Agent lifecycle: spawn, manage, kill, monitor
- Session persistence (JSONL transcripts with compaction)
- Multi-agent routing (route channels/groups to specialized agents)
- Sub-agent spawning and delegation (OpenClaw `sessions_spawn` pattern)
- Build/Plan agent modes (OpenCode Tab-to-switch pattern)
- @-mention subagent invocation (OpenCode pattern)
- Profile isolation — multiple concurrent agent profiles (Hermes pattern)

### Phase 5: Tool System
- Built-in tools: `bash`, `read`, `write`, `edit`, `grep`, `glob`, `web_fetch`, `web_search`
- MCP (Model Context Protocol) integration — stdio/SSE/HTTP transports
- Tool policy engine: allow/deny with glob patterns (Claude Code pattern)
- Tool profiles: minimal, coding, messaging, full (OpenClaw pattern)
- Tool groups for batch permission control
- LSP integration for code intelligence (OpenCode pattern)

### Phase 6: Chat TUI
- Full-screen chat interface with streaming responses
- Slash commands: `/help`, `/status`, `/model`, `/agent`, `/session`, `/compact`, `/new`
- Model picker overlay (Ctrl+L), agent picker (Ctrl+G), session picker (Ctrl+P)
- Tool cards with collapsible args/results
- Local shell execution (`!command` prefix)
- Checkpoints + rewind (Esc+Esc) (Claude Code pattern)
- Color-coded subagent identification

### Phase 7: Skill System
- SKILL.md format with YAML frontmatter (agentskills.io standard)
- Skill discovery from multiple locations (workspace, project, personal, managed)
- On-demand skill injection into agent context
- Skill gating: binary requirements, env vars, OS filters
- Skill registry (ClawHub-compatible)
- Hot-reload on SKILL.md file changes

### Phase 8: Memory System
- MEMORY.md — long-term durable facts
- Daily logs (`memory/YYYY-MM-DD.md`) — running context
- Auto memory — learnings saved across sessions (Claude Code pattern)
- Vector search for semantic recall (OpenClaw pattern)
- Dreaming consolidation — background sort/score/promote (OpenClaw pattern)
- Memory nudges — periodic prompts to persist knowledge (Hermes pattern)
- Path-scoped rules (Claude Code `.claude/rules/` pattern)

### Phase 9: Multi-Channel Gateway
- WebSocket control plane (`:18789`)
- Channel adapters: Telegram, Discord, Slack (start with 3, expand)
- Session routing: main, per-peer, per-channel-peer
- DM pairing with approval codes
- Webhooks for external event triggers
- Voice mode (Hermes pattern)

### Phase 10: Advanced Features
- **Hooks system** — deterministic lifecycle events (Claude Code pattern): PreToolUse, PostToolUse, SessionStart, Stop, etc.
- **Learning loop** — autonomous skill creation from experience, self-improvement (Hermes pattern)
- **Cron scheduler** — scheduled agent tasks with delivery to any channel
- **Agent teams** — parallel coordinated agents with shared tasks (Claude Code pattern)
- **Canvas** — live agent-controlled visual workspace
- **Plugin marketplace** — distributable plugin bundles
- **Terminal backends** — local, Docker, SSH, Modal, Daytona (Hermes pattern)
- **Background agents** — parallel sessions with supervisor process

### Architecture Overview (Full Platform)

```
Aegis Platform
├── CLI Layer (commander + @clack/prompts)
│   ├── Commands: wakeup, setup, dashboard, agent, chat, status
│   ├── Banner (figlet) + Theme (picocolors)
│   └── Wizard System (WizardPrompter abstraction)
│
├── TUI Layer (custom ANSI render loop)
│   ├── Dashboard — agent cards, activity log, metrics
│   └── Chat — streaming, slash commands, tool cards
│
├── Agent Runtime
│   ├── Agent Loop — context assembly, model invocation, tool execution
│   ├── Session Manager — JSONL transcripts, compaction, branching
│   ├── Sub-agent Spawner — isolated delegation
│   └── Provider Resolution — multi-provider with failover
│
├── Tool System
│   ├── Built-in Tools — bash, read, write, edit, grep, glob, web
│   ├── MCP Integration — stdio/SSE/HTTP transports
│   ├── Tool Policy Engine — allow/deny with globs
│   └── LSP Integration — code intelligence
│
├── Skill System
│   ├── SKILL.md Loader — discovery, gating, injection
│   ├── Skill Registry — ClawHub-compatible
│   └── Hot-reload — file watcher
│
├── Memory System
│   ├── MEMORY.md + Daily Logs
│   ├── Auto Memory + Vector Search
│   ├── Dreaming Consolidation
│   └── Path-scoped Rules
│
├── Gateway (WebSocket control plane)
│   ├── Channel Adapters — Telegram, Discord, Slack
│   ├── Session Router — per-peer, per-channel
│   ├── Cron Scheduler — scheduled tasks
│   └── Webhooks — external event triggers
│
├── Hooks System
│   ├── Lifecycle Events — PreToolUse, PostToolUse, SessionStart, etc.
│   └── Handler Types — command, http, mcp_tool
│
└── Learning Loop
    ├── Autonomous Skill Creation
    ├── Self-improvement
    └── Memory Nudges
```

---

## Non-Goals (for this spec revision)

- Testing framework — deferred to implementation plan
- Desktop/mobile companion apps — future consideration
- Voice mode — Phase 10

## Self-Review Notes

- Phases 1-3 fully specified with files, interfaces, and responsibilities
- Phases 4-10 described at feature level — each gets its own detailed spec when implementation begins
- Palette and theme conventions are consistent across all phases
- Architecture diagram shows full platform composition
- Feature sources attributed: OpenClaw (gateway, skills, memory), Hermes (learning loop, backends), OpenCode (agent modes, LSP), Claude Code (hooks, checkpoints, permissions)

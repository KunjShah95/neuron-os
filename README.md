# Aegis — Neuron OS

The Aegis project (a.k.a. "Neuron OS") is a terminal-first platform that orchestrates autonomous AI agents, provides a streaming Chat TUI, and a live Dashboard for monitoring agent activity.

This README provides a comprehensive developer- and user-friendly guide: quickstart, configuration, development workflow, architecture, and troubleshooting.

Status: v0.1.0 • Technology: Bun + TypeScript (strict)

---

## Table of Contents

- Overview
- Key features
- Quick start
- Configuration (env variables)
- Usage & CLI commands
- Development & tests
- Project structure
- Architecture (high-level)
- Troubleshooting & FAQ
- Contributing
- License & Contacts

---

## Overview

Aegis is designed to run multiple autonomous agents locally in lightweight worker processes, coordinate them through a central AgentManager, and surface real-time telemetry and logs in a curses-like Terminal UI (TUI). It also includes a streaming Chat UI that connects to LLM providers.

Use cases: local autonomous workflows, human-in-the-loop code generation, research orchestration, CI helper agents, and interactive experimentation.

---

## Key features

- Live Dashboard TUI: monitor agents, view activity log, spawn/kill agents interactively
- Streaming Chat TUI: low-latency streaming responses from supported LLM providers
- Agent types: build, plan, read, write, test, validate, review, debug, document, refactor, deploy, monitor, explore
- Hook system: register pre/post hooks for lifecycle events
- Auto-recovery: respawn crashed agents with exponential backoff
- JSON-line IPC: structured stdin/stdout messages between parent and worker
- Multi-provider support: Anthropic, OpenAI, Ollama, and configurable custom endpoints
- Developer-friendly: strict TypeScript, modular packages, and a setup wizard

---

## Quick start

Prerequisites

- Bun (recommended) — <https://bun.sh> (v1.3.14+)
- Node.js is optional; Bun runs scripts directly

Clone and install

```bash
git clone <repo-url> neuron-os
cd "neuron os"
bun install
```

Run the interactive launcher

```bash
bun run index.ts wakeup
```

Start the Dashboard (agent monitor)

```bash
bun run index.ts dashboard
```

Start the Chat (streaming AI)

```bash
bun run index.ts chat
```

Tip: run `bun run index.ts --help` to see the top-level options.

---

## Configuration (environment variables)

Create a `.env` at project root or export env vars in your shell. Common variables:

- ANTHROPIC_API_KEY — API key for Anthropic (chat streaming provider)
- OPENAI_API_KEY — OpenAI key (optional, if using OpenAI provider)
- OLLAMA_URL — Base URL for Ollama local model server (optional)
- AEGIS_DEFAULT_PROVIDER — default provider: `anthropic|openai|ollama|custom`
- AEGIS_LOG_LEVEL — `debug|info|warn|error` (default: `info`)

Example `.env`:

```env
ANTHROPIC_API_KEY=sk-xxx
AEGIS_DEFAULT_PROVIDER=anthropic
AEGIS_LOG_LEVEL=debug
```

Provider configuration notes

- Anthropic: set `ANTHROPIC_API_KEY`. Streaming is via SSE.
- OpenAI: set `OPENAI_API_KEY` and configure model in settings.
- Ollama: set `OLLAMA_URL` to your local Ollama server (e.g. `http://localhost:11434`).

---

## Usage & CLI commands

Top-level entry: `index.ts` (Commander-based CLI). You can run commands through Bun or, after global linking, via the `aegis` command.

Common commands

- `wakeup` — interactive launcher (alias: `w`)
- `dashboard` — open the live agent dashboard (alias: `dash`)
- `chat` — open the streaming chat UI (alias: `c`)
- `agent ...` — agent management subcommands
- `setup` — interactive setup wizard
- `status` — quick system status (alias: `st`)

Agent subcommands (examples)

- `agent types` — list available agent types
- `agent list [--status <status>]` — list agents
- `agent spawn <name> [--type <type>] [--script <path>] [--tag <tag>]` — spawn a worker
- `agent kill <name> [--force]` — stop an agent
- `agent logs <name> [--tail N] [--follow]` — view logs

Dashboard hotkeys

- Tab — cycle focus (agents / log / command)
- Enter — execute command
- Ctrl+Q / Ctrl+C — quit

See `docs/tui-usage.md` for a full TUI walkthrough (screenshots, keybindings, commands).

---

## Development & tests

Install dependencies (already shown in Quick start) and then:

Run typecheck + build

```bash
bun run tsc --noEmit
```

Run unit / integration tests (project includes a test runner script)

```bash
bun run scripts/run-tests.ts
```

Linting

```bash
bun run eslint .
```

Formatting

```bash
bun run prettier --write .
```

Running the TUI during development

```bash
NODE_ENV=development bun run index.ts dashboard
```

Notes for Windows users

- Bun on Windows is supported; ensure terminal supports ANSI (Windows Terminal recommended).
- If you see issues with app imports or path resolution, run Bun from the project root and verify `tsconfig.json`'s `baseUrl` and `paths`.

---

## Project structure

Key folders (top-level):

- `src/` — main TypeScript source
  - `agent/` — Agent manager, worker entry, lifecycle hooks
  - `cli/` — CLI command definitions
  - `tui/` — dashboard renderer and components
  - `chat/` — chat renderer and provider integrations
  - `skills/` — tool wrappers and skill registry
- `packages/` — workspace packages (eslint-config, typescript-config, ui)
- `docs/` — user-facing docs and cheatsheets (see `tui-usage.md`)
- `scripts/` — utility scripts (tests, builds)

---

## Architecture (high level)

- Entrypoint: `index.ts` registers CLI commands and dispatches to modules.
- AgentManager: spawns worker processes (Bun subprocesses) and manages IPC.
- TUI Renderer: subscribes to AgentManager events and renders state at a controlled framerate.
- Chat: performs SSE streaming to providers and updates the TUI input/stream area.

Data & IPC

- Parent ↔ Worker: JSON-lines over stdin/stdout
- Worker logs: stderr (plain text) and structured `log` messages via IPC

---

## Troubleshooting & FAQ

Q: Dashboard doesn't render / shows 'requires a TTY'

A: Ensure you run in an interactive terminal (no piping). Terminal size must be >= 80x24. Use Windows Terminal / PowerShell / WSL.

Q: Chat streaming is slow or times out

A: Check network and provider keys. For Anthropic, confirm `ANTHROPIC_API_KEY` is valid and not rate-limited.

Q: Agent won't spawn or exits immediately

A: Inspect worker logs with `agent logs <name>`; verify the worker script path and TypeScript build. Ensure `bun run tsc` passes.

Q: Cursor / terminal left in weird state after crash

A: Run `reset` or `stty sane` (Linux/WSL). On Windows, close terminal or run `tput cnorm` to restore cursor.

---

## Contributing

We welcome contributions. Please follow this workflow:

1. Fork the repo and create a branch: `feature/<short-description>`
2. Run tests and linters locally
3. Keep changes focused and add tests for new behavior
4. Open a PR with a clear description and reference any issues

Developer guidelines

- Follow the TypeScript strict config
- Add unit tests for behavioral changes
- Keep CLI UX consistent — update `docs/tui-usage.md` when changing commands or hotkeys

---

## License

This project is licensed under the MIT License. See `LICENSE` for details.

---

## Maintainers & Contact

- Primary maintainer: Project team
- For questions: open an issue in this repository

---

If you'd like, I can also:

- generate a compact `CONTRIBUTING.md`
- add a `docs/README-QUICKSTART.md` with screenshots and common workflows
- replace or extend the ASCII banner in this README

Tell me which of the above you'd like next and I'll implement it.

Aegis agents operate with the same filesystem and process permissions as the user running the CLI. The security model relies on **tool permission scoping** per agent type:

| Agent Type | Allowed Tools | Restrictions |
|-----------|---------------|--------------|
| `build`, `debug` | All tools | None -- full access |
| `plan`, `read`, `review`, `explore` | read, grep, glob | Read-only, no file writes or command execution |
| `write`, `refactor`, `document` | read, write, edit | No command execution |
| `test` | bash, read | Bash restricted to test commands (npm test, pytest, jest, bun test, vitest, etc.) |
| `validate` | read, bash | Bash restricted to lint/typecheck commands (npm run lint, tsc --noEmit, eslint, etc.) |
| `deploy` | bash, read | Bash restricted to deploy commands (docker, kubectl, terraform, git push, etc.) |
| `monitor` | bash, read | No write access |

**Important considerations:**

- Agents inherit the full environment of the parent process
- Worker scripts run as Bun subprocesses with user-level permissions
- The `setup` wizard displays a security warning about privileged access
- Tool permissions are defined in `src/agent/agent-types.ts` and enforced at the type level

---

## Chat Provider Setup

### Anthropic (Default)

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. Set the environment variable:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Or create a `.env` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

1. Run the chat:

```bash
bun run index.ts chat
```

**Default model:** `claude-sonnet-4-20250514`
**Default max tokens:** 8192

### Other Providers

The setup wizard (`bun run index.ts setup`) supports selecting from:

| Provider | Status |
|----------|--------|
| Anthropic | Fully supported |
| OpenAI | Planned |
| Ollama | Planned |
| DeepSeek | Planned |
| Custom endpoint | Planned |

Currently, only Anthropic streaming is implemented in the chat provider (`src/chat/provider.ts`). Additional providers are on the roadmap.

---

## Project Structure

```
neuron-os/
├── index.ts                    # CLI entry point (Commander program)
├── package.json                # Dependencies and bin config
├── tsconfig.json               # TypeScript config (strict, ESNext, Bun types)
├── bun.lock                    # Bun lockfile
│
├── src/
│   ├── agent/                  # Agent system core
│   │   ├── agent-types.ts      # 13 agent type definitions with tool permissions
│   │   ├── agent-worker.ts     # Default worker process (IPC event loop)
│   │   ├── hooks.ts            # HookRegistry class (lifecycle hooks)
│   │   ├── index.ts            # Public exports
│   │   ├── manager.ts          # AgentManager (spawn, kill, IPC, recovery, heartbeats)
│   │   └── types.ts            # Core types (AgentDef, AgentInstance, AgentEvent, etc.)
│   │
│   ├── chat/                   # Chat TUI
│   │   ├── components/         # UI components (header, messages, input-area)
│   │   │   ├── header.ts
│   │   │   ├── index.ts
│   │   │   ├── input-area.ts
│   │   │   └── messages.ts
│   │   ├── input.ts            # Input handling
│   │   ├── layout.ts           # Layout calculations
│   │   ├── provider.ts         # Anthropic API streaming client
│   │   ├── renderer.ts         # Terminal rendering loop
│   │   ├── store.ts            # Chat state (messages, UI, streaming)
│   │   └── utils.ts            # Utilities
│   │
│   ├── cli/                    # CLI framework
│   │   ├── commands/           # Command handlers
│   │   │   ├── agent.ts        # Agent management commands
│   │   │   ├── chat.ts         # Chat command
│   │   │   ├── dashboard.ts    # Dashboard command
│   │   │   ├── index.ts        # Command registration
│   │   │   ├── setup.ts        # Setup command
│   │   │   ├── status.ts       # Status command
│   │   │   └── wakeup.ts       # Wakeup command (interactive launcher)
│   │   ├── banner.ts           # Figlet ASCII banner
│   │   ├── guard.ts            # Input validation and cancel handling
│   │   ├── palette.ts          # Color palette definitions
│   │   └── theme.ts            # Themed output helpers (heading, accent, success, etc.)
│   │
│   ├── tui/                    # Dashboard TUI
│   │   ├── components/         # UI components
│   │   │   ├── activity-log.ts # Scrolling activity log panel
│   │   │   ├── agent-list.ts   # Agent status list panel
│   │   │   ├── command-bar.ts  # Command input bar
│   │   │   ├── header.ts       # Dashboard header
│   │   │   ├── index.ts        # Component exports
│   │   │   └── status-bar.ts   # System metrics status bar
│   │   ├── commands.ts         # Dashboard command handlers
│   │   ├── input.ts            # Input handling
│   │   ├── layout.ts           # Layout calculations
│   │   ├── renderer.ts         # Terminal rendering loop
│   │   └── store.ts            # Dashboard state + agent event bridge
│   │
│   └── wizard/                 # Setup wizards
│       ├── flows/
│       │   └── setup.ts        # Setup flow (workspace, provider, agent name)
│       ├── clack-prompter.ts   # @clack/prompts adapter
│       ├── index.ts            # Public exports
│       └── types.ts            # WizardPrompter interface
│
├── agent-tui-ref/              # Reference Turborepo project (excluded from tsconfig)
│   ├── apps/                   # Next.js apps (docs, web)
│   ├── packages/               # Shared packages (ui, eslint-config, typescript-config)
│   └── turbo.json
│
└── docs/                       # Documentation
    └── superpowers/
        ├── specs/              # Design specifications
        └── plans/              # Implementation plans
```

---

## API Reference

### AgentManager

The core class for managing agent lifecycle. Available as a singleton via `agentManager`.

```typescript
import { agentManager } from "./src/agent/manager"
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `spawn` | `(def: AgentDef) => Promise<string>` | Spawn a new agent worker process. Returns the agent ID. |
| `kill` | `(id: string, timeoutMs?: number) => Promise<void>` | Graceful shutdown (SIGTERM), then SIGKILL after timeout. Cancels pending recovery. |
| `sendIpc` | `(id: string, msg: AgentIpcMessage) => void` | Send a JSON-line IPC message to the agent via stdin. |
| `ping` | `(id: string) => void` | Send a heartbeat ping to check aliveness. |
| `get` | `(id: string) => AgentInstance \| undefined` | Get an agent instance by ID. |
| `list` | `(filter?: { status?, tag?, agentType? }) => AgentInstance[]` | List agents with optional filtering. |
| `getLogs` | `(id: string, opts?: { level?, tail? }) => AgentLogEntry[]` | Get agent log entries with optional filtering. |
| `onEvent` | `(cb: (event: AgentEvent) => void) => void` | Register an event listener. |
| `offEvent` | `(cb: (event: AgentEvent) => void) => void` | Remove an event listener. |
| `getAvailableTypes` | `() => AgentType[]` | Get all registered agent types. |
| `destroy` | `() => Promise<void>` | Kill all agents, clear timers and state. |

### HookRegistry

Registry for agent lifecycle hooks. Available on `AgentManager.hooks` or as singleton `globalHooks`.

```typescript
import { globalHooks } from "./src/agent/hooks"
```

| Method | Signature | Description |
|--------|-----------|-------------|
| `register` | `(point: HookPoint, phase: HookPhase, fn: HookFn, opts?: { priority?, label? }) => this` | Register a hook. Higher priority runs first. |
| `unregister` | `(label: string) => this` | Remove all hooks matching a label. |
| `run` | `(point, phase, agentId, instance, data?) => Promise<Record<string, unknown>>` | Execute all matching hooks in priority order. |
| `clear` | `() => void` | Remove all hooks. |
| `size` | `get: number` | Number of registered hooks. |

### Key Types

```typescript
// Agent definition (input to spawn)
interface AgentDef {
  name: string
  script: string
  agentType?: AgentTypeName
  tools?: ToolPermission[]
  env?: Record<string, string>
  args?: string[]
  stopTimeout?: number
  limits?: { cpu?: number; memoryMB?: number }
  tags?: string[]
  recovery?: RecoveryConfig
}

// Runtime agent instance
interface AgentInstance {
  id: string
  def: AgentDef
  status: AgentStatus  // "spawning" | "running" | "idle" | "busy" | "stopping" | "stopped" | "error"
  process: Subprocess
  spawnTime: number
  lastActivity: number
  log: AgentLogEntry[]
  pid: number
  exitCode: number | null
  metadata: Record<string, string>
}

// Events emitted by AgentManager
interface AgentEvent {
  type: AgentEventType
  // "agent:spawned" | "agent:ready" | "agent:stopped" | "agent:error" |
  // "agent:log" | "agent:heartbeat" | "agent:exit" |
  // "agent:recovering" | "agent:recovered" | "agent:maxRetries"
  agentId: string
  data?: unknown
}

// IPC message format
interface AgentIpcMessage {
  type: string
  id?: string
  payload?: unknown
  timestamp: number
}

// Auto-recovery config
interface RecoveryConfig {
  maxRetries?: number     // default: 5
  backoffMs?: number      // default: 1000
  backoffMultiplier?: number  // default: 2
  backoffMax?: number     // default: 60000
}
```

---

## Development

### Running in Dev Mode

```bash
bun run index.ts <command>
```

### Adding a New Command

1. Create a new file in `src/cli/commands/`:

```typescript
// src/cli/commands/my-command.ts
import type { Command } from "commander"
import { theme } from "../theme"

export function registerMyCommand(program: Command) {
  program
    .command("my-command")
    .alias("mc")
    .description("My new command")
    .action(async () => {
      console.log(theme.success("Hello from my-command"))
    })
}
```

1. Register it in `src/cli/commands/index.ts`:

```typescript
import { registerMyCommand } from "./my-command"

export function registerAllCommands(program: Command) {
  // ... existing registrations
  registerMyCommand(program)
}
```

### Adding a New Agent Type

Add a new entry to `AGENT_TYPES` in `src/agent/agent-types.ts`:

```typescript
// 1. Add the type name to AgentTypeName union
export type AgentTypeName = ... | "my-type"

// 2. Add the type definition
export const AGENT_TYPES: Record<AgentTypeName, AgentType> = {
  // ... existing types
  "my-type": {
    name: "my-type",
    mode: "subagent",
    description: "My custom agent type",
    tools: READ_ONLY_TOOLS,
    systemPrompt: "You are a specialized agent for...",
  },
}
```

### Adding TUI Components

Dashboard components go in `src/tui/components/`. Chat components go in `src/chat/components/`.

Each component exports a render function that takes state and returns ANSI-formatted strings.

### Code Conventions

- TypeScript strict mode with `noUncheckedIndexedAccess`
- Bun runtime (no Node.js-specific APIs unless cross-compatible)
- ESNext target, bundler module resolution
- No comments unless explicitly needed
- Follow existing patterns in neighboring files

---

## Deployment

### Bundle for Distribution

```bash
bun build index.ts --target=bun --outfile=dist/aegis.js
```

### Compile to Standalone Binary

```bash
bun build index.ts --compile --outfile=aegis
./aegis wakeup
```

### Publish via npm/bun

The `package.json` `bin` field is pre-configured:

```json
{
  "bin": {
    "Aegis-build": "./index.ts",
    "Aegis": "./index.ts"
  }
}
```

Install globally from the project directory:

```bash
bun link
```

This makes `Aegis` and `Aegis-build` available as global commands.

---

## Configuration

### Environment Variables

| Variable | Required | Auto-set | Description |
|----------|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For chat | No | Anthropic API key for chat provider |
| `AEGIS_AGENT_ID` | No | Yes | Unique agent instance ID |
| `AEGIS_AGENT_NAME` | No | Yes | Agent display name |
| `AEGIS_AGENT_TYPE` | No | Yes | Agent type name (build, plan, etc.) |
| `AEGIS_SYSTEM_PROMPT` | No | Yes | System prompt injected for the agent |
| `AEGIS_MODEL_HINT` | No | Yes | Model preference (e.g., claude-opus-4) |
| `AEGIS_MAX_TURNS` | No | Yes | Maximum conversation turns |
| `AEGIS_TEMPERATURE` | No | Yes | Model temperature setting |

### Setup Wizard Options

The `aegis setup` wizard configures:

| Option | Default | Description |
|--------|---------|-------------|
| Workspace directory | `~/.aegis` | Where Aegis stores its data |
| Default provider | `anthropic` | AI provider (anthropic, openai, ollama, deepseek, custom) |
| Agent name | `main` | Default agent name |
| Start on boot | `false` | Whether to auto-start Aegis on system boot |

---

## Troubleshooting / FAQ

### Agent "did not become ready within 10000ms"

The worker script didn't send a `ready` IPC message within 10 seconds. Check:

- The worker script path is correct (`--script` flag)
- The worker sends `{ "type": "result", "payload": { "status": "ready" } }` on startup
- The worker script has no syntax errors: `bun run <script-path>`

### Heartbeat timeout

An agent hasn't sent any IPC messages in 30 seconds. The agent process may be hung.

- Check agent logs: `aegis agent logs <name>`
- Force kill: `aegis agent kill <name> --force`

### No ANTHROPIC_API_KEY found

The chat command requires an API key:

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
# or add to .env file
```

### Agent recovery exhausted after N attempts

The worker keeps crashing. Check:

- Worker script for unhandled errors
- Environment variables the worker depends on
- Agent logs for the error pattern: `aegis agent logs <name> --level error`
- Disable recovery if intentional: `--retries 0`

### Force kill an unresponsive agent

```bash
bun run index.ts agent kill <name> --force
```

### Dashboard rendering issues

- Ensure your terminal supports ANSI escape sequences
- Try a larger terminal window (minimum 80x24)
- Use `--plain` flag to disable colored output

---

## Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| [Bun](https://bun.sh) | >= 1.3.14 | Runtime, package manager, bundler, process spawning |
| [TypeScript](https://typescriptlang.org) | ^5 | Type safety (strict mode, ESNext target) |
| [Commander](https://github.com/tj/commander.js) | ^15 | CLI framework |
| [@clack/prompts](https://github.com/nicholasgriffintn/clack) | ^1.5 | Interactive wizard UI |
| [picocolors](https://github.com/alexeyraspopov/picocolors) | ^1.1 | Terminal colors |
| [figlet](https://github.com/cmatsuoka/figlet) | ^1.11 | ASCII art banner generation |
| [ansi-escapes](https://github.com/sindresorhus/ansi-escapes) | ^7 | Terminal escape sequences |
| [cli-truncate](https://github.com/sindresorhus/cli-truncate) | ^6 | Terminal line truncation |

---

## Roadmap

### Current: v0.1.0

- Complete TUI platform (dashboard, chat, agent system, wizard)
- 13 agent types with tool permissions
- Auto-recovery with exponential backoff
- Lifecycle hook system
- JSON-line IPC protocol
- Anthropic chat streaming

### Planned

- **Shell mode** -- Interactive REPL for continuous operation
- **Multi-provider chat** -- OpenAI, Ollama, DeepSeek provider implementations
- **Persistent agent storage** -- Save and restore agent sessions across restarts
- **Web-based dashboard** -- Browser UI for remote agent monitoring
- **Agent-to-agent communication** -- Direct IPC between worker processes
- **Plugin system** -- Custom agent types via external packages
- **Remote agent orchestration** -- Distribute agents across machines
- **Task queue** -- Priority-based task scheduling for agents
- **Observability** -- Structured logging, metrics export, tracing

---

## License

Private -- all rights reserved.

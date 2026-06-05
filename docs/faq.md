---
title: Frequently Asked Questions
description: Answers to common questions about Aegis — setup, agent system, TUI, memory, development, and troubleshooting
---

# Frequently Asked Questions

---

## General

### What is Aegis?

Aegis (also referred to as **Neuron OS**) is a terminal-native AI agent orchestration platform. It provides a multi-agent system with a TUI dashboard, streaming AI chat, sandboxed execution, vector memory, skill plugins, an encrypted vault, and a REST API — all built with Bun and TypeScript.

### What's the tech stack?

| Layer | Technology |
|-------|-----------|
| Runtime | Bun ≥ 1.3.14 |
| Language | TypeScript (strict mode) |
| CLI Framework | Commander |
| TUI Rendering | Custom terminal renderer (10-20fps) |
| AI SDK | Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/openai`) |
| AI Providers | Anthropic, OpenAI, DeepSeek, Ollama, Custom |
| Web Dashboard | Vite 6 + React 19 + Tailwind CSS 3 + Framer Motion 12 |
| Encryption | AES-256-GCM |
| Testing | Assertion-based (no test framework) |

### How is this different from other AI agent platforms?

Aegis is **terminal-native** — the primary interface is a terminal UI (TUI), not a web app. It's designed for developers who live in the terminal and want:

- **Local-first** execution — all agents run on your machine
- **No cloud dependency** — you bring your own API keys
- **Full control** — every subsystem (agent system, tools, memory, sandbox) is independently configurable
- **No lock-in** — swap AI providers at runtime with a slash command

### What platforms are supported?

Windows (cmd, PowerShell, Windows Terminal), macOS, and Linux. Any modern terminal emulator with ANSI escape code support works.

---

## Setup & Configuration

### How do I configure an AI provider?

Three ways:

1. **Setup wizard** — `aegis setup` (interactive, saves to `~/.aegis/config.json`)
2. **Environment variables** — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.
3. **Encrypted vault** — `aegis config set ANTHROPIC_API_KEY sk-...`

See the [Quick Start Guide](/guides/quick-start) for details.

### Where is the config file?

`~/.aegis/config.json`. It stores provider preferences, workspace settings, and agent defaults. Created automatically by the setup wizard.

### Can I use multiple AI providers?

Yes. Configure all your API keys, then switch at runtime in the Chat TUI:

```
/provider list
/provider set openai model=gpt-4o
/provider set anthropic model=claude-sonnet-4-20250514
```

### How do I set a default provider?

Set the `AEGIS_DEFAULT_PROVIDER` environment variable:

```bash
export AEGIS_DEFAULT_PROVIDER=anthropic
```

Or configure it via the setup wizard.

---

## Agent System

### What is an agent?

An agent is a child process running a Bun worker script (`agent-worker.ts`) that communicates with the parent via structured JSON-line IPC over stdin/stdout. Each agent has a type (build, plan, review, etc.) that defines its tool permissions, system prompt, and model preferences.

### How many agent types are there?

**13 built-in types**: `build`, `plan`, `read`, `write`, `test`, `validate`, `review`, `debug`, `document`, `refactor`, `deploy`, `monitor`, `explore`.

Two (`build`, `plan`) are **primary** agents suitable as main assistants; the rest are **subagents** designed for specific tasks.

### How does agent-to-agent communication work?

The `routeIpc()` method lets one agent send a structured message to another. The parent process acts as a message broker — Agent A sends a `delegate` message, the parent forwards it to Agent B, and returns B's response to A.

### What happens when an agent crashes?

Auto-recovery kicks in with configurable exponential backoff:

```typescript
recovery: {
  maxRetries: 5,       // Max consecutive retries
  backoffMs: 1000,     // Initial delay (1s)
  backoffMultiplier: 2,// Double each attempt
  backoffMax: 60000,   // Cap at 60 seconds
}
```

The agent is automatically respawned with the same configuration. After exhausting retries, the system emits `agent:maxRetries` and gives up.

### How do I see what agents are running?

```bash
# From Dashboard
aegis dashboard   # Then type: list

# From CLI
aegis agent list
```

### Can I create my own agent type?

Yes. Add a type to the `AGENT_TYPES` record in `src/agent/agent-types.ts`. See the [Creating an Agent Type](/development/creating-an-agent-type) guide.

---

## TUI (Terminal UI)

### The dashboard won't render

Make sure:
- Your terminal is **≥ 80 × 24** characters
- You're running in an **interactive TTY** (`run` directly, not via pipe)
- Your terminal supports **ANSI escape codes** (most modern terminals do)

### What are the keyboard shortcuts?

| Key | Dashboard | Chat |
|-----|-----------|------|
| **Enter** | Execute command | Send message |
| **Ctrl+Q** | Quit | Quit |
| **Tab** | Cycle focus (log → agents → command) | — |
| **↑↓** | Scroll log / command history | Message history / multiline nav |
| **← →** | — | Cursor movement |
| **PgUp/PgDn** | Scroll log by 10 | Scroll messages |
| **Esc** | — | Cancel streaming / clear input |
| **Alt+Enter** | — | Insert newline (multiline) |

Full reference in the [TUI Cheatsheet](/tui-cheatsheet).

### Chat streaming is slow

Check:
- Your API key is valid and has quota remaining
- Network connectivity to the provider's API
- You're not rate-limited (providers enforce rate limits on free tiers)
- Try a faster model (e.g., Claude Haiku or GPT-4o Mini)

### My terminal is in a weird state after quitting

Run `reset` (macOS/Linux) or close and reopen the terminal window (Windows). You can also run `stty sane` or `tput cnorm` to restore normal cursor behavior.

---

## Memory & Storage

### Where is my data stored?

| Data | Location |
|------|----------|
| Long-term memory | `MEMORY.md` (project root) |
| User profile | `user.md` (project root) |
| Daily logs | `.aegis/memory/daily/YYYY-MM-DD.md` |
| Auto memories | `.aegis/memory/auto/` |
| Extracted facts | `.aegis/memory/facts.json` |
| Vector index | `.aegis/memory/vectors/index.json` |
| Chat sessions | `data/sessions/{id}.json` |
| Config | `~/.aegis/config.json` |
| Credentials | `~/.aegis/vault.json` (AES-256-GCM encrypted) |

### What is the AgentMemory sidecar?

AgentMemory is an optional sidecar service that adds hybrid BM25+Vector+Graph search, session capture/replay, and knowledge graph capabilities. It runs as a separate process and communicates via REST API.

Enable it by setting `AGENTMEMORY_URL` and `AGENTMEMORY_SECRET` environment variables.

### Does the memory system support semantic search?

Yes. The built-in vector memory uses 128-dimension hash-based embeddings for cosine similarity search. When the AgentMemory sidecar is available, search is hybrid — fusing semantic, keyword, and graph results.

---

## Development

### How do I add a new mode?

Create a file in `src/modes/` implementing the `Mode` interface, then register it in `src/modes/index.ts`. See the [Creating a Mode](/development/creating-a-mode) guide.

### How do I add a new tool?

Create a file in `src/tools/` implementing the `Tool` interface, then register it in `src/tools/index.ts`. See the [Creating a Tool](/development/creating-a-tool) guide.

### How do I run tests?

```bash
bun run test                         # Full test suite
bun run typecheck                    # TypeScript type check
bun run src/agent/test-engine.ts     # Agent manager tests
bun run src/memory/test-memory-system.ts  # Memory tests
```

Tests use assertion-based patterns — no test framework dependency.

### How do I build for production?

```bash
# Bundle for Bun
bun build index.ts --target=bun --outfile=dist/aegis

# Standalone binary
bun build index.ts --compile --outfile=aegis

# Web dashboard
cd dashboard && bun install && bun run build
```

### Docker?

A multi-stage Dockerfile is included for containerized deployment:

```bash
docker build -t neuron-os/aegis:latest .
docker run -p 8080:8080 -e ANTHROPIC_API_KEY=sk-... neuron-os/aegis:latest
```

---

## API & Integration

### What port does the API server use?

Default: **8080**. Configurable via `AEGIS_API_PORT` and `AEGIS_API_HOST`.

### How do I authenticate to the API?

Set `AEGIS_API_KEY` and include it as a Bearer token or `X-API-Key` header:

```bash
curl http://localhost:8080/api/v1/health \
  -H "Authorization: Bearer my-api-key"
```

If `AEGIS_API_KEY` is not set, authentication is disabled (for local development).

### Rate limiting?

Default: **100 requests per minute** per IP. Configured via `AEGIS_API_RATE_LIMIT` and `AEGIS_API_RATE_WINDOW`.

### What is MCP and how do I use it?

Aegis implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) for tool interoperability. The MCP server exposes Aegis tools to any MCP-compatible client, and the MCP client can discover and call tools from external MCP servers.

Start the MCP server:

```bash
aegis serve   # Starts both HTTP API and MCP server
```

---

## Troubleshooting

### Agent "did not become ready within 10000ms"

The worker script didn't send the `{ type: "result", payload: { status: "ready" } }` IPC message within 10 seconds. Check:

1. The worker script path is correct (default: `src/agent/agent-worker.ts`)
2. There are no runtime errors in the worker (check stderr)
3. The script runs independently: `bun run src/agent/agent-worker.ts`

### Heartbeat timeout

The agent process is unresponsive. Auto-recovery will attempt a restart. Check for infinite loops, deadlocks, or excessive resource usage in the agent process.

### Recovery exhausted

The agent has crashed `maxRetries` times consecutively. Check agent logs:

```bash
aegis agent logs <name> --tail 50
```

Common causes:
- Invalid API key or configuration
- Missing file or module the worker depends on
- Unhandled exceptions in the worker script

### Web dashboard shows blank page

Make sure the API server is running:

```bash
aegis serve
```

The React dev server (port 5173) proxies `/api` requests to the API server (port 8080). For production, serve `dashboard/dist/` with any static file server.

### "Tool not permitted" when spawning an agent

The agent type you specified doesn't grant access to certain tools. Check the agent type's tool permissions in `src/agent/agent-types.ts`. Use `build` type for full access during development.

### `aegis` fails on Windows

Make sure:
- You're using **Windows Terminal** or another modern terminal (not cmd.exe for best ANSI support)
- Bun is installed correctly (`bun --version` should show ≥ 1.3.14)
- You're running from the project root directory
- Paths with spaces are quoted correctly

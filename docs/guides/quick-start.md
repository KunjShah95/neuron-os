---
title: Quick Start Guide
description: Get up and running with Aegis in 5 minutes — install, set up a provider, spawn your first agent, and explore the TUI
---

# Quick Start Guide

Get Aegis running on your machine in a few minutes. You'll install dependencies, launch the TUI, set up an AI provider, and spawn your first agent.

---

## Prerequisites

- **Bun** ≥ 1.3.14 — [Install Bun](https://bun.sh/docs/installation)
- A terminal with **≥ 80 × 24** character dimensions
- An API key for at least one AI provider (Anthropic recommended)

---

## 1. Install

```bash
git clone <repo-url> neuron-os
cd neuron-os
bun install
```

That's it. No global installs required — everything runs via `bun run index.ts`.

### Optional: global install

```bash
bun link
aegis          # Now available globally
```

---

## 2. Set Up an AI Provider

Before you can chat with AI or spawn agents, you need at least one provider configured.

### Option A: Setup wizard (recommended)

```bash
bun run index.ts setup
```

The wizard walks you through:

1. **Select a provider** — Anthropic, OpenAI, DeepSeek, Ollama, or Custom
2. **Enter your API key** — saved securely in `~/.aegis/config.json`
3. **Pick a model** — your provider's available models

### Option B: Environment variables

```bash
# Minimal — just set one
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-proj-...
export DEEPSEEK_API_KEY=sk-...
export OLLAMA_URL=http://localhost:11434
```

### Option C: Vault (for production)

```bash
# Store credentials in the encrypted vault
bun run index.ts config set ANTHROPIC_API_KEY sk-ant-...
bun run index.ts config set AEGIS_DEFAULT_PROVIDER anthropic
```

---

## 3. Launch the TUI

```bash
bun run index.ts
```

This opens the **Mode Launcher** — a full-screen TUI with 15 available modes:

| Mode | Description |
|------|-------------|
| **Dashboard** | Live agent monitor with activity log |
| **Chat** | Streaming AI conversation |
| **Setup** | Provider configuration wizard |
| **Status** | System overview |
| **Memory** | Search memory & facts |
| **Skills** | Browse installed skills |
| **Agent** | Agent management |
| **Cron** | Scheduled jobs |
| **Config** | Credential vault viewer |
| **MCP** | MCP server status |
| **Sandbox** | Sandbox configuration |

Navigate with **↑↓**, select with **Enter**, quit with **Ctrl+Q**.

### Launch a mode directly

```bash
bun run index.ts chat        # AI conversation
bun run index.ts dashboard   # Agent monitoring
bun run index.ts status      # System info
bun run index.ts memory      # Memory & facts
```

---

## 4. Your First Chat

```bash
bun run index.ts chat
```

You'll see the chat interface:

```
╭─ AEGIS CHAT ────────────────────────── Ctrl+Q Quit ╮
│                                                       │
│ │ Hello! What would you like to do?▐                 │
│ · Enter to send | Alt+Enter newline | →→ history      │
```

Type a message and press **Enter**. The AI will respond with streaming text.

### Slash commands

| Command | Description |
|---------|-------------|
| `/provider list` | List available providers |
| `/provider set openai model=gpt-4o` | Switch provider at runtime |
| `/sessions list` | List saved sessions |
| `/sessions load <id>` | Resume a previous session |
| `/clear` | Clear the chat |
| `/shell` | Toggle shell mode |

---

## 5. Spawn an Agent

From the Dashboard or CLI:

### Via Dashboard

```bash
bun run index.ts dashboard
```

At the `$` prompt:

```bash
$ spawn builder-1
$ spawn reviewer-1 --type review
$ list
```

### Via CLI

```bash
bun run index.ts agent spawn my-agent --type build
bun run index.ts agent list
bun run index.ts agent kill my-agent
```

---

## 6. What's Next?

| Topic | Guide |
|-------|-------|
| **Dashboard deep-dive** | [TUI Usage Guide](/tui-usage) |
| **Quick reference** | [TUI Cheatsheet](/tui-cheatsheet) |
| **Architecture overview** | [Agent System](/architecture/agent-system), [Memory System](/architecture/memory-system), [Sandbox](/architecture/sandbox) |
| **Building your own mode** | [Creating a Mode](/development/creating-a-mode) |
| **Building your own tool** | [Creating a Tool](/development/creating-a-tool) |
| **Custom agent types** | [Creating an Agent Type](/development/creating-an-agent-type) |
| **REST API** | [API Reference](/api/rest) |
| **Interactive component demos** | [Interactive Components](/guides/interactive-components) |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Dashboard requires a TTY" | Run in an interactive terminal, not a pipe |
| Chat streams slowly | Check your API key and network connection |
| Agent exits immediately | Run `aegis agent logs <name>` to inspect |
| Terminal left in weird state | Run `reset` or close and reopen |
| Colors look wrong | Set `TERM=xterm-256color` or use a modern terminal |

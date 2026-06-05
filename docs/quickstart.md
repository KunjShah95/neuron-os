# Quick Start Guide

Get Aegis running in under 5 minutes.

---

## Prerequisites

- **Bun** ≥ 1.3.14 — [Install Bun](https://bun.sh)

## Installation

```bash
# Clone the repository
git clone <repo-url> neuron-os
cd neuron-os

# Install dependencies
bun install

# Verify the installation
bun run typecheck    # Should exit with no errors
bun run test         # All test suites should pass
```

## Quick Start (30 seconds)

```bash
# Launch the interactive mode launcher
aegis
# Or in development: bun run index.ts

# Or jump directly into a mode:
aegis status      # View system info
aegis chat        # Start AI chat (requires API key)
aegis dashboard   # Open agent monitoring dashboard
```

## Configuration

### Setting up an AI provider

Aegis supports Anthropic, OpenAI, DeepSeek, Ollama, and custom providers.

**Option A: Interactive wizard (recommended)**

```bash
aegis setup
```

The wizard will guide you through:
1. Selecting a provider
2. Entering your API key
3. Choosing a model
4. Saving configuration to `~/.aegis/config.json`

**Option B: Environment variables**

```bash
# For Anthropic (default)
export ANTHROPIC_API_KEY=sk-ant-...

# For OpenAI
export OPENAI_API_KEY=sk-...

# For DeepSeek
export DEEPSEEK_API_KEY=...

# Optional settings
export AI_PROVIDER=anthropic        # or openai, deepseek, ollama
export AI_MODEL=claude-sonnet-4-20250514
export AEGIS_LOG_LEVEL=info
```

### Global install (optional)

```bash
bun link
aegis              # Now available from anywhere
aegis chat         # Launch chat from any directory
aegis dashboard    # Launch dashboard from any directory
```

## Your First Chat

```bash
# Ensure your API key is set
export ANTHROPIC_API_KEY=sk-ant-...

# Start the interactive chat
aegis chat
```

In the chat TUI:

```
  You > What can you do?
  AI > I'm an autonomous AI agent system with:
       • 13 specialized agent types (build, plan, debug, etc.)
       • Streaming multi-provider AI chat
       • Web search and fetch capabilities
       • File system tools (read, write, edit, grep, glob)
       • Memory persistence and semantic search
       • MCP integration for external tools
       • Extensible skill system

  You > /help
  Commands:
    /help                Show this help
    /clear               Clear conversation
    /provider list       List available providers
    /provider set <name> Switch provider at runtime
    /sessions list       List saved sessions
    /sessions load <id>  Resume a saved session
    /exit                Exit the chat
```

## Dashboard

Two dashboards are available:

### Terminal Dashboard (TUI)

```bash
aegis dashboard
```

Real-time agent monitoring with:
- Agent cards showing status, type, and uptime
- Activity log with timestamps
- Command bar for spawning/killing agents
- Status bar with system metrics

### Web Dashboard

```bash
# Start the API server
aegis serve

# In another terminal, start the web dev server
cd dashboard
bun install
bun run dev
```

Open http://localhost:5173 for the full web dashboard with 15 pages.

## Next Steps

- [Explore all 15 TUI modes](modes-and-commands.md)
- [Understand the agent system](agents.md)
- [Learn about memory persistence](memory-system.md)
- [Extend the system](development.md)
- [Browse the REST API](api.md)

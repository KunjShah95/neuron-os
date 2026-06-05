# Modes & Commands Reference

Complete reference for all 15 TUI modes and CLI commands.

---

Run `aegis` with no arguments to open the interactive wakeup picker which auto-discovers all modes:

```bash
aegis
# Or in development:
bun run index.ts
```

Navigate with arrow keys (↑↓) and press Enter to select a mode.

## All Modes

| Mode | Command | Alias | Description |
|------|---------|-------|-------------|
| Dashboard | `dashboard` | `dash` | Live agent monitoring TUI |
| Chat | `chat` | `c` | Streaming AI chat TUI |
| Status | `status` | `st` | System status overview |
| Skills | `skills` | `sk` | Installed skills & skills.sh browser |
| Config | `config` | `cfg` | Credential vault viewer |
| Cron | `cron` | | Scheduled jobs overview |
| Memory | `memory` | | Memory, facts & vector search stats |
| Agent | `agent` | `a` | Agent management overview |
| Setup | `setup` | | Interactive setup wizard |
| API Server | `serve` | | HTTP API server |
| MCP | `mcp` | | MCP server config & status |
| AgentMemory | `agentmemory` | `am` | AgentMemory sidecar status & search |
| Sandbox | `sandbox` | | Execution sandbox status & config |
| Computer | `computer` | | Screen interaction tools (mouse, type, screenshot) |
| Harness | `harness` | | Agent evaluation harness |

## Dashboard TUI

The dashboard provides real-time agent monitoring.

```bash
aegis dashboard
# or: bun run index.ts dashboard
```

### Dashboard Commands

| Command | Description |
|---------|-------------|
| `spawn <name>` | Launch an agent worker |
| `spawn <name> --type build` | Launch with specific agent type |
| `kill <name>` | Stop an agent |
| `kill all` | Stop all agents |
| `list` | List all agents with status |
| `status` | Show system info (version, uptime, memory) |
| `providers` | List configured AI providers |
| `sessions` | List saved chat sessions |
| `session delete <id>` | Delete a saved session |
| `session rename <id> <name>` | Rename a session |
| `session export <id>` | Export session to file |
| `help` | Show available commands |

### Dashboard Hotkeys

| Key | Action |
|-----|--------|
| `Tab` | Cycle focus (agents → log → command) |
| `↑` / `↓` | Navigate agent list |
| `Enter` | Execute command |
| `Ctrl+Q` / `Ctrl+C` | Quit |

## Chat TUI

```bash
aegis chat
# or: bun run index.ts chat
aegis chat --type build    # Start with build agent type
aegis chat --provider openai --model gpt-4o  # Specific provider/model
```

### Chat Slash Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |
| `/clear` | Clear the current conversation |
| `/provider list` | List available AI providers |
| `/provider set <name>` | Switch provider at runtime |
| `/provider set <name> model=<model>` | Switch provider with specific model |
| `/model <name>` | Switch model |
| `/sessions list` | List recent saved sessions |
| `/sessions load <id>` | Resume a saved session |
| `/exit` / `/quit` | Exit chat |

### Session Management

Chat sessions are auto-saved and can be resumed:

```bash
# In chat TUI:
/sessions list            # Show all saved sessions
/sessions load abc123     # Resume session abc123
/clear                     # Clear current conversation
```

## Agent Subcommands

```bash
aegis agent types                          # List available agent types
aegis agent list                           # List running agents
aegis agent list --status running          # Filter by status
aegis agent spawn <name>                   # Spawn default agent
aegis agent spawn <name> --type build      # Spawn build agent
aegis agent spawn <name> --type plan       # Spawn planning agent
aegis agent kill <name>                    # Stop an agent
aegis agent kill <name> --force            # Force kill
aegis agent logs <name>                    # View all logs
aegis agent logs <name> --tail 20          # View last 20 logs
aegis agent logs <name> --level error      # Filter by level
aegis agent inspect <name>                 # Show detailed agent info
```

## Status Mode

```bash
aegis status
# or
aegis status --json    # JSON output for scripting
# or: bun run index.ts status
```

Shows:
- System version and uptime
- Memory usage
- Active agent count
- AI provider configuration
- Skills count

## Memory Mode

```bash
aegis memory
# or: bun run index.ts memory
```

Shows:
- Long-term memory content
- Extracted facts by category
- Vector memory statistics
- Daily log overview

## Setup Wizard

```bash
aegis setup
# or: bun run index.ts setup
```

Interactive wizard that guides you through:

1. **Provider selection** — Anthropic, OpenAI, DeepSeek, Ollama, or Custom
2. **API key entry** — Paste or type your key
3. **Model selection** — Choose from available models
4. **Save** — Configuration written to `~/.aegis/config.json`

## Cron Mode

```bash
aegis cron
# or: bun run index.ts cron
```

Shows scheduled jobs and their status (enabled/disabled).

## Config Mode

```bash
aegis config
# or: bun run index.ts config
```

Shows credential vault status with encryption information.

## MCP Mode

```bash
aegis mcp
# or: bun run index.ts mcp
```

Shows MCP server connection status and available tools.

## Skills Mode

```bash
aegis skills
# or: bun run index.ts skills
```

Shows installed skills with description and tags.

## API Server

```bash
# Start the HTTP API server
aegis serve
# or: bun run index.ts serve

# With custom port
AEGIS_API_PORT=3000 aegis serve

# With authentication
AEGIS_API_KEY=my-secret-key aegis serve
```

The server serves the web dashboard from `dashboard/dist/` and provides REST API endpoints.

## Computer Use Mode

```bash
aegis computer
# or: bun run index.ts computer
```

Enables screen interaction tools (mouse move, click, type, screenshot).

## Global Options

```bash
aegis --help          # Show all commands
aegis --version       # Show version
aegis chat --help     # Show chat-specific options
# or: bun run index.ts <command> [options]
```

## Provider-Specific Commands

### AgentMemory

```bash
aegis agentmemory status                   # Connection status
aegis agentmemory search <query>           # Hybrid semantic search
aegis agentmemory connect                  # Test connection to sidecar
```

## Docker Commands

```bash
# Build the Docker image
docker build -t neuron-os/aegis:latest .

# Run API server
docker run -p 8080:8080 -e ANTHROPIC_API_KEY=sk-... neuron-os/aegis:latest

# Run status check
docker run neuron-os/aegis:latest status --json

# Development with docker-compose
docker compose up aegis
docker compose --profile dev up   # With hot-reload web dashboard
```

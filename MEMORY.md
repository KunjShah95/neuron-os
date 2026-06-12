# Aegis Memory

Long-term durable facts and knowledge.

## Project Context

- **Name:** neuron-os / Aegis
- **Description:** The Operating System for Autonomous AI Agents
- **Version:** 0.1.0
- **Runtime:** Bun (TypeScript runtime)
- **Test Suite:** 16 suites (integration, unit, TUI, dashboard), all passing

## Architecture

- **Entry Point:** `index.ts` — Commander-based CLI with 14+ commands
- **AI Providers:** Anthropic, OpenAI, DeepSeek, Ollama, Custom (via @ai-sdk packages)
- **Agent System:** Spawns child processes with JSON-line IPC protocol, auto-recovery with exponential backoff
- **Dashboard:** Vite + React 19 + Tailwind CSS with real-time WebSocket event bridge
- **Memory System:** TF-IDF vector search, session persistence, user profiles, daily logs
- **Credential Vault:** AES-256-GCM encrypted at `~/.aegis/vault.enc`
- **Web Search:** DuckDuckGo (default, no key), Tavily, or SerpAPI

## Key Directory Structure

```
src/
├── agent/       # Agent lifecycle, engine, runtime, hooks, IPC
├── ai/          # AI provider abstraction (5 providers)
├── api/         # HTTP REST API server
├── chat/        # Chat TUI with streaming, sessions, provider switching
├── cli/         # CLI framework (14+ commands, theme, logger, guard)
├── modes/       # 12+ TUI mode screens
├── tools/       # 10 built-in tools (read, write, bash, web, etc.)
├── vault/       # Encrypted credential storage
├── memory/      # Vector search, session store, agentmemory connector
├── mcp/         # Model Context Protocol client/server
├── cron/        # Scheduled task engine
├── telemetry/   # Opt-in usage telemetry (no PII)
skills/          # Reusable skill definitions
dashboard/       # Web frontend (React 19 + Vite + Tailwind)
```

## Operational Notes

- All 16 test suites pass; 0 TypeScript errors
- Config persisted to `~/.aegis/config.json` (Zod-validated)
- Log level controlled by `AEGIS_LOG_LEVEL` (default: info)
- Log file output via `AEGIS_LOG_FILE` with 10MB rotation
- Telemetry opt-in via `AEGIS_TELEMETRY=1` env var
- .env files auto-loaded from project root on startup

## 2026-06-04T16:13:50.885Z

E2E audit test entry

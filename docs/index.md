# Aegis (Neuron OS) Documentation

*The Operating System for Autonomous AI Agents*

---

## Getting Started

| Guide | Description |
|-------|-------------|
| [Quick Start](quickstart.md) | Install, configure, and run your first agent in 5 minutes |
| [Modes & Commands](modes-and-commands.md) | Complete CLI reference for all 15 TUI modes |
| [Configuration](quickstart.md#configuration) | Environment variables, provider setup, and credential vault |

## Architecture

| Guide | Description |
|-------|-------------|
| [System Architecture](architecture.md) | High-level architecture, module breakdown, data flow |
| [Agent System (deep-dive)](architecture/agent-system.md) | Agent lifecycle, IPC protocol, auto-recovery, hooks |
| [Memory System (deep-dive)](architecture/memory-system.md) | Long-term memory, facts, daily logs, vector search, AgentMemory |
| [Sandbox System](architecture/sandbox.md) | Filesystem, process, and Docker isolation layers |
| [Security Whitepaper](security-whitepaper.md) | Formal enterprise security document with threat model, encryption, RBAC, compliance mapping |

## Extending

| Guide | Description |
|-------|-------------|
| [Creating a Mode](development/creating-a-mode.md) | Step-by-step guide to building a new TUI mode |
| [Creating a Tool](development/creating-a-tool.md) | Build and register a new agent tool |
| [Creating an Agent Type](development/creating-an-agent-type.md) | Define custom agent types with tool permissions |
| [REST API Reference](api/rest.md) | HTTP API endpoints, authentication, CORS, rate limiting |
| [Testing](../README.md#development) | Running test suites, CI pipeline |

---

## Quick Links

- [README.md](../README.md) — Project overview and command reference
- [CONTRIBUTING.md](../CONTRIBUTING.md) — Contributing guidelines
- [CHANGELOG.md](../CHANGELOG.md) — Version history
- [ROADMAP.md](../ROADMAP.md) — Future plans
- [SECURITY.md](../SECURITY.md) — Security policy

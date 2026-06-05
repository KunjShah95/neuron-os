---
title: Agent System Architecture
description: Deep dive into Aegis multi-agent system — lifecycle, IPC protocol, hooks system, auto-recovery, and all 13 agent types
---

# Agent System Architecture

> **Last updated:** May 2026  
> **Module:** `src/agent/`  
> **Key exports:** `AgentManager`, `AgentEngine`, `HookRegistry`, `AgentRuntime`, `agentManager`

## Overview

The agent system manages the lifecycle of AI worker processes. Each agent is a child process running a Bun script (`agent-worker.ts`) that communicates with the parent via **JSON-line IPC over stdin/stdout**. The system supports spawning, IPC messaging, agent-to-agent routing, lifecycle hooks, auto-recovery with exponential backoff, heartbeat monitoring, and event broadcasting.

```
┌─────────────────────────────────────────────┐
│                  AgentManager                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Agent A  │  │ Agent B  │  │ Agent C  │  │
│  │ (worker) │  │ (worker) │  │ (worker) │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       │              │              │        │
│  ┌────▼──────────────▼──────────────▼────┐  │
│  │          HookRegistry                 │  │
│  │  (pre/post spawn, kill, exit)         │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │          Event Listeners              │  │
│  │  (→ TUI, → logging, → API bridge)     │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

## Core Components

### `AgentManager` (`src/agent/manager.ts`)

The central orchestrator. Manages all agent instances, handles spawning, lifecycle, IPC routing, recovery, and event broadcasting.

```typescript
import { agentManager } from "../agent"

// Spawn a new agent
const agentId = await agentManager.spawn({
  name: "my-agent",
  script: "src/agent/agent-worker.ts",
  agentType: "build",
  env: { MY_VAR: "value" },
  tags: ["frontend"],
  recovery: { maxRetries: 3, backoffMs: 2000 },
})
```

**Constructor options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onEvent` | `(event: AgentEvent) => void` | — | Called for every agent event |
| `heartbeatMs` | `number` | `5000` | Heartbeat check interval (0 to disable) |

### `AgentEngine` (`src/agent/engine.ts`)

Higher-level engine that integrates the agent runtime with AI model providers and tool execution. Used by the chat/CLI system:

```typescript
import { AgentEngine, createAgentRuntime } from "../agent"
import { AIProviderManager } from "../ai"

const runtime = createAgentRuntime("agent-1", "build", process.cwd())
const ai = new AIProviderManager(config)
const engine = new AgentEngine(runtime, ai, { maxSteps: 10 })

// Stream a conversation
const result = await engine.streamChat(messages, {
  onChunk: (text) => process.stdout.write(text),
})
```

### `AgentRuntime` (`src/agent/runtime.ts`)

Runtime context bound to a specific agent. Provides tool execution, memory access, skill injection, and system prompt construction:

```typescript
const runtime = new AgentRuntime({
  agentId: "agent-1",
  agentType: "build",
  cwd: process.cwd(),
})

// Execute a tool
const result = await runtime.executeTool("read", { path: "src/index.ts" })

// Load relevant skills
const skillContent = await runtime.loadSkills("build")

// Load memory context
const memory = await runtime.loadMemory()

// Build full system prompt
const prompt = await runtime.buildSystemPrompt()
```

### `HookRegistry` (`src/agent/hooks.ts`)

Lifecycle hooks that fire before/after agent operations:

```typescript
import { agentManager } from "../agent"

// Register a pre-spawn hook
agentManager.hooks.register("spawn", "pre", async (ctx) => {
  console.log(`Spawning agent: ${ctx.agentId}`)
  ctx.meta["startedAt"] = Date.now()
}, { priority: 10, label: "my-hook" })

// Register a post-kill hook
agentManager.hooks.register("kill", "post", async (ctx) => {
  console.log(`Agent ${ctx.agentId} stopped`)
})
```

**Hook execution order:** `priority` descending (higher numbers run first). Pre-hooks run before the action, post-hooks after.

### `loadSoul` (`src/agent/soul.ts`)

Loads a "SOUL.md" file — an agent-type-specific system prompt augmentation stored at:

1. `skills/{agentType}/SOUL.md` (project-level)
2. `.aegis/skills/{agentType}/SOUL.md` (project-level hidden)
3. `~/.aegis/skills/{agentType}/SOUL.md` (global)

## Agent Lifecycle

```
    ┌──────────┐
    │   Idle   │
    └────┬─────┘
         │ spawn()
         ▼
    ┌──────────┐
    │ Spawning │──→ spawn error →┌───────┐
    └────┬─────┘                 │ Error │
         │ ready IPC             └───────┘
         ▼
    ┌──────────┐
    │ Running  │──→ heartbeat timeout →┌───────┐
    └────┬─────┘                       │ Error │
         │ exit(code≠0)                └───────┘
         ├────────────────────→ Auto-recovery (configurable)
         ▼
    ┌──────────┐
    │ Stopped  │
    └──────────┘
```

### Spawn Flow

1. **Validation** — checks agent type exists (if specified), merges tools/env from type config
2. **Pre-hook** — fires `spawn/pre` hooks
3. **Launch** — spawns `bun run {script}` with env vars (`AEGIS_AGENT_ID`, `AEGIS_AGENT_NAME`, type-specific vars)
4. **Stdout** — JSON-line IPC parsing; stderr written to agent log
5. **Ready wait** — waits up to 10s for `{ type: "result", payload: { status: "ready" } }` IPC message
6. **Post-hook** — fires `spawn/post` hooks

### Kill Flow

1. **Recovery cancellation** — cancels any pending auto-recovery
2. **Pre-hook** — fires `kill/pre` hooks
3. **Graceful** — sends `{ type: "shutdown" }` IPC message
4. **Timeout** — waits `stopTimeout` ms (default 5000) for process exit
5. **Force** — sends SIGKILL (signal 9) if still alive
6. **Post-hook** — fires `kill/post` hooks

## IPC Protocol

Agents communicate with the parent via **newline-delimited JSON over stdin/stdout**:

### Parent → Agent (stdin)

```json
{"type":"run-task","id":"task-1","payload":{"goal":"Implement feature X"},"timestamp":1717000000000}
{"type":"shutdown","id":"kill-cmd","payload":{},"timestamp":1717000000000}
{"type":"ping","id":"ping","payload":{},"timestamp":1717000000000}
```

### Agent → Parent (stdout)

```json
{"type":"result","payload":{"status":"ready"},"timestamp":1717000000000}
{"type":"log","payload":{"level":"info","text":"Processing task..."},"timestamp":1717000000000}
{"type":"heartbeat","payload":{},"timestamp":1717000000000}
{"type":"error","payload":{"message":"Something went wrong"},"timestamp":1717000000000}
```

| Message Type | Direction | Description |
|---|---|---|
| `run-task` | → Agent | Assign a task to the agent |
| `shutdown` | → Agent | Gracefully stop the agent |
| `ping` | → Agent | Liveness check |
| `result` | → Parent | Task result or ready signal |
| `log` | → Parent | Structured log entry (level: info/warn/error) |
| `heartbeat` | → Parent | Periodic liveness signal |
| `error` | → Parent | Error notification |

## Agent-to-Agent Routing

The `routeIpc()` method enables one agent to send a message to another:

```typescript
const result = await agentManager.routeIpc("from-agent-id", "to-agent-id", {
  type: "delegate",
  payload: { task: "Review this code" },
  timestamp: Date.now(),
})
// Returns a promise that resolves with the target's response
```

Lookup helpers:

```typescript
const agent = agentManager.findAgentByName("code-reviewer")
const agent = agentManager.findAgentByType("review")
```

## Agent Types

13 built-in agent types defined in `src/agent/agent-types.ts`:

| Type | Mode | Tools | Model Hint | Description |
|------|------|-------|------------|-------------|
| `build` | primary | all | — | Full-access dev agent |
| `plan` | primary | read-only | opus-4 | Architecture & planning |
| `read` | subagent | read-only | — | Codebase exploration |
| `write` | subagent | write+read | — | File creation & editing |
| `test` | subagent | bash+read | — | Test runner |
| `validate` | subagent | read+bash | — | Linting & type checking |
| `review` | subagent | read-only | opus-4 | Code review |
| `debug` | subagent | all | opus-4 | Systematic debugging |
| `document` | subagent | read+write | — | Documentation generation |
| `refactor` | subagent | write+read | — | Code restructuring |
| `deploy` | subagent | bash+read | — | Deployment & CI/CD |
| `monitor` | subagent | bash+read | — | File watching & health |
| `explore` | subagent | read-only | — | Lightweight search |

Each type defines:
- **tools** — which tools the agent can use (permission-based)
- **systemPrompt** — default system prompt injected into the agent
- **modelHint** — recommended model (e.g., `claude-opus-4` for complex reasoning)
- **maxTurns** — step limit (default: unlimited)
- **temperature** — model temperature override

## Auto-Recovery

Configured per-agent via `def.recovery`:

```typescript
const id = await agentManager.spawn({
  name: "critical-worker",
  script: "src/agent/agent-worker.ts",
  recovery: {
    maxRetries: 5,     // Max consecutive retries (default: 5)
    backoffMs: 1000,   // Initial backoff (default: 1000ms)
    backoffMultiplier: 2,  // Exponential factor (default: 2)
    backoffMax: 60000, // Cap at 60s (default: 60000)
  },
})
```

On non-zero exit, recovery:
1. Calculates backoff: `min(backoffMs × multiplier^attempt, backoffMax)`
2. Waits for the delay
3. Respawns the agent with the same `AgentDef`
4. Copies metadata from the old instance to the new one
5. Emits `agent:recovered` on success, or retries with increased backoff
6. After exhausting `maxRetries`, emits `agent:maxRetries` and gives up

## Event System

The `AgentManager` emits typed events via `onEvent()` / `offEvent()`:

| Event | When | Data |
|---|---|---|
| `agent:spawned` | Process launched | `{ pid }` |
| `agent:ready` | Agent sent `{ status: "ready" }` | — |
| `agent:stopped` | Kill initiated | `{ reason }` |
| `agent:error` | Any error condition | `{ message }` |
| `agent:log` | Log message from agent | `{ level, text }` |
| `agent:heartbeat` | Heartbeat from agent | — |
| `agent:exit` | Process exited | `{ code }` |
| `agent:recovering` | Recovery triggered | `{ attempt, delay, exitCode }` |
| `agent:recovered` | Recovery succeeded | `{ newId, attempts }` |
| `agent:maxRetries` | Recovery exhausted | `{ attempts, exitCode }` |
| `agent:result` | Task result | `{ id, ... }` |

The TUI dashboard bridges these events to the UI store via `createAgentEventBridge()` in `src/tui/store.ts`.

## Query & Listing

```typescript
// Get a specific agent
const inst = agentManager.get("agent-id")

// List all agents
const all = agentManager.list()

// Filter by status, tag, or type
const running = agentManager.list({ status: "running" })
const frontend = agentManager.list({ tag: "frontend" })
const reviewers = agentManager.list({ agentType: "review" })

// Get logs with optional filtering
const logs = agentManager.getLogs("agent-id", { level: "error", tail: 10 })

// Get available agent types
const types = agentManager.getAvailableTypes()
```

## Cleanup

```typescript
// Kill all running agents, cancel recoveries, clear hooks
await agentManager.destroy()
```

Called automatically on SIGINT/SIGTERM via `index.ts`'s `gracefulShutdown()`.

## Testing

Tests in `src/agent/test-engine.ts` (85 assertions) cover:
- AgentManager: IPC handling, hooks, kill (existing/nonexistent/already stopped), routing (source/target not found, timeouts), listing/filtering, events
- HookRegistry: registration, unregistration, priority ordering, clearing
- AgentEngine: instantiation and parameter-to-JSON-schema conversion

# Feature Gaps & Roadmap

> **Priority:** P0 (now) → P1 (next) → P2 (near-term) → P3 (mid-term)
> **Status: Historical planning document — items marked ✅ are implemented.**

---

## P0 — Critical Gaps (Must Fix Before Production) — ✅ Resolved

| Feature | Status | Effort | Notes |
|---------|--------|--------|-------|
| Error boundaries | ✅ Done | 1h | `registerErrorBoundaries()` in `src/cli/guard.ts` for unhandledRejection/uncaughtException |
| Structured logging | ✅ Done | 4h | `src/cli/logger.ts` with levels, JSON output, module-scoped instances, file rotation |
| Graceful shutdown | ✅ Done | 2h | SIGTERM/SIGINT handlers in `index.ts`, agent drain via `agentManager.destroy()` |
| Vault encryption | ✅ AES-256-GCM | 8h | `src/vault/crypto.ts`, key from env var or key file, auto-migration |
| API input validation | ✅ Done | 4h | Zod schemas for all endpoints in `src/api/server.ts` |
| Config validation | ✅ Done | 2h | Zod schema in `src/config.ts`, `validateConfig()`, field-level salvage |

---

## P1 — High Priority

| Feature | Status | Effort | Notes |
|---------|--------|--------|-------|
| Plugin system | 🗺️ Roadmap v0.5 | 40h | Dynamic tool/skill/agent type loading |
| WebSocket API | ✅ Done | 16h | WebSocket upgrade path, event bridge, SSE fallback in `src/api/server.ts` |
| Security headers | ✅ Done | 2h | CSP, HSTS, X-Content-Type-Options, X-Frame-Options in all API responses |
| Rate limiting | ✅ Done | 4h | Token bucket on API server (default 100 req/min) |
| OS keychain integration | ❌ Missing | 8h | macOS Keychain, Windows Credential Manager, Linux libsecret |
| TLS/HTTPS | ❌ Missing | 4h | Auto-cert (Let's Encrypt) or configurable cert paths |
| CI matrix (Win/Mac/Linux) | ⚠️ Linux only | 8h | GitHub Actions matrix across 3 platforms |
| Coverage measurement | ❌ Missing | 4h | c8/istanbul with threshold gating |
| Dependency vulnerability scan | ❌ Missing | 2h | `bun audit` in CI |
| Semantic releases | ⚠️ Date-based tags | 4h | semantic-release or manual semver + changelog |

---

## P2 — Near-Term

| Feature | Status | Effort | Notes |
|---------|--------|--------|-------|
| Multi-channel gateway | Telegram only | 40h | Discord, Slack, Matrix adapters |
| Session replay | ❌ Missing | 16h | Record + playback IPC messages |
| Agent templates | ❌ Missing | 8h | Pre-built agent definitions as JSON/YAML |
| Audit log | ❌ Missing | 8h | Structured event log with search |
| Prompt versioning | ❌ Missing | 12h | Git-like diff for system prompts |
| Redis-backed agent registry | ❌ Missing | 16h | First step toward distributed agents |
| Auto-scaling agents | ❌ Missing | 20h | Dynamic pool based on queue depth |
| Scheduled agent execution | ⚠️ Cron exists | 8h | Bind cron events to agent spawns |
| Provider health checks | ❌ Missing | 4h | Ping AI providers, report status |
| CLI autocompletion | ❌ Missing | 4h | Shell completion scripts (bash/zsh/fish) |

---

## P3 — Mid/Long-Term

| Feature | Status | Effort | Notes |
|---------|--------|--------|-------|
| Remote agent workers | ❌ Missing | 40h | NATS/RabbitMQ transport for multi-node IPC |
| Kubernetes operator | ❌ Missing | 80h | CRD + controller for agent pods |
| RBAC / multi-tenant | ❌ Missing | 40h | Users, roles, permissions, workspace isolation |
| Plugin marketplace | 🗺️ Roadmap | 80h | Registry, versioning, dependency resolution |
| Learning loop | ❌ Missing | 40h | Self-improvement from feedback |
| Background agents | ❌ Missing | 16h | File watching, event-driven triggers |
| Multi-host orchestration | ❌ Missing | 120h | Capacity-aware placement, leader election |
| Remote sandbox (Firecracker) | ❌ Missing | 80h | MicroVM isolation for untrusted code |

---

## Details: Top 3 Feature Designs

### 1. Plugin System

```typescript
interface AgentPlugin {
  id: string
  version: string
  name: string
  description: string
  hooks?: {
    onToolRegister?: () => ToolDefinition[]
    onAgentTypeRegister?: () => AgentType[]
    onSkillRegister?: () => SkillDefinition[]
    onStartup?: () => Promise<void>
    onShutdown?: () => Promise<void>
  }
}
```

- Plugins loaded from `~/.aegis/plugins/<id>/`
- Each plugin is an npm package or a directory with `plugin.json` + `.ts` files
- Plugin sandbox: limited tool permissions, no filesystem access outside plugin dir
- Version resolution with semver, dependency graph

### 2. WebSocket API — ✅ Implemented

```typescript
// Client connects to ws://localhost:8080/api/v1/ws
// Messages:
interface WsMessage {
  type: 'subscribe' | 'unsubscribe' | 'event'
  channel: 'agents' | 'logs' | 'memory' | 'status'
  data?: unknown
}

// Server pushes:
interface WsEvent {
  channel: string
  event: string
  data: unknown
  timestamp: string
}
```

- ✅ Replaces polling in web dashboard
- ✅ Agent log streaming, status changes, memory updates
- ✅ SSE fallback for clients without WebSocket
- ✅ Auto-reconnect with exponential backoff (client-side)

### 3. Multi-Channel Gateway

```
┌─────────────┐
│   Adapter   │ ← Common interface for all channels
│   Registry  │
└──────┬──────┘
       │
  ┌────┴────┐
  │  Router │ ← Routes messages to correct agent/provider
  └────┬────┘
       │
  ┌────┴──────────┬──────────┬───────────┐
  │              │          │           │
  ▼              ▼          ▼           ▼
Telegram      Discord     Slack     Matrix
Adapter       Adapter    Adapter    Adapter
```

```typescript
interface ChannelAdapter {
  name: string
  start(): Promise<void>
  stop(): Promise<void>
  sendMessage(channel: string, text: string): Promise<void>
  onMessage(handler: (msg: ChannelMessage) => void): void
}
```

- Each adapter implements the same interface
- Router maps channel conversations to agent sessions
- State isolated per-channel (no cross-channel leakage)

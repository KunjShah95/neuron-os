# Stabilization & Hardening — Plan

> **Priority: P0 — Critical before production use.**
> **Status: Historical planning document — items marked ✅ are implemented.**

---

## 1. Error Boundaries ✅

### Problem
- No global `unhandledRejection` or `uncaughtException` handlers
- Single unhandled promise rejection kills the entire process
- Agent crashes leave orphaned subprocesses

### Implementation — Done in `src/cli/guard.ts`

```typescript
// src/cli/guard.ts — add global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection:', reason)
  // Attempt graceful shutdown
  gracefulShutdown(1)
})

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught Exception:', error)
  gracefulShutdown(1)
})
```

- ✅ `registerErrorBoundaries()` with structured logging via the logger module
- ✅ Per-agent error isolation via `AgentManager` (one crash does not affect others)
- ✅ `AgentManager.destroy()` called in shutdown path to kill orphaned processes

### Files modified
- `src/cli/guard.ts` — global handlers with structured error logging
- `index.ts` — wired graceful shutdown on SIGTERM/SIGINT

---

## 2. Structured Logging ✅

### Problem
- All logging uses bare `console.log` / `console.error`
- No log levels, no JSON output, no structured fields
- Impossible to filter, search, or aggregate logs in production

### Implementation — Done in `src/cli/logger.ts`
- ✅ Custom structured logger with levels (debug, info, warn, error)
- ✅ JSON-line format in non-TTY, pretty-print in TTY
- ✅ Module-scoped instances via `createLogger("module")`
- ✅ Log levels controlled by `AEGIS_LOG_LEVEL` env var
- ✅ File logging with rotation (controlled by `AEGIS_LOG_FILE`, `AEGIS_LOG_MAX_SIZE`, `AEGIS_LOG_MAX_FILES`)
- ✅ Writes to stderr so stdout stays machine-readable
- ✅ Agent logs via IPC feed into this system

### Files modified
- `src/cli/logger.ts` — new file with full implementation
- `src/cli/commands/*.ts` — replaced `console.log` with logger calls
- `src/agent/manager.ts` — uses logger for agent lifecycle events

---

## 3. Graceful Shutdown ✅

### Problem
- `index.ts` had no drain of in-flight tasks
- Agent subprocesses were orphaned on crash
- No SIGTERM/SIGINT handling

### Implementation — Done in `index.ts`

```typescript
// index.ts
async function gracefulShutdown(code = 0) {
  logger.info('system', 'Shutting down gracefully...')
  await agentManager.destroy()  // kills all agents
  // sandbox.cleanup()          // cleaned via agent destruction
  // apiServer?.stop()          // HTTP server lifecycle managed separately
  process.exit(code)
}

process.on('SIGINT', () => gracefulShutdown(0))
process.on('SIGTERM', () => gracefulShutdown(0))
```

- ✅ SIGINT/SIGTERM handlers flush telemetry, destroy agents, then exit
- ✅ `agentManager.destroy()` waits for all agents to stop
- ✅ `registerErrorBoundaries()` calls `gracefulShutdown()` on fatal errors
- ✅ API server has its own `stop()` method with WebSocket drain

### Files modified
- `index.ts` — restructured to use `gracefulShutdown()`
- `src/agent/manager.ts` — `destroy()` waits for all agents to stop

---

## 4. Configuration Hardening ✅

### Problem
- `AppConfig` was a loose interface with no validation
- Config loaded from `~/.aegis/config.json` with no schema check
- Corrupted config returned `{}` silently — no error feedback

### Implementation — Done in `src/config.ts`
- ✅ Zod schema for `AppConfig` with field-level validation
- ✅ `safeParse` on load with field-level salvage of valid fields
- ✅ `validateConfig()` function with descriptive error messages
- ✅ Warning logged with details on invalid fields

```typescript
const AppConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'deepseek', 'ollama', 'custom']).optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  // ... etc
})
```

### Files modified
- `src/config.ts` — added Zod validation with salvage on invalid config

---

## 5. Vault Encryption ✅

### Problem
- API keys stored in plaintext at `~/.aegis/vault.json`
- Any process with filesystem access can read credentials

### Implementation — Done in `src/vault/crypto.ts`
- ✅ AES-256-GCM encryption at rest
- ✅ Encryption key from `AEGIS_VAULT_KEY` env var or auto-generated `~/.aegis/.vault-key`
- ✅ Auto-migration from legacy `vault.json` to encrypted `vault.enc`
- ✅ No plaintext fallback — stale plaintext is removed after migration

### Files modified
- `src/vault/crypto.ts` — new module with encrypt/decrypt/key management
- `src/vault/manager.ts` — vault serialized as encrypted blob
- `src/cli/commands/config.ts` — shows encrypted vault status

---

## 6. API Server Hardening ✅

### Problem
- No request body validation
- `Access-Control-Allow-Origin: *` on every response
- No rate limiting
- No request logging

### Implementation — Done in `src/api/server.ts`
- ✅ Zod validation on all POST/PUT endpoints (SpawnAgentSchema, TaskGoalSchema, MemoryContentSchema, MemoryQuerySchema)
- ✅ CORS configuration with configurable origins via `AEGIS_API_CORS_ORIGINS`
- ✅ Rate limiting (token bucket, 100 req/min by default, configurable)
- ✅ Request logging with structured logger (method, path, IP)
- ✅ Security headers: CSP, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy
- ✅ Authentication via Bearer token or X-API-Key header
- ✅ WebSocket support with event bridge

### Files modified
- `src/api/server.ts` — validation, CORS, rate limiting, security headers, WebSocket

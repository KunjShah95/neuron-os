# Testing Strategy — Plan

> **Priority: P0.** Production readiness requires comprehensive test coverage.
> **Status: Historical planning document — items marked ✅ are implemented.**

---

## Current State

| Test Suite | Files | Status |
|------------|-------|--------|
| Dashboard TUI | `src/test-dashboard.ts` | 54 tests |
| Chat TUI | `src/chat/test-chat.ts` | 164 tests |
| Agent manager | `src/agent/test-manager.ts` | 7 tests |
| Agent runtime | `src/agent/test-runtime.ts` | 5 tests |
| AgentMemory connector | `src/memory/test-agentmemory.ts` | 42 tests |
| Memory system | `src/memory/test-memory-system.ts` | ✅ 33 tests: init, profile CRUD, daily logs, auto memories, fact extraction, search |
| Vector memory | `src/memory/test-vector.ts` | ✅ 21 tests: add, search, category, stats, remove, edge cases |
| Session store | `src/memory/test-session-store.ts` | ✅ 13 tests: CRUD, rename, export, agent traces |
| Agent engine | `src/agent/test-engine.ts` | ✅ 85 assertions: IPC, hooks, kill, routing, events, listing |
| Vault | `src/vault/test-vault.ts` | ✅ Exists — vault CRUD and encryption tests |
| TUI sessions | `src/test-tui-sessions.ts` | Exists |
| CLI smoke test | `scripts/test-cli-smoke.ts` | 46/48 pass |
| Docker sandbox | `src/sandbox/test-docker.ts` | Exists |
| Filesystem sandbox | `src/sandbox/test-filesystem.ts` | Exists |
| Process sandbox | `src/sandbox/test-index.ts` | Exists |
| Sandbox index | `src/sandbox/test-index.ts` | Exists |
| Config tests | `src/config/test-config.ts` | ❌ Not yet created |
| Integration tests | — | ❌ None |
| E2E tests | — | ❌ None |
| Coverage measurement | — | ❌ None |

---

## Test Pyramid

```
         ╱╲
        ╱ E2E ╲           ← 5-10 tests (full workflows)
       ╱────────╲
      ╱Integration╲       ← 20-30 tests (module interactions)
     ╱──────────────╲
    ╱   Unit Tests    ╲   ← ~180+ tests (✅ ~70 core module tests added)
   ╱────────────────────╲
  ╱    Static Analysis   ╲  ← TypeScript strict mode (already enabled)
 ╱────────────────────────╲
```

---

## Unit Tests Needed

### Priority 1: Core Modules (P0)

| Module | File | Test Count | What to Test | Status |
|--------|------|-----------|--------------|--------|
| Config | `src/config.ts` | 10+ | Load, save, merge, invalid JSON handling | ❌ Not yet |
| Vault | `src/vault/` | 15+ | Encrypt/decrypt, list, get, set, delete, missing file | ✅ `src/vault/test-vault.ts` exists |
| Agent Engine | `src/agent/engine.ts` | 15+ | Tool building, system prompt, streaming, error handling | ✅ 85 assertions via `test-engine.ts` |
| Agent Runtime | `src/agent/runtime.ts` | 10+ | Tool permissions, context building, soul loading | ⚠️ 5 tests exist |
| Agent Manager | `src/agent/manager.ts` | 20+ | Spawn, kill, IPC, recovery, hooks, events | ⚠️ 7 tests exist |
| Memory System | `src/memory/system.ts` | 20+ | Load/save, context building, search, fact extraction | ✅ 33 tests via `test-memory-system.ts` |
| Vector Memory | `src/memory/vector.ts` | 10+ | Embedding, search, add, remove, persistence | ✅ 21 tests via `test-vector.ts` |
| Session Store | `src/memory/sessionStore.ts` | 8+ | Save, load, list, delete, rename, export | ✅ 13 tests via `test-session-store.ts` |
| Sandbox (each) | `src/sandbox/*.ts` | 10+ | Path restriction, command restriction, status | ⚠️ Smoke tests exist |
| Tools | `src/tools/*.ts` | 15+ | Registration, execution, error handling | ❌ Not yet |
| AI Provider | `src/ai/provider.ts` | 10+ | Provider selection, model selection, config | ❌ Not yet |
| MCP Client | `src/mcp/client.ts` | 8+ | Connect, discover tools, execute, error handling | ❌ Not yet |
| Cron Engine | `src/cron/index.ts` | 8+ | Add, remove, list, heartbeat, persistence | ❌ Not yet |
| CLI Commands | `src/cli/commands/*.ts` | 20+ | Each command handler with mocked dependencies | ❌ Not yet |

### Total: ~180+ unit tests (✅ ~70 core module tests added so far)

---

## Integration Tests Needed

| Scenario | What It Validates |
|----------|------------------|
| Agent spawn → IPC → task result | End-to-end agent lifecycle |
| Memory save → search → retrieve | Memory persistence pipeline |
| Sandbox restrict → allow → deny | All 3 sandbox types |
| Config save → restart → load | Config persistence |
| Session save → export → import | Session portability |
| API server → agent spawn → health check | API ↔ agent integration |
| Vector add → search → score ranking | Vector search correctness |
| Tool registration → execution → error | Tool pipeline |

---

## E2E Tests Needed

| Scenario | Description |
|----------|-------------|
| CLI smoke test | All 20 commands run without crash (exists in `scripts/test-cli-smoke.ts`) |
| Chat flow | Send message, receive streaming response, clear, restart |
| Agent workflow | Spawn agent → assign task → receive result → kill |
| Setup wizard | Complete setup flow with mock provider |
| Web dashboard | Build dashboard, verify all 12 routes render |

---

## Test Infrastructure

### Test Runner

Current tests use assertion-based approach (no framework). Consider:

| Option | Pros | Cons |
|--------|------|------|
| Keep assertion-based | Zero deps, works everywhere | No fixtures, no mocking, no reporting |
| Bun:test | Built-in, fast, supports mocks | Bun-specific |
| Vitest | Fast, Jest-compatible API, mocking | Additional dependency |

**Recommendation:** Use `bun test` (Bun's built-in test runner) — zero deps, supports `describe`/`it`/`expect`, watch mode, coverage via `bun test --coverage`.

### Coverage Thresholds

```json
{
  "scripts": {
    "test:coverage": "bun test --coverage"
  }
}
```

Target:
- Lines: ≥40% (initial), ≥70% (production)
- Functions: ≥50% (initial), ≥75% (production)
- Branches: ≥30% (initial), ≥60% (production)

### Mock Strategy

```typescript
// src/test/mock-provider.ts
export class MockAIProvider {
  getModel() {
    return {
      doStream: () => ({
        textStream: (async function*() {
          yield 'Hello, '
          yield 'world!'
        })(),
      }),
    }
  }
}

// src/test/mock-agent-manager.ts
export function createMockAgentManager() {
  const agents = new Map()
  return {
    spawn: async (def: AgentDef) => { /* ... */ },
    kill: async (id: string) => { /* ... */ },
    list: () => Array.from(agents.values()),
    // ...
  }
}
```

---

## Testing Guidelines

1. **Every exported function** should have at least one test
2. **Error paths** must be tested (not just happy paths)
3. **File system tests** use temporary directories (clean up in `afterEach`)
4. **Network-dependent tests** are skipped unless env vars are set
5. **Flaky tests** are quarantined in a separate CI job
6. **Coverage regressions** block PRs after threshold is met

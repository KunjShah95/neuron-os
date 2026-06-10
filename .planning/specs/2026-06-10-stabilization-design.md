# Aegis Stabilization — Public Deployment Design

**Date:** 2026-06-10  
**Goal:** Every command works reliably for public users. New user can go from `npm install` to working chat in under 5 minutes.

---

## Scope

Four independent phases. Each deliverable separately. Later phases build on earlier ones.

---

## Phase 1 — Command Hardening

### Problem
- `research` command fails with OpenAI-specific SDK error even when user has Anthropic/OpenRouter keys
- HTTP server `/health` returns 404; correct path is `/api/v1/health` — breaks curl health checks and install.sh references
- LLM-dependent commands (`ask`, `plan`, `research`, `orchestrate`, `agent-run`, `chat`) surface cryptic AI SDK errors instead of actionable messages when no provider is configured
- Windows: bash-tool and signal handling use POSIX assumptions

### Design

**Provider guard utility** (`src/ai/provider-guard.ts`):
```ts
export function requireAnyProvider(): void
```
Checks `resolveApiKey` for all known providers. If none configured, prints:
```
  ✗ No API key configured.
  Run: aegis setup-keys
  Docs: https://github.com/KunjShah95/neuron-os#providers
```
Then `process.exit(1)`. Called at top of every LLM-dependent command action handler.

**`research` fix:** The command uses Vercel AI SDK tool calls that default to OpenAI. Fix: use `getDefaultProvider()` to select configured provider before invoking tool-augmented generation. Remove any hardcoded `openai` model references.

**HTTP `/health` alias:** Add `app.get("/health", ...)` alias in `src/api/server.ts` that proxies to the `/api/v1/health` handler. Keeps existing path working, adds root path for ops tooling.

**Windows signal fix:** Replace `process.on("SIGTERM")` / `process.kill(pid, "SIGTERM")` patterns with cross-platform wrapper that uses `taskkill` on win32.

### Success Criteria
- `aegis research "test"` with only Anthropic key → uses Anthropic, not OpenAI error
- `aegis chat` with zero keys → shows setup-keys prompt, exits cleanly
- `curl http://localhost:8080/health` → `{"status":"ok",...}`
- All commands exit 0 on `--help` on Windows

---

## Phase 2 — First-Run UX

### Problem
- New user installs, runs `aegis chat`, gets cryptic error
- `aegis doctor` shows warnings with no guidance on fixing them
- `aegis init` flow doesn't detect if setup succeeded before launching

### Design

**Zero-key detection in `aegis init`:**
```
aegis init
→ Welcome to Aegis!
→ No API keys found. Starting setup...
→ [runs setup-keys]
→ Keys saved. Running doctor to verify...
→ [runs doctor]
→ ✓ Ready! Run: aegis chat
```
If user skips setup-keys (Ctrl+C), print next steps and exit 0. Don't hang.

**`aegis doctor` next-steps block:**
After existing checks, if warnings > 0, print:
```
  Fix issues:
    aegis setup-keys       → configure API keys
    aegis doctor --fix     → auto-fix what's possible
```

**`aegis chat` zero-key guard:**
Before entering REPL, call `requireAnyProvider()`. Show message + exit instead of crashing mid-session.

**`aegis wakeup` first-run detection:**
If zero keys configured AND no sessions exist, append banner:
```
  👋 First time? Run: aegis init
```

### Success Criteria
- Fresh install (zero config) → `aegis init` completes → `aegis chat` works
- `aegis doctor` with missing key → prints fix command
- `aegis chat` with no key → clean error, not SDK exception stacktrace

---

## Phase 3 — Smoke Test Suite

### Problem
- Zero automated coverage of CLI command behavior
- Regressions only discovered when users hit them
- 83 commands, no test matrix

### Design

**Test file:** `src/cli/cli.smoke.test.ts`

**Coverage tiers:**

Tier 1 — `--help` works (all 83 commands):
```ts
for (const cmd of ALL_COMMANDS) {
  test(`${cmd} --help exits 0`, async () => { ... })
}
```

Tier 2 — non-LLM commands run end-to-end:
- `doctor`, `health`, `status`, `wakeup`, `session list`, `memory stats`, `trigger list`, `router list`, `predict status`, `audit list`, `cost status`

Tier 3 — LLM commands with no-key guard:
- `chat`, `ask <q>`, `plan <g>`, `research <g>` with zero env → clean error exit, no crash, exit code 1

**CI matrix** (`.github/workflows/ci.yml` update):
```yaml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
```
Run smoke tests on all three platforms.

**Convention:** any new command file in `src/cli/commands/` must export a `commandName` const. The smoke test auto-discovers via this export.

### Success Criteria
- `bun test src/cli/cli.smoke.test.ts` passes on Linux, Windows, macOS
- CI fails if new command added without test tier assignment
- Zero-key error path tested for all LLM commands

---

## Phase 4 — Docs + Observability

### Problem
- `install.sh` references version `0.2.1` (stale)
- No `CONTRIBUTING.md` for open-source contributors
- Errors are opaque strings — hard to search/file issues

### Design

**Version sync in install scripts:**
`install.sh` and `install.ps1`: replace hardcoded version with GitHub API call to latest release tag. Already partially done — verify `VERSION=latest` path works correctly end-to-end.

**`CONTRIBUTING.md`:**
- Dev setup: `git clone`, `bun install`, `bun run index.ts --help`
- Run tests: `bun test`
- Add command: file in `src/cli/commands/`, register in `src/cli/commands/index.ts`
- Submit PR checklist

**Structured error codes:**
Add `AEGIS_ERR_` prefix constants for common failures:
```ts
export const ERR = {
  NO_PROVIDER: "AEGIS_E001",
  BUDGET_EXCEEDED: "AEGIS_E002",
  AGENT_TIMEOUT: "AEGIS_E003",
  INVALID_CONFIG: "AEGIS_E004",
} as const
```
Error output format: `✗ [AEGIS_E001] No API key configured.`
Users can search error codes in issues/docs.

**`aegis doctor --fix`:**
Auto-fix subset of doctor issues:
- Missing `~/.aegis` dir → create it
- Missing env vars → offer to run `setup-keys`
- Stale binary cache → delete and re-download

### Success Criteria
- `curl install.sh | bash` on clean machine downloads latest binary
- New contributor can run tests within 5 minutes of cloning
- Every error message includes `AEGIS_EXXX` code

---

## Dependency Order

```
Phase 1 (provider-guard, /health alias)
  └── Phase 2 (first-run UX uses provider-guard)
        └── Phase 3 (smoke tests verify Phase 1+2)
              └── Phase 4 (docs + error codes)
```

Phases 1 and 4 can partially overlap. Phase 3 should start after Phase 1 is stable.

---

## Out of Scope

- New features (marketplace, voice, distributed) — not blocked on stabilization
- Dashboard UI — separate effort
- Performance optimization — post-stabilization

# Changelog

All notable changes to this project are documented below.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-06-06

### Added

- **Marketing landing page** — new `website/` directory (Vite + React 19 + Framer Motion 12 + Tailwind 3) with a redesigned hero, features grid, architecture diagram, terminal demo, metrics, tech stack, use cases, docs preview, changelog timeline, FAQ accordion, and CTA panel. Liquid-glass surfaces, animated orb background, custom dark palette (purple / pink / cyan / green / yellow), and `prefers-reduced-motion` support.
- **Multi-platform adapter gateway** — `src/adapters/` now ships with Discord, Slack, SMS (Twilio), Voice (Twilio), WhatsApp, Email (Nodemailer), Webhook, and Bot-Commands adapters behind a single `gateway.ts` interface. Includes 4 adapter test files (gateway, sms, whatsapp, hmac).
- **HMAC-signed REST API** — `src/api/hmac.ts` with timing-safe comparison, replay-protection window, and a `hmac.test.ts` covering sign / verify / replay / tampering cases.
- **New AI providers** — Mistral, Azure OpenAI, and Together AI are now first-class in `src/ai/providers.ts`, with a `providers.test.ts` smoke test.
- **Test framework migration** — agent / audit / bench / chat / cron / harness / mcp / memory / mesh / sandbox / tools / vault suites migrated from `test-*.ts` to `*.test.ts` naming so they run under `bun test --coverage` and Codecov. New tests added: planner, ratchet, supervisor, runtime, docker / filesystem / process (sandbox), runner, reporter, embedding, computer, rbac.
- **GitHub Actions coverage reporting** — `ci.yml` runs `bun test --coverage` and uploads to Codecov with a `dashboard` flag for vitest output.
- **`docs/superpowers/specs/2026-06-05-cost-attribution-design.md`** — design spec for Sprint 17 (cost attribution & agent benchmarking), tracking real implementation that replaces the stubbed `src/billing/tracker.ts` and `src/telemetry/cost.ts`.

### Changed

- `tsconfig.json` now excludes `website/` from the root `tsc --noEmit` (the website has its own `tsconfig.app.json`); the pre-commit hook runs both typechecks in sequence.
- `.husky/pre-commit` runs `bunx tsc --noEmit` (root) **and** `bunx tsc -b` (website) so both projects stay clean.
- Dashboard files were refactored from `dashboard/src/site/*.tsx` to `dashboard/src/site/components/` to keep imports relative now that they mirror the website's component layout.
- README and `ROADMAP.md` updated to mention the website, the adapter gateway, and the upcoming v0.6.0+ vision.

### Removed

- Runtime SQLite databases (`data/audit/*.db*`, `data/telemetry/*.db*`, `data/experience/*.db*`) and ephemeral state directories (`.aegis/`, `.superpowers/`, `.commandcode/`, `.worktrees/`) are now gitignored — they are runtime state, not source.
- Test stub utilities (`src/utils/doSomething.ts`, `greet.ts`, `hello.ts`), the one-time `copy-site.js` script, and the top-level `task.md` / `implementation_plan.md` planning artifacts are no longer tracked.

## [Unreleased]

### Added
- **Phase 6 — Self-improvement skill pipeline**: `src/improve/eval-validator.ts` validates skill candidates against the GraderSuite before publishing; `src/improve/skill-monitor.ts` tracks skill performance over time with trend analysis, degradation detection, and improvement suggestions. CLI: `aegis improve validate` (run/list/stats), `aegis improve monitor` (status/list/degrading/top/record).
- **Phase 7 — Multi-agent orchestration harness**: `src/harness/multi-agent.ts` defines 6 coordination patterns (sequential, parallel, debate, hierarchical, voting, refine) with typed `MultiAgentTest` definitions and a scenario factory; `src/harness/multi-agent-collector.ts` collects handoff accuracy, context loss, consensus quality, parallel speedup, Gini coefficient, and per-agent metrics. CLI: `aegis eval multi-agent` (list/run/metrics).
- **Phase 8 — Golden dataset manager**: `src/harness/golden-dataset.ts` implements the Silver→Gold→Audit→Archived pipeline for human-verified eval tasks with file persistence; `src/harness/golden-validator.ts` cross-validates tasks across multiple LLM models. Tasks auto-discovered via `evals/golden/` with `aegis eval run --golden`. CLI: `aegis eval golden` (create/list/promote/audit/archive/stats).
- **Unit test suites** (66 tests total): `src/improve/eval-validator.test.ts` (11 tests), `src/improve/skill-monitor.test.ts` (17 tests), `src/harness/golden-dataset.test.ts` (24 tests), `src/harness/multi-agent-collector.test.ts` (14 tests).
- **Dashboard eval panels**: Golden Dataset (🥇), Skill Pipeline (🔧), and Multi-Agent (🤖) panels in `dashboard/src/routes/Eval.tsx` with stat summaries and CLI quick-refs.
- **Calibration comparison script improvements**: `scripts/calibration-compare.ts` now supports `LIMIT=N` env var to run only N examples (default: all 40), and Groq + Ollama models in `DEFAULT_MODELS` with proper API key handling for local providers.
- **JSON test loader**: `src/harness/discover.ts` now includes a `jsonLoader` that parses GoldenTask JSON files (single or array) into `TestCase` objects.

- **Auto-generated docs source** — `scripts/extract-commands.ts` parses `src/cli/commands/*.ts` via the TypeScript Compiler API and emits `shared/commands.json` (128 commands as of this write). The dashboard and website docs sections now consume this file as a single source of truth instead of hand-maintained command arrays. New scripts: `bun run docs:generate` / `bun run docs:check`. `pretest` runs `docs:check` to fail CI on drift.

### Fixed
- **SkillMonitor recursion bug**: `generateSuggestions()` no longer calls `this.getPerformance()` internally, which caused infinite recursion and `Maximum call stack size exceeded`.


- **Generator test suite** — `scripts/__tests__/extract-commands.test.ts` with 3 fixture files (`simple.ts`, `with-options.ts`, `with-subcommands.ts`) covering simple chains, alias/description/options/defaults, and parent+subcommand extraction. All 3 tests pass; the test is registered in `scripts/run-tests.ts`.
- **Dashboard docs layer** — `dashboard/src/data/commandGroups.ts` derives 11 hand-curated groups (system, setup, agents, orchestration, memory, knowledge, schedule, serve, adapters, sessions, runtime) from `shared/commands.json` and adds icon/tag metadata. `dashboard/src/routes/Docs.tsx` now imports this layer; the hand-maintained `commandGroups` array is gone.
- **Website docs layer** — `website/src/data/docTopics.ts` exposes `navGroups`, `docTopics`, and `defaultTopic` (15 curated topics) sourced from `shared/commands.json` via a `row(name)` helper that resolves command descriptions from the JSON. `website/src/sections/DocsSection.tsx` now imports this layer; the hand-maintained `navGroups` / `docContent` / `defaultContent` constants are gone.
- **Design spec** — `docs/superpowers/specs/2026-06-06-docs-section-update-design.md` captures the contract: schema, file layout, CI wiring, risks, migration plan.
- Multi-stage Dockerfile with `oven/bun:1-slim` production image, HEALTHCHECK, non-root user
- `docker-compose.yml` with named volume, env passthrough, and dashboard-dev profile (Vite HMR)
- `.dockerignore` with comprehensive exclusion rules
- **AES-256-GCM vault encryption**: `src/vault/crypto.ts` with key management (`AEGIS_VAULT_KEY` env var or auto-generated `~/.aegis/.vault-key`), auto-migration from legacy `vault.json`, no plaintext fallback
- **Structured logger** (`src/cli/logger.ts`): levels, JSON output in non-TTY, pretty-print in TTY, module-scoped instances, writes to stderr
- **Error boundaries** (`src/cli/guard.ts`): `registerErrorBoundaries()` for `unhandledRejection` + `uncaughtException`
- **Graceful shutdown** (`index.ts`): SIGINT/SIGTERM handlers with agent cleanup via `agentManager.destroy()`
- **Zod config validation** (`src/config.ts`): `validateConfig()` with field-level salvage on invalid config
- **API hardening** (`src/api/server.ts`): CORS with configurable origins, rate limiting (100/min), input validation, security headers
- **Unit test suites**:
  - `src/memory/test-memory-system.ts` — 33 tests: init, user profile CRUD, daily logs, auto memories, fact extraction, search, context building
  - `src/memory/test-vector.ts` — 21 tests: add, search, category, stats, remove, edge cases
  - `src/memory/test-session-store.ts` — 13 tests: CRUD, rename, export, agent traces
  - `src/agent/test-engine.ts` — 85 assertions: IPC handling, hooks, kill, routing, events, listing
- **Architecture documentation**: agent system, memory system, sandbox system deep-dives
- **Developer guides**: creating modes, tools, and agent types step-by-step
- **REST API reference**: all endpoints with examples, validation rules, error codes
- `CHANGELOG.md` and `SECURITY.md` files

### Changed
- `dashboard/src/routes/Docs.tsx` — no longer hardcodes 13 stale command groups; renders directly from the generated JSON via `dashboard/src/data/commandGroups.ts`.
- `website/src/sections/DocsSection.tsx` — no longer hand-maintains 16 marketing copy blocks; renders from `website/src/data/docTopics.ts`. The "Reflection loop" topic no longer references the non-existent `aegis agent-run --ratchet` flag; "Provenance" topic is gone (no `provenance` command exists).
- `dashboard/tsconfig.json` and `website/tsconfig.app.json` — added `resolveJsonModule: true` so both can import `shared/commands.json`.
- `scripts/run-tests.ts` — registers the new docs generator test before the integration tests.
- `src/vault/manager.ts` — vault serialized as encrypted blob (`vault.enc`), auto-migrates from legacy `vault.json`, removes stale plaintext
- `src/cli/commands/config.ts` — shows `vault.enc` path and "AES-256-GCM encrypted" in status
- `README.md` — added Docker usage section with build/run/compose commands and security notes
- `docker-compose.yml` — removed deprecated `version` field

## [2026-05-31]

### Added
- Sandbox system: `FilesystemSandbox`, `ProcessSandbox`, `DockerSandbox` implementations with common interface
- Computer use tool: screen interaction via `src/tools/computer.ts`
- Agent evaluation harness: `src/harness/` with reporter, runner, and test types
- Dashboard routes for MCP, Memory, Serve, Setup, Skills, Status with corresponding UI components
- AgentMemory sidecar integration: REST connector, smart-search fusion, CLI mode, mode registration
- Mode launcher: keyboard-navigable mode selection, MCP CLI, memory CLI, vector memory, type fixes
- Web tools: `web_fetch` and `web_search` tools
- MCP integration: stdio and HTTP server modes
- Shell mode: inline command execution in chat
- Checkpoint/rewind system in chat store
- Model picker UI: provider and model selection in chat
- Vector memory: 128-dim hash-based embeddings with cosine similarity search
- 11-mode agent type system: build, plan, read, write, test, validate, review, debug, document, refactor, deploy, monitor, explore
- Session management actions: delete, rename, export with pendingAction confirmation flow
- CI/CD pipeline: GitHub Actions with setup-bun, dependency caching, typecheck before tests

### Fixed
- Corrected TypeScript type issues in ChatState.config — removed `any` casts in renderer and store
- Test exit codes, session persistence, slash command handling
- README formatting and clarity improvements
- Security: removed API key history from git

### Infrastructure
- GitHub Actions CI with matrix strategy (typecheck + test)
- PR templates for bug reports, feature requests, and changes
- PR description templates for security, session management, TUI tests, and type tightening

## [2026-05-31] — Initial Release

### Added
- First commit with core project structure
- Agent system: `AgentManager`, `AgentEngine`, `HookRegistry`, `AgentRuntime`
- CLI framework with command routing
- AI provider system with OpenAI, Anthropic, DeepSeek, Ollama support
- Tool registry with 10 built-in tools (read, write, edit, bash, grep, glob, etc.)
- GPT-4 based agent worker
- Mode system with chat, config, status, and dashboard modes
- TUI dashboard with agent list, activity log, status bar, command bar
- Memory system with user profile, long-term memory, daily logs, auto memories
- Session store with save/load/list/delete/rename/export
- Fact extraction with regex-based pattern matching
- Vault system for credential storage
- Cron engine for scheduled tasks
- MCP server for agent tool exposure
- Skills system for reusable workflows
- Web search and web fetch tools
- Configuration system with environment variable support
- Original 11-mode system

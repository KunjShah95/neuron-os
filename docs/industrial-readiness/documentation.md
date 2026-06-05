# Documentation & Developer Experience — Plan

> **Priority: P1.** Good docs multiply the project's impact.
> **Status: Historical planning document — items marked ✅ are implemented.**

---

## Current Gaps

| Document | Status | Notes |
|----------|--------|-------|
| README.md | ✅ Good overview | Covers features, setup, architecture, commands |
| ROADMAP.md | ✅ Exists | Good high-level milestones |
| CONTRIBUTING.md | ✅ Exists | Basic process |
| CHANGELOG.md | ✅ Added | Release history with dates, features, fixes |
| API reference | ✅ Added | `docs/api/rest.md` — all endpoints with schemas, auth, examples |
| Architecture deep-dive | ✅ Added | `docs/architecture/agent-system.md`, `memory-system.md`, `sandbox.md` |
| Developer guides | ✅ Added | `docs/development/creating-a-mode.md`, `creating-a-tool.md`, `creating-an-agent-type.md` |
| SECURITY.md | ✅ Added | Vulnerability disclosure policy, security contacts |
| Tutorials | ❌ Missing | No "getting started" walkthrough |
| Plugin dev guide | ❌ Missing | No docs for extending the system |
| Troubleshooting guide | ⚠️ Partial | In README FAQ section — too brief |
| Code comments | ❌ None | Deliberate choice (self-documenting code) |
| Video/demo | ❌ Missing | No visual introduction |
| i18n / Chinese docs | ❌ Missing | Limits global reach |

---

## Documentation Plan

### Phase 1: Immediate (1-2 days) — ✅ Mostly Complete

| Item | Format | Description | Status |
|------|--------|-------------|--------|
| `CHANGELOG.md` | Markdown | Release history with dates, features, fixes, breaking changes | ✅ Done |
| `docs/industrial-readiness/*.md` | Markdown | Assessment docs (this directory) | ✅ Done |
| `SECURITY.md` | Markdown | Vulnerability disclosure policy, security contacts | ✅ Done |
| `docs/commands.md` | Markdown | Full CLI reference with examples for all 20 commands | ❌ Not yet |

### Phase 2: Developer Docs (1 week) — ✅ Complete

| Item | Format | Description | Status |
|------|--------|-------------|--------|
| `docs/architecture/agent-system.md` | Markdown | Agent lifecycle, IPC protocol, hook system, recovery | ✅ Done (333 lines) |
| `docs/architecture/memory-system.md` | Markdown | Memory storage, vector search, fact extraction | ✅ Done (283 lines) |
| `docs/architecture/sandbox.md` | Markdown | Triple-layer sandboxing design | ✅ Done (145 lines) |
| `docs/development/creating-a-mode.md` | Markdown | Step-by-step guide for adding a new mode | ✅ Done (175 lines) |
| `docs/development/creating-a-tool.md` | Markdown | Step-by-step guide for adding a new tool | ✅ Done (209 lines) |
| `docs/development/creating-an-agent-type.md` | Markdown | Step-by-step guide for adding a new agent type | ✅ Done (146 lines) |
| `docs/api/rest.md` | Markdown | All REST API endpoints, request/response schemas, examples | ✅ Done (408 lines) |

### Phase 3: User Docs (1 week)

| Item | Format | Description |
|------|--------|-------------|
| `docs/guides/getting-started.md` | Markdown | 5-minute quickstart with screenshots |
| `docs/guides/chat.md` | Markdown | Using chat, slash commands, provider switching |
| `docs/guides/agents.md` | Markdown | Spawning, monitoring, agent types, best practices |
| `docs/guides/skills.md` | Markdown | Installing, creating, and managing skills |
| `docs/guides/sandbox.md` | Markdown | Security sandbox configuration |
| `docs/guides/harness.md` | Markdown | Test harness for agent evaluation |

### Phase 4: Advanced (2-3 weeks)

| Item | Format | Description |
|------|--------|-------------|
| `docs/operations/deployment.md` | Markdown | Docker, K8s, production deployment guide |
| `docs/operations/security.md` | Markdown | Security best practices, threat model |
| `docs/operations/monitoring.md` | Markdown | Logging, metrics, alerting setup |
| `docs/contributing/plugin-development.md` | Markdown | Plugin API reference, examples |
| `docs/contributing/testing.md` | Markdown | Testing guidelines, mock patterns, CI |
| API reference (auto-generated) | TypeDoc | Generated from TypeScript source |

---

## CLI Experience Improvements

| Feature | Status | Notes |
|---------|--------|-------|
| `--help` on all commands | ✅ Works | Each command has description and usage |
| Shell autocompletion | ❌ Missing | bash/zsh/fish completion scripts |
| Colors / formatting | ✅ picocolors | Good colored output |
| Progress indicators | ❌ Missing | Spinner for long operations |
| Error suggestions | ❌ Missing | "Did you mean X?" on typos |
| Update notifications | ❌ Missing | Check for new version on startup |

---

## README.md Improvements

Current README is comprehensive but could benefit from:

1. **Badge row** — CI status, coverage, npm version, license
2. **Screenshots** — Terminal screenshots of dashboard and chat
3. **Demo GIF** — Asciicast or terminal recording
4. **Quick install** — `bun install -g neuron-os` (once published)
5. **Use cases** — 3-5 example scenarios with commands
6. **Related projects** — Comparison with similar tools

---

## Documentation Standards

| Rule | Description |
|------|-------------|
| **All docs in Markdown** | `.md` files, GitHub-flavored markdown |
| **Code examples are runnable** | Every example is tested inline |
| **No stale docs** | Docs are reviewed when related code changes |
| **Versioned** | Major docs versioned with releases |
| **Accessible** | Alt text on images, semantic headings, color-contrast aware |

# Auto-Fix Failing CI — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** v0.9.x — `aegis ci watch` daemon + GitHub Action + cost-bounded auto-fix

## Context

OpenAI Codex's GitHub Action (`openai/codex-action`) and Cline both ship "fix the failing CI" loops: detect a CI failure, spawn an agent to investigate, propose a patch, optionally open a PR. Cline calls it "Auto-Fix"; Codex calls it "auto-fix failing CI". Both ship in production.

Aegis already has the pieces: HMAC-signed REST API (`src/api/hmac.ts`), 8 messaging adapters (`src/adapters/`), lifecycle hooks (`AGENTS.md`), the cost tracker (from the cost-attribution spec), and `build`/`test`/`debug` agent types. What's missing is the **integration glue**: a `aegis ci watch` daemon, a GitHub Action that calls it, and a PR-creation flow that respects Aegis's approval policy.

This spec:
1. Adds a `aegis ci watch` daemon that listens for CI failure webhooks
2. Ships a one-line GitHub Action wrapper
3. Implements cost-bounded auto-fix: spawn a `debug` agent, propose a patch, open a PR with a `ci-fix` label
4. Supports opt-in auto-merge with a strict path allowlist
5. Posts to configured gateway adapters on success/failure

## 1. Goals

1. **`aegis ci watch`** — daemon mode; subscribes to GitHub webhooks; on failure, spawns a `debug` agent
2. **GitHub Action** — `KunjShah95/aegis-action@v1` (or in-repo `.github/actions/aegis-ci-fix`); one-line drop-in
3. **PR creation with `ci-fix` label** — agent opens a PR; PR body explains the fix
4. **Auto-merge opt-in** — `auto_merge: true` in config; only for repos where Aegis has write access AND a configured allowlist
5. **Cost-bounded** — default $0.50 per CI run; aborts and reports if exceeded
6. **Notification** — posts to configured gateway (Discord/Slack/Telegram) when a fix is proposed or merged

## 2. Non-Goals (v1)

- Full "agent owns the PR lifecycle" (humans always review the PR; Aegis is an author, not a merger by default)
- Multi-repo coordination (one repo at a time per daemon)
- Cross-CI-provider abstraction (GitHub Actions only for v1; Jenkins/CircleCI/Buildkite tracked for v2)
- Self-hosted CI (assumes GitHub-hosted runners)
- Multi-PR for the same failure (one PR per run; if 2 failures happen close together, they queue)
- Fixing the local test suite outside of CI (no "fix the failing test in dev" mode in v1)

## 3. Architecture

```
  ┌────────────────────────────────────────────────────────┐
  │  .github/workflows/aegis-ci.yml                        │
  │    on: workflow_run { workflows: ['CI'], types: ['completed'] }│
  │    if: ${{ github.event.workflow_run.conclusion == 'failure' }}│
  │    steps:                                              │
  │      - uses: KunjShah95/aegis-action@v1                │
  │        with: { api_url, hmac_key, repo, run_id }       │
  └─────────────┬──────────────────────────────────────────┘
                │ POST /api/v1/ci/fix { repo, run_id, ... }
                ▼
  ┌────────────────────────────────────────────────────────┐
  │  src/ci/                                               │
  │    - server.ts     (HMAC-auth webhook endpoint)        │
  │    - watcher.ts    (daemon: subscribes + dispatches)   │
  │    - investigator.ts (spawns debug agent in worktree) │
  │    - pr-creator.ts (opens PR via gh CLI or octokit)    │
  │    - merger.ts     (auto-merge with allowlist)         │
  │    - notifier.ts   (gateway channel posts)             │
  └────────────────────────────────────────────────────────┘
```

## 4. Config (`~/.aegis/ci.yaml`)

```yaml
repos:
  - owner: KunjShah95
    name: neuron-os
    auto_merge: false
    model: claude-sonnet-4-6
    budget_usd: 0.50
    notify: [discord:#dev]
    allowed_paths: []                          # ignored when auto_merge is false
  - owner: myorg
    name: api
    auto_merge: true
    model: claude-sonnet-4-6
    budget_usd: 1.00
    allowed_paths: ['src/**', 'tests/**', '*.md']   # auto-merge only if all changes in these
    notify: [slack:#ci]
    require_human_approval_comment: true       # safer: don't merge until a human comments "LGTM"
```

## 5. CLI

```bash
aegis ci watch [--repo <owner/name>] [--budget 0.50] [--auto-merge] [--port 7117]
aegis ci status                                # show recent runs
aegis ci logs <run_id>
aegis ci disable <repo>                        # opt out
aegis ci config                                # interactive setup
aegis ci repos                                 # list configured repos
```

## 6. GitHub Action Wrapper

`KunjShah95/aegis-action/action.yml`:

```yaml
name: 'Aegis CI Fix'
description: 'Spawn an Aegis debug agent to investigate and propose a fix for a failed CI run'
inputs:
  api_url:
    description: 'Aegis daemon URL'
    required: true
  hmac_key:
    description: 'HMAC key for authenticating with the daemon'
    required: true
  repo:
    description: 'owner/name (defaults to current repo)'
    required: false
    default: ${{ github.repository }}
  budget_usd:
    description: 'Cost budget for this run'
    required: false
    default: '0.50'
runs:
  using: 'composite'
  steps:
    - shell: bash
      run: |
        curl -X POST "${{ inputs.api_url }}/api/v1/ci/fix" \
          -H "X-Aegis-Signature: $HMAC" \
          -H "Content-Type: application/json" \
          -d '{
            "repo": "${{ inputs.repo }}",
            "run_id": "${{ github.event.workflow_run.id }}",
            "head_sha": "${{ github.event.workflow_run.head_sha }}",
            "logs_url": "${{ github.event.workflow_run.logs_url }}",
            "budget_usd": ${{ inputs.budget_usd }}
          }'
```

## 7. Data Flow

1. CI fails on `main` (or any watched branch)
2. `aegis-ci.yml` workflow fires → POST to `aegis ci watch` with `{ repo, run_id, failed_jobs, logs_url, head_sha }`
3. Daemon validates HMAC; spawns a `debug` agent in a worktree at `head_sha`
4. Agent investigates: fetches logs (via the workflow run API), runs tests locally, identifies root cause
5. Agent proposes a patch; opens a PR with title `[ci-fix] <one-line description>` and label `ci-fix`
6. PR body includes: failing job names, root cause, diff summary, agent run URL, cost, agent run trajectory link
7. If `auto_merge: true` and all changed paths are in `allowed_paths` and CI is green on the new branch:
   - If `require_human_approval_comment: true`: wait for "LGTM" comment
   - Otherwise: squash-merge
8. Notification posted to configured channel with PR link

## 8. Error Handling

| Failure | Behavior |
|---|---|
| HMAC validation failure | Reject 401, log |
| Workflow run not found | 404, log |
| Budget exceeded mid-investigation | Commit current findings as a draft PR with `incomplete` note; notify |
| Agent gets stuck (no progress in 5min) | Kill, post "stuck, needs human" notification |
| PR creation failure (network / auth) | Retry with backoff (3 attempts); surface error |
| `auto_merge: true` but path is not in `allowed_paths` | Do NOT auto-merge; surface warning in PR comment |
| CI is still red on the new branch | Do NOT auto-merge; surface warning |
| Webhook arrives while another agent is still working on the same repo | Queue; do not parallelize per-repo |

## 9. Dependencies

| Package | Why | License |
|---|---|---|
| `@octokit/rest` | GitHub API client (PR creation, comments) | MIT |
| `node:crypto` (built-in) | HMAC signing/verification | — |
| `tar` (built-in via Bun) | Worktree bundling | — |

All MIT or built-in. No new bloat.

## 10. Testing

**Unit:**
- Webhook HMAC validation (valid, invalid signature, replay)
- Config loading (multi-repo, per-repo overrides)
- Budget enforcement (cost tracker integration)
- Allowlist path matching (glob)

**Integration:**
- Simulate CI failure → agent investigates → proposes patch → PR created (mock GitHub)
- Budget exceeded mid-run → draft PR with `incomplete` note
- Auto-merge only when path is in `allowed_paths`; otherwise surface warning
- Multiple failures in quick succession → queue, no parallel runs per repo

**E2E:**
- Real failure on a test repo (`KunjShah95/aegis-ci-test`) → fix proposed → human merges
- Auto-merge with `require_human_approval_comment: true` waits for the comment
- Notification posted to the configured channel

## 11. Phasing

| Phase | PR | What |
|---|---|---|
| 1 | `feat(ci): webhook endpoint + HMAC + aegis ci watch daemon` | Foundation |
| 2 | `feat(ci): debug agent integration + worktree` | Investigation |
| 3 | `feat(ci): PR creation via gh CLI / octokit` | Output |
| 4 | `feat(ci): GitHub Action wrapper` | User-facing entry point |
| 5 | `feat(ci): auto-merge with allowlist + human-approval opt-in` | Auto-merge |
| 6 | `feat(ci): gateway notifications` | UX |
| 7 | `docs(ci): user guide + GitHub Action setup` | User-facing |

## 12. Open Questions (for plan review)

- For `auto_merge: true`, do we require a human approval comment on the PR first (safer), or merge as soon as CI is green (faster)? Default: require (proposed).
- Multi-PR for the same failure: if 2 failures happen close together, do we open 2 PRs or queue them (1 PR that gets force-pushed)? Default: queue + force-push.
- Should we also support "fix the failing test in dev" (local-only mode without a real CI run)? Default: out of scope for v1; tracked for v2.
- For the `notify` channels, do we post on every state change (started, fix proposed, merged, failed) or only on terminal states (merged, failed)? Default: terminal states only (less noise).

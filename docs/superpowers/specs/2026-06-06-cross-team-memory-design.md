# Cross-Team Memory with Access Policy — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** v0.9.x — per-namespace ACL, grants, audit log

## Context

Aegis has per-agent memory namespaces (from the dialectic spec) and the AgentMemory sidecar with team-level namespaces. What's missing is **policy**: who can read whose memory. CrewAI, AutoGen, Hermes, nanobot — none have this. For enterprise adoption, it's table stakes.

This spec adds:
1. `policy.yaml` per memory namespace
2. ACL enforcement at recall time
3. Cross-team knowledge sharing with explicit grants
4. Time-boxed grants (`expires_at`)
5. Path-level controls (some entries can be read, others can't)
6. Per-tool filtering (a namespace can be queried but not used as input to a destructive tool)
7. Audit log of every cross-namespace read

## 1. Goals

1. **Per-namespace policy** — every memory namespace has `policy.yaml` with `allow` / `deny` rules
2. **ACL enforcement** — recall rejects if the requesting agent/team is not allowed
3. **Time-boxed grants** — `grant: { to: 'team-b', expires: '2026-12-31' }` — auto-revoke
4. **Path-level controls** — `path_filter: "docs/**"` — grant scoped to a glob
5. **Per-tool controls** — `tools_allowed: ['read', 'search']` — namespace can be queried but not used to feed a `terminal()` call
6. **Audit** — every cross-namespace read logged to `~/.aegis/memory/audit.jsonl`
7. **Default-deny** — namespaces are private by default; explicit grants required for sharing

## 2. Non-Goals (v1)

- BFT / consensus across instances (this is single-machine ACL)
- Cryptographic access control (no encryption; the threat model is "honest operator, different teams" not "adversary with disk access")
- Cross-instance sharing (memory sync is a separate concern; tracked for v0.9)
- Per-field redaction (we control at the namespace + path level, not per memory entry)
- Memory expiration/TTL beyond grants (namespaces don't auto-expire)
- Real-time policy propagation (policies are loaded on agent start; reload requires restart)

## 3. Architecture

```
  ┌────────────────────────────────────────────────────────┐
  │  ~/.aegis/memory/namespaces/                           │
  │    team-a/                                             │
  │      data.sqlite                                       │
  │      policy.yaml                                       │
  │    team-b/                                             │
  │      data.sqlite                                       │
  │      policy.yaml                                       │
  │    shared/                                             │
  │      data.sqlite                                       │
  │      policy.yaml   ← default-deny                      │
  └─────────────┬──────────────────────────────────────────┘
                │
                ▼
  ┌────────────────────────────────────────────────────────┐
  │  src/memory/policy/                                    │
  │    - schema.ts        (Zod)                            │
  │    - enforcer.ts      (called by RecallRetriever)      │
  │    - grant-manager.ts (issue / revoke / expire)        │
  │    - audit.ts         (logs every cross-ns read)      │
  └────────────────────────────────────────────────────────┘
```

## 4. Policy Schema (Zod)

```ts
const MemoryPolicy = z.object({
  namespace: z.string(),
  owner: z.string(),                                // team name
  default: z.enum(['allow', 'deny']).default('deny'),
  allow: z.array(z.object({
    principal: z.string(),                            // 'team-b' | 'agent:<id>' | 'role:review' | 'group:engineering'
    path_filter: z.string().optional(),               // glob over memory keys (e.g. "docs/**")
    tools_allowed: z.array(z.string()).default(['*']), // ['*'] = any tool; otherwise allowlist
    expires_at: z.number().optional(),                // unix ms; auto-revoke after
  })).default([]),
  deny: z.array(z.object({
    principal: z.string(),
    path_filter: z.string().optional(),
    reason: z.string().optional(),
  })).default([]),
})
```

## 5. Enforcer Logic

```ts
function canRead(requester: Principal, ns: string, path: string, tool: string): Decision {
  const policy = loadPolicy(ns)
  if (!policy) return { allowed: false, reason: 'no_policy_default_deny' }

  // Deny rules win
  for (const rule of policy.deny) {
    if (matchesPrincipal(rule.principal, requester) && matchesPath(rule.path_filter, path)) {
      return { allowed: false, reason: 'deny_rule', rule }
    }
  }

  // Allow rules (need at least one that matches AND is not expired AND allows the tool)
  const now = Date.now()
  for (const rule of policy.allow) {
    if (!matchesPrincipal(rule.principal, requester)) continue
    if (!matchesPath(rule.path_filter, path)) continue
    if (rule.expires_at && now > rule.expires_at) continue
    if (!rule.tools_allowed.includes('*') && !rule.tools_allowed.includes(tool)) continue
    return { allowed: true, rule }
  }

  // Default
  return {
    allowed: policy.default === 'allow',
    reason: policy.default === 'allow' ? 'default_allow' : 'no_allow_rule',
  }
}
```

## 6. Default Policy

A fresh namespace gets:

```yaml
namespace: team-a
owner: team-a
default: deny
allow: []
deny: []
```

The `default: deny` means: until an explicit `allow` rule is added, the namespace is readable only by the owner.

## 7. Grant Manager

```bash
aegis memory grant --namespace team-a --to team-b [--path "docs/**"] [--tools "read,search"] [--expires 2026-12-31]
aegis memory grant --namespace team-a --to team-b --path "secrets/**"   # explicit allow for a sub-path
aegis memory revoke --namespace team-a --to team-b
aegis memory grants list [--namespace team-a]
aegis memory grants show <grant_id>
aegis memory policy show <namespace>
aegis memory policy edit <namespace>      # opens $EDITOR on policy.yaml
aegis memory audit [--namespace team-a] [--since 7d] [--denied-only]
```

**Grant output:**
```
Granted: team-b can read team-a/docs/**
  Tools: read, search (no destructive)
  Expires: 2026-12-31 (305 days)
  Grant ID: 9f3a2b1c
```

## 8. Audit Log

`~/.aegis/memory/audit.jsonl` (one JSONL line per event):

```json
{ "ts": 1749200000000, "event": "read", "requester": "team-b/agent-x", "namespace": "team-a", "path": "docs/intro.md", "tool": "search", "allowed": true, "rule_id": "9f3a2b1c", "result_count": 3 }
{ "ts": 1749200001000, "event": "read", "requester": "team-c/agent-y", "namespace": "team-a", "path": "secrets/key.md", "tool": "read", "allowed": false, "reason": "no_allow_rule" }
{ "ts": 1749200002000, "event": "grant_expired", "namespace": "team-a", "to": "team-z", "grant_id": "8a7b6c5d" }
```

The audit log is itself a memory namespace with a `policy.yaml` (typically `default: allow` for the owner) — you can recall your own audit log.

## 9. Data Flow

1. Agent from team-b issues a recall query: `recall.query({ namespace: 'team-a', path: 'docs/intro.md', text: 'X' })` via the `aegis_memory` pseudo-tool
2. `enforcer.canRead(requester=team-b/agent-x, namespace=team-a, path=docs/intro.md, tool=search)`:
   - Check deny rules first (none match)
   - Check allow rules (one matches: `to: team-b, path_filter: docs/**, tools_allowed: [search, read]`)
   - Return `allowed: true`
3. Query, log to audit (`allowed: true, rule_id: ...`), return results
4. If a different tool was requested (e.g., `terminal`) → `tools_allowed` doesn't include it → reject

## 10. Error Handling

| Failure | Behavior |
|---|---|
| Policy file missing | Treat as default-deny; surface in dashboard |
| Policy parse error | Refuse all reads; surface in dashboard; halt agent startup with a clear error |
| Grant expiry passed | Auto-revoke; log to audit; continue without the grant |
| Audit write failure | **Fail closed** (deny the read) — better to break than to leak |
| `tools_allowed` excludes the caller's tool | Reject with clear message: "team-b can read this namespace with `read` and `search`, not with `terminal`" |
| Path filter matches no entries | Reject (or return empty, depending on config); default: reject |
| Concurrent policy edits | Mutex on `.policy.lock` |

## 11. Testing

**Unit:**
- Enforcer decisions for all combinations (allow, deny, expired, path-filter, tools-allowed, default-deny, default-allow)
- Grant manager (issue, revoke, expire, list)
- Audit log format

**Integration:**
- Team-b tries to read team-a without grant → denied + audited
- Team-b reads team-a with grant → allowed + audited
- Grant expires → next read denied + auto-revoke logged
- `tools_allowed` excludes the caller's tool → denied
- Path filter glob matches correctly (e.g., `docs/**` matches `docs/a/b.md`)

**E2E:**
- 2 teams; one queries the other; policy enforced; audit log written
- Dashboard "Memory" page shows the audit log + grant list
- A revoked grant is immediately rejected (no caching)

## 12. Phasing

| Phase | PR | What |
|---|---|---|
| 1 | `feat(memory): MemoryPolicy schema + enforcer` | Foundation |
| 2 | `feat(memory): default policy on new namespaces` | Bootstrapping |
| 3 | `feat(memory): grant-manager CLI` | UX |
| 4 | `feat(memory): audit log + dashboard view` | Observability |
| 5 | `feat(memory): per-tool filtering` | Granular control |
| 6 | `feat(memory): policy versioning (git-tracked)` | Auditable changes |
| 7 | `docs(memory): policy guide + team onboarding` | User-facing |

## 13. Open Questions (for plan review)

- For `path_filter`, do we support glob, regex, or both? Default: glob (familiar, fast).
- For `principal`, do we support groups (e.g., `team:engineering`) or only individual teams/agents? Default: both (proposed).
- Should policies be versioned (git-tracked) so changes are auditable? Default: yes, but opt-out per namespace.
- For `default: deny` with no `allow` rules, should the owner still be able to read? Default: yes (owner is implicitly allowed).
- When a grant is issued, should the grantor be notified by default? Default: no (audit log is enough).

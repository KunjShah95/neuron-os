# Security Whitepaper — Neuron OS

*Last updated: June 2026*

---

## Preface

I wrote this because enterprise procurement teams asked for it. Not because security is bolted on — it's not. But you can't expect someone to hand over API keys to a system that spawns autonomous agents without knowing exactly what's happening under the hood.

This document covers the threat model we designed against, the encryption we use and why, the access control model, sandbox isolation layers, and the things that will still bite you if you're not careful. It's written for two audiences: your security team during vendor review, and your ops engineers who actually have to run this thing.

---

## Table of Contents

1. [Threat Model](#1-threat-model)
2. [Encryption — What, Where, Why](#2-encryption)
3. [Access Control (RBAC)](#3-access-control)
4. [Sandbox Isolation](#4-sandbox-isolation)
5. [API Security](#5-api-security)
6. [Audit & Observability](#6-audit--observability)
7. [Enterprise Deployment Checklist](#7-enterprise-deployment-checklist)
8. [Compliance Mapping](#8-compliance-mapping)
9. [Incident Response](#9-incident-response)
10. [Known Gaps and Trade-offs](#10-known-gaps-and-trade-offs)

---

## 1. Threat Model

### 1.1 What are we protecting?

| Asset | Where it lives | Worst case if compromised |
|-------|----------------|---------------------------|
| AI provider API keys | `~/.aegis/vault.enc` | Someone runs up a $50k bill on your Anthropic account overnight |
| Agent session data | Local SQLite stores | Conversation history exposure |
| RBAC credentials | Auth database (SHA-256 hashed) | Privilege escalation across the API |
| Agent execution environment | Docker/Filesystem sandbox | Container escape → host access |
| Audit logs | Append-only log file | Covering tracks after an incident |

### 1.2 Trust boundaries

The system has four distinct trust boundaries, and each one enforces a different kind of check:

```
[Internet] → [API Gateway] → [RBAC Middleware] → [Agent Manager] → [Sandbox]
                                                      ↓
                                               [Credential Vault]
```

Boundary 1 (API Gateway) checks authentication. Boundary 2 (RBAC) checks authorization against the route. Boundary 3 (Agent Manager) isolates agents via sandbox profiles. Boundary 4 (Vault) decrypts credentials only for authorized agent types — a "build" agent can read the `ANTHROPIC_API_KEY`, but a "review" agent cannot.

### 1.3 Scenarios we designed for

| Scenario | How we handle it |
|----------|------------------|
| Someone steals your API key | Rate limiting (100 req/min/IP) buys you time. Keys are SHA-256 hashed in the DB — no plaintext to leak. Rotate with one command. |
| An agent tries to escape the sandbox | Three layers of containment. Docker with `--cap-drop=ALL`, `--security-opt no-new-privileges:true`, `--read-only`, `--network none`. Even if the agent process is compromised, it can't install a kernel module or reach out to a C2 server. |
| A replay attack against the API | HMAC signatures include a timestamp and nonce. Window is 5 minutes. Same nonce twice = rejected. |
| Credential vault file is stolen | AES-256-GCM with scrypt-derived key. The attacker has the ciphertext but not the key (which is in an env var or a 0600-permission file). Each entry has its own IV. |
| Insider threat — operator goes rogue | RBAC separates duties. An operator can spawn agents but can't modify user permissions or change config. Audit log records every action. |

---

## 2. Encryption

### 2.1 Credential vault

The vault is where we store your API keys for Anthropic, OpenAI, DeepSeek, all the providers. On disk, it's a single file at `~/.aegis/vault.enc`.

**Algorithm choices and why:**

- **AES-256-GCM**: We chose GCM over CBC because it's authenticated encryption — you can't modify the ciphertext without detection. CBC + HMAC would also work, but GCM does both in one pass.
- **scrypt** for key derivation (N=2^14, r=8, p=1): We deliberately avoided PBKDF2 because it's weak against GPU-parallelized attacks. scrypt is memory-hard — makes brute-forcing the key derivation much more expensive.
- **12-byte random IV per entry**: Same plaintext produces different ciphertext every time. Prevents dedup analysis.
- **Key sources**: `AEGIS_VAULT_KEY` env var (64 hex chars = 32 bytes) or `~/.aegis/.vault-key` with `chmod 600`. The key file approach is convenient for local dev but we recommend the env var for production.

**One thing that bit us during development:** The first version stored plaintext `vault.json`. When we added encryption, we had to write a migration path. The current code auto-detects the old format, encrypts it, and deletes the plaintext. If encryption fails (bad key, disk full), it throws an error — no silent fallback to plaintext. That one was a deliberate decision: failing loud is better than silently insecure.

### 2.2 Distributed transport

When agents run across multiple hosts (the distributed runtime), messages between workers are encrypted with AES-256-GCM using a key derived via SHA-256 from `AEGIS_CLUSTER_SECRET`. Same algorithm as the vault, different key derivation. The shared secret is never logged.

### 2.3 API signing

API requests to the HTTP server can be HMAC-SHA256 signed:

```
X-Aegis-Signature: <timestamp>.<nonce>.<hex_mac>
```

The verification uses `crypto.timingSafeEqual` to prevent timing side-channel attacks. The replay window is 300 seconds by default — adjustable via `AEGIS_API_REPLAY_WINDOW` if your clocks are particularly drift-prone.

---

## 3. Access Control (RBAC)

### 3.1 Roles

We ship with four roles. You can't create custom roles through the CLI yet (it's on the roadmap), but the underlying model supports arbitrary permission sets.

| Role | What they can do | What they can't |
|------|------------------|-----------------|
| `admin` | Everything — spawn agents, modify config, manage users, read all data | Nothing (they're admin) |
| `operator` | Spawn agents, view status/logs, run evals | Modify config, manage users, change RBAC roles |
| `developer` | Spawn scoped agent types (build, test, read), view own logs | Spawn production agent types, access vault, modify config |
| `viewer` | Read status, dashboards, audit logs | Spawn anything, modify anything |

### 3.2 API keys

Keys are generated with `crypto.randomBytes(32)` — 256 bits of entropy. They're prefixed with a human-readable role tag (e.g., `aegis_admin_a7f3...`) so you can tell at a glance what a key is for.

**Storage:** SHA-256 hash. We don't store the plaintext key. This means if someone dumps the auth database, they get hashes, not credentials. It also means we can't show you your key after creation — we show it once, and if you lose it, you rotate.

Keys are checked on every request against the route-permission matrix. No caching of auth decisions — if you revoke a key, it's effective immediately.

### 3.3 Route permission matrix

| Route | Methods | Who can call it |
|-------|---------|-----------------|
| `/api/v1/health` | GET | Anyone (no auth required) |
| `/api/v1/status` | GET | viewer+ |
| `/api/v1/agents` | GET | viewer+ |
| `/api/v1/agents` | POST/PUT | operator+ |
| `/api/v1/memory` | GET | developer+ |
| `/api/v1/memory` | POST | developer+ |
| `/api/v1/config` | GET | operator+ |
| `/api/v1/config` | POST/PUT/DELETE | admin only |
| `/api/v1/users` | ALL | admin only |

---

## 4. Sandbox Isolation

This is the most important security feature in the system, and the one we've spent the most time on. When you spawn an agent, where does it actually run?

### 4.1 Three layers, configurable per agent type

You control sandbox depth via `AEGIS_SANDBOX`:

**Filesystem sandbox** (default): Path whitelist. The agent can only read/write files in allowed directories. Good for trusted, local agent types. If a "review" agent tries to read `/etc/shadow`, it gets denied.

**Process sandbox**: Command blacklist — `rm -rf /`, `mkfs`, fork bombs, `sudo` are all blocked. Temp directory is isolated per agent. Command patterns are restricted per agent type: a "test" agent can run `npm test` but not `curl evil.com`.

**Docker sandbox** (recommended for production): Full container isolation. Here's what we apply by default:

| Setting | Value | Why |
|---------|-------|-----|
| User | `--user 1000` | Non-root inside the container |
| Root filesystem | `--read-only` | Agent can't modify system files |
| Network | `--network none` | No outbound connections — prevents data exfiltration |
| Capabilities | `--cap-drop=ALL` | Can't load kernel modules, change system time, etc. |
| No new privileges | `--security-opt no-new-privileges:true` | Prevents privilege escalation via SUID binaries |
| Tmpfs | `/tmp:noexec,nosuid,size=64m` | Temp storage in memory, can't execute from it |
| Memory limit | `--memory 2g` | Prevents fork bomb style memory exhaustion |

**A note on seccomp:** Docker applies its default seccomp profile out of the box, which blocks ~44 dangerous system calls. We leave that as-is. If you specifically need to disable seccomp (e.g., for debugging cgroup interactions), set `seccompEnabled: false` in the sandbox config.

### 4.2 What we learned the hard way

The original Docker sandbox didn't drop capabilities. We found during adversarial testing (red-team agents vs defender agents) that a compromised container could still call `mount()` and `ptrace()` even with a non-root user. That's why `--cap-drop=ALL` is now default.

Also — the `--read-only` flag breaks any software that writes to `/var` or `/tmp` at runtime. That's intentional: it forces agents and their dependencies to be explicit about where they write data. The workspace mount at `/workspace` is writable. Everything else is read-only.

---

## 5. API Security

### 5.1 Auth

Three ways to authenticate:

- **Bearer token**: `Authorization: Bearer <key>`
- **API key header**: `X-API-Key: <key>`
- **HMAC signed**: Full request signing with replay protection

All three are checked through the same middleware. If `AEGIS_AUTH_REQUIRED=true` is set, unauthenticated requests get a 401.

### 5.2 Rate limiting

Token bucket, 100 requests per minute per IP by default. Burst allowance of 20. Adjust with `AEGIS_API_RATE_LIMIT`. We include `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers in every response so clients can back off intelligently.

### 5.3 Headers

Every API response includes:

```
Content-Security-Policy: <restricted directives>
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: <minimal set>
```

These are standard hardening headers. CSP is worth calling out specifically — we restrict script sources to prevent XSS even if someone finds a way to inject content.

### 5.4 CORS

Controlled by `AEGIS_API_CORS_ORIGINS` (comma-separated list). Defaults to `http://localhost:5173` for local development. In production, set this to your dashboard URL and nothing else.

### 5.5 Input validation

All POST/PUT endpoints validate payloads through Zod schemas before processing. Types, lengths, patterns — reject early, reject clearly. Error messages don't leak stack traces. This was painful during development (debugging schema validation errors is tedious) but it's caught real bugs.

---

## 6. Audit & Observability

### 6.1 Audit log

Every agent action is recorded in an append-only audit log. Each entry includes:

- Timestamp (ISO 8601, nanosecond precision)
- Action type (agent_spawn, file_read, api_call, etc.)
- Agent ID and type
- User/role who triggered the action
- Outcome (success, denied, error)

Logs are structured JSON. We designed them to be consumable by standard SIEM tools — Splunk, Datadog, ELK — without custom parsing.

### 6.2 Distributed tracing

Each agent execution creates a trace with span IDs. When an agent spawns a sub-agent, the trace context propagates. This means you can trace a request from "user types a command" through "agent manager spawns a build agent" through "build agent calls the file_write tool" all in one view.

Traces are SQLite-backed locally. There's no centralized trace collector yet — that's something we'll add when users ask for it.

### 6.3 SLO tracking

| Metric | Target | How we measure it |
|--------|--------|-------------------|
| API availability | 99.9% | Rolling 30-day window |
| API response time (p95) | <500ms | Per-endpoint, per-method |
| Agent success rate | >95% | Per-agent-type, per-week |
| Error rate (5xx) | <1% | Burn rate on 1h/6h/24h windows |

---

## 7. Enterprise Deployment Checklist

### 7.1 Before you go to production

```bash
# Generate keys
openssl rand -hex 32        # → AEGIS_API_KEY
openssl rand -hex 32        # → AEGIS_VAULT_KEY

# Deploy with all security features
docker run -d --name aegis \
  -p 8080:8080 \
  -e AEGIS_API_KEY="$(cat api.key)" \
  -e AEGIS_VAULT_KEY="$(cat vault.key)" \
  -e AEGIS_SANDBOX=docker \
  -e AEGIS_AUTH_REQUIRED=true \
  -e AEGIS_API_CORS_ORIGINS="https://your-dashboard.com" \
  -e AEGIS_API_RATE_LIMIT=200 \
  -v aegis-data:/home/aegis/.aegis \
  ghcr.io/kunjshah95/neuron-os:latest
```

Checklist:

- [ ] API key generated and stored in a secret manager (not in the Dockerfile)
- [ ] Vault key generated separately from API key
- [ ] TLS certificates configured (`AEGIS_TLS_CERT` / `AEGIS_TLS_KEY`)
- [ ] CORS restricted to specific dashboard URL
- [ ] Docker sandbox enabled
- [ ] RBAC users created (`aegis production rbac create-user`)
- [ ] Auth required mode enabled
- [ ] Rate limits tuned for your workload
- [ ] Log aggregation configured
- [ ] `aegis doctor` passes all checks

### 7.2 Key rotation

```bash
# 1. Generate new vault key
openssl rand -hex 32

# 2. Update environment variable and restart
export AEGIS_VAULT_KEY="new-key"
docker restart aegis

# 3. Verify vault is accessible
aegis vault list

# 4. Rotate API keys
aegis production rbac rotate-key <key-id>
```

The vault re-encrypts on access with the new key. There's no bulk re-encryption command yet — that's a known gap (see section 10).

---

## 8. Compliance Mapping

This section maps Neuron OS capabilities to common compliance frameworks. We're not a compliance shop — you'll want to validate against your specific requirements with your security team.

### SOC 2 (Security criteria)

| What they ask | What we do |
|---------------|------------|
| Access control | RBAC with route-permission mapping, SHA-256 hashed keys |
| Encryption at rest | AES-256-GCM vault, scrypt key derivation |
| Encryption in transit | HMAC-SHA256 signing + optional TLS |
| Audit trail | Append-only structured JSON log |
| Change management | Config via env vars, version-controlled |
| Incident response | Disclosure policy in `SECURITY.md` |

### GDPR

| Requirement | Our implementation |
|-------------|-------------------|
| Data encryption | Encrypted vault, local SQLite stores |
| Access controls | RBAC per-route permissions |
| Data portability | All stores exportable via CLI |
| Right to erasure | `aegis memory prune` clears session data |
| Breach notification | Audit log enables forensic timeline reconstruction |

### OWASP Top 10 (2021)

| Risk | How we address it |
|------|-------------------|
| A01: Broken Access Control | RBAC + route permission matrix + middleware check on every request |
| A02: Cryptographic Failures | AES-256-GCM, scrypt, HMAC-SHA256, timing-safe comparison |
| A03: Injection | Zod schema validation on all endpoints |
| A04: Insecure Design | Defense-in-depth: 3 sandbox layers, each independent |
| A05: Security Misconfiguration | Secure defaults, `aegis doctor` validates setup |
| A06: Vulnerable Components | `bun.lock` with frozen lockfile, deterministic deps |
| A07: Auth Failures | SHA-256 hashed keys, timing-safe comparison, no plaintext storage |
| A08: Integrity Failures | HMAC signing with replay window |
| A09: Logging Failures | Structured JSON audit, every action timestamped |
| A10: SSRF | Outbound network disabled in Docker sandbox by default |

---

## 9. Incident Response

### 9.1 If something goes wrong

1. **Audit first.** The audit log has a timestamped record of every action. Reconstruct the timeline before making changes.
2. **Rotate keys.** `aegis production rbac rotate-key <id>` for the affected key. New key is effective immediately.
3. **Revoke access.** Delete the compromised user: `aegis production rbac delete-user <name>`.
4. **Review sandbox logs.** If the incident involved an agent execution, check the sandbox status and denied operations.
5. **Open a security advisory** at <https://github.com/KunjShah95/neuron-os/security> if you found a vulnerability.

### 9.2 Disclosure

Found a vulnerability? Send details to `security@aegis.dev` or open a GitHub Security Advisory. We acknowledge within 24 hours, assess within 72, and aim for a fix in 7-14 days depending on severity. We'll coordinate public disclosure with you.

---

## 10. Known Gaps and Trade-offs

No system is perfectly secure. Here's what we know we're not doing well yet:

1. **No TLS by default.** The API server supports TLS if you set `AEGIS_TLS_CERT` and `AEGIS_TLS_KEY`, but we don't auto-provision certificates or redirect HTTP→HTTPS. In production, put it behind a reverse proxy (nginx, Caddy, Cloudflare Tunnel) that terminates TLS.

2. **No agent-to-agent encryption.** Sub-agents communicate via stdin/stdout within the same process. If someone has local process access, they can observe inter-agent messages. True isolation would require each agent in its own container, which we don't do by default for performance reasons.

3. **Vault key rotation requires restart.** The vault derives the encryption key at startup. If you rotate the key, you need to restart the service. There's no hot-reload for the vault key yet.

4. **No centralized log aggregation.** Audit logs are local to each node. In a multi-host deployment, you'll want to ship them to a central location. We don't do this out of the box — you'll need to configure log shipping yourself (Filebeat, Vector, etc.).

5. **The AgentMemory sidecar communicates over plain HTTP.** By default, the sidecar at `http://localhost:3111` has no TLS. Run it behind a reverse proxy or on localhost-only in production.

6. **Windows cannot use Docker sandbox.** Docker on Windows requires WSL 2 or Hyper-V. The process sandbox works fine. For true container isolation on Windows, use WSL 2.

7. **All-or-nothing capability drop.** `--cap-drop=ALL` is strict. If you need a specific capability (e.g., `CAP_NET_ADMIN` for a network debugging agent), you have to set `dropAllCaps: false` in the sandbox config, which drops all protection rather than allowing selective capabilities. Per-capability configuration is on the roadmap.

---

*For the latest security advisories, visit: <https://github.com/KunjShah95/neuron-os/security>*

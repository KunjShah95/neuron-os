# Security Hardening — Plan

> **Priority: P1.** Critical before exposing API to network or storing production credentials.
> **Status: Historical planning document — items marked ✅ are implemented.**

---

## Current Security Posture

| Layer | Status | Issues |
|-------|--------|--------|
| API authentication | ⚠️ Partial | Bearer token optional, no key rotation |
| API transport | ❌ Plain HTTP | No TLS, credentials in the clear |
| Vault storage | ✅ AES-256-GCM encrypted | `~/.aegis/vault.enc` encrypted at rest, key via env var or key file |
| Input validation | ✅ Zod schemas | All POST/PUT endpoints validated (agent spawn, memory, tasks) |
| CORS | ✅ Configurable origins | Controlled via `AEGIS_API_CORS_ORIGINS`, defaults to localhost:5173 |
| CSP headers | ✅ Added | CSP, X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy |
| Docker sandbox | ⚠️ Runs as root | No `--user`, no capability drops at runtime |
| IPC security | ❌ No auth | Any local process could connect to MCP/API |
| Dependency audit | ❌ Not checked | No `bun audit` in CI |
| Secret scanning | ❌ Not configured | No git-secrets or similar |

---

## Hardening Roadmap

### Phase 1: Quick Wins (1-2 days) — ✅ Mostly Complete

| Item | Implementation | Status |
|------|---------------|--------|
| **Input validation** | Add Zod schemas to all API POST endpoints (agent spawn, memory, search) | ✅ Done in `src/api/server.ts` |
| **Security headers** | Add `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security` to all API responses | ✅ Done |
| **CORS restrict** | Make allowed origins configurable via `AEGIS_API_CORS_ORIGINS` env var | ✅ Done |
| **Dependency audit** | Add `bun audit` step to CI workflow | ❌ Not yet in CI |
| **Git secrets** | Add `.aegis/vault.json` and `.env` to `.gitignore` (already done for `.env`) | ✅ Done — vault is now encrypted |

### Phase 2: Vault Encryption (2-3 days) — ✅ Done

- ✅ AES-256-GCM encryption for `~/.aegis/vault.enc`
- ✅ Key derived from:
  - `AEGIS_VAULT_KEY` env var (64 hex chars)
  - Auto-generated `~/.aegis/.vault-key` file with `chmod 600`
- ✅ Auto-migration from legacy `vault.json`, stale plaintext removed
- ✅ Implemented in `src/vault/crypto.ts`

### Phase 3: Transport Security (3-5 days)

- ❌ Add TLS support to API server
- ❌ Auto-cert via Let's Encrypt (or configurable cert/key paths)
- ❌ HTTP→HTTPS redirect (configurable)
- ❌ HSTS header with `max-age=31536000; includeSubDomains`

### Phase 4: Docker Sandbox Security (2-3 days)

```typescript
// Docker sandbox improvements
const securityOpts = {
  user: 'nobody:nogroup',
  readOnly: true,
  capDrop: ['ALL'],
  capAdd: [],  // no extra capabilities
  seccomp: 'default.json',
  networkMode: 'none',  // or configurable
  tmpfs: ['/tmp:noexec,nosuid,size=64m'],
}
```

- ❌ Always run containers as non-root user
- ❌ Drop all Linux capabilities
- ❌ Enable seccomp with default profile
- ❌ Disable network access by default
- ❌ Mount filesystem as read-only

> **Note:** The production Dockerfile (`Dockerfile`) already runs as a non-root `aegis` user. The above applies to the runtime Docker sandbox for agents.

### Phase 5: IPC & MCP Security (3-5 days)

- ❌ Add authentication tokens to MCP server connections
- ❌ Add per-connection rate limiting to MCP
- ❌ Add IP allowlist for MCP server bind address
- ❌ Add message size limits to IPC protocol

---

## Security Checklist

- [x] Vault encrypted at rest (AES-256-GCM) — `src/vault/crypto.ts`
- [ ] TLS enabled for API server
- [x] Input validation on all API endpoints — Zod schemas in `src/api/server.ts`
- [x] CORS restricted to configured origins — `AEGIS_API_CORS_ORIGINS`
- [x] CSP and security headers set — `src/api/server.ts`
- [ ] Docker sandbox runs as non-root
- [ ] MCP server has authentication
- [x] Rate limiting on API server — token bucket (default 100/min)
- [ ] `bun audit` passes in CI
- [x] Vault and `.env` excluded from git
- [x] No secrets in source code
- [ ] IP allowlist configurable
- [ ] Audit log for sensitive operations
- [x] Graceful error messages (no stack traces leaked)

---

## Incident Response

When developing the security posture, also prepare:

1. **API key rotation procedure** — documented in `CONTRIBUTING.md`
2. **Vulnerability disclosure** — ✅ `SECURITY.md` created with contact info
3. **Dependency update policy** — automated Dependabot/Renovate config
4. **Log retention** — structured logs for forensic analysis (logger supports file rotation)

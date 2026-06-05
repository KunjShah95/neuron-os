---
title: Security
description: Aegis security policy — vulnerability disclosure, vault encryption, API security, sandbox isolation, and best practices
---

# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x (current) | ✅ Active development — security patches within 48 hours |

## Reporting a Vulnerability

We take security seriously. If you discover a security vulnerability, please **do not** open a public issue.

### Disclosure Process

1. **Report via email:** Send details to `security@aegis.dev` (or open a [GitHub Security Advisory](https://github.com/aegis/aegis/security/advisories/new))
2. **Include:** Description, reproduction steps, affected versions, and any proof-of-concept
3. **Response time:** We acknowledge receipt within 24 hours and provide an initial assessment within 72 hours
4. **Coordinated disclosure:** We work with you on a fix timeline before public disclosure (typically 7–14 days)

## Security Features

### Credential Vault

- All API keys and secrets are stored encrypted at rest using **AES-256-GCM**
- Encryption key sourced from `AEGIS_VAULT_KEY` env var or auto-generated `~/.aegis/.vault-key` with `chmod 0600`
- Each encryption uses a fresh random 12-byte IV — same plaintext produces different ciphertext every time
- Legacy plaintext `vault.json` is automatically migrated to `vault.enc` and deleted
- **No silent downgrade:** Encryption failures throw errors rather than falling back to plaintext
- Env files (`agent.env`, `*.env`) are written in plaintext for runtime consumption — treat them as sensitive

### API Security

- **Authentication:** Bearer token or `X-API-Key` header via `AEGIS_API_KEY`
- **Rate limiting:** Default 100 requests/minute per IP (configurable)
- **Input validation:** All endpoints validate payloads (types, lengths, patterns) before processing
- **Security headers:** CSP, X-Content-Type-Options, X-Frame-Options, XSS-Protection, Referrer-Policy, Permissions-Policy
- **CORS:** Configurable allowlist of origins, same-origin requests allowed without Origin header

### Sandbox Isolation

| Sandbox | Protection | Scope |
|---------|-----------|-------|
| FilesystemSandbox | Path whitelist — restricts file access to allowed directories | File operations |
| ProcessSandbox | Command blacklist (rm -rf /, fork bombs, sudo) + temp directory isolation | Shell commands |
| DockerSandbox | Full container isolation with Docker | All execution |

### Key Management

- Encryption keys **never** logged to console or persisted in non-vault locations
- `AEGIS_VAULT_KEY` env var takes priority over file-based key storage
- Invalid env var keys (wrong length, bad format) are logged as warnings and ignored — no silent fallback
- Key file permissions restricted to owner-only (`0o600`)

## Best Practices for Users

1. **Set `AEGIS_VAULT_KEY`** — Use a strong 64-character hex key (32 bytes) in your environment rather than relying on auto-generated key files
2. **Enable API authentication** — Set `AEGIS_API_KEY` in production; never run without auth
3. **Restrict CORS origins** — In production, set `AEGIS_API_CORS_ORIGINS` to your specific dashboard URL
4. **Enable sandbox** — Use `filesystem` or `process` sandbox in multi-tenant scenarios
5. **Rotate keys regularly** — Rotate `AEGIS_VAULT_KEY` and `AEGIS_API_KEY` every 90 days
6. **Monitor .env files** — Vault-derived env files (`agent.env`, scope `*.env`) contain plaintext secrets
7. **Keep dependencies updated** — Run `bun update` regularly for security patches
8. **Use the Docker image** — Run in the provided Docker image for filesystem isolation

## Known Security Considerations

- **Sidecar services:** The AgentMemory connector communicates over HTTP without TLS by default — run on localhost or behind a reverse proxy in production
- **MCP server:** Exposed tools inherit the agent's permissions; restrict MCP access in production deployments
- **Process sandbox temp files:** Are not encrypted — sensitive data should not be written to the temp directory
- **Agent workers:** Run with the same OS-level permissions as the parent process; use DockerSandbox for true isolation

## Dependency Security

We use `bun.lock` for deterministic dependency resolution. All dependencies are audited via:
- `bun run build` for type checking
- `bun run test` for runtime validation
- GitHub Actions CI runs on every push

## Contact

- **Security issues:** `security@aegis.dev`
- **GitHub Security:** https://github.com/aegis/aegis/security
- **Bug bounty:** Not yet available — we appreciate responsible disclosure

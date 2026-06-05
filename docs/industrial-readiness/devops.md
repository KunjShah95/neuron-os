# DevOps & Operations — Plan

> **Priority: P1.** Needed for reliable deployment and team collaboration.
> **Status: Historical planning document — items marked ✅ are implemented.**

---

## Current State

| Area | Status | Gap |
|------|--------|-----|
| Dockerfile | ✅ Multi-stage | `oven/bun:1-slim`, non-root user, HEALTHCHECK, dashboard builder stage |
| docker-compose | ✅ Added | Named volume, env passthrough, dashboard-dev profile |
| Kubernetes/Helm | ❌ Missing | No orchestrator deployment |
| CI platform | ⚠️ Linux only | GitHub Actions works but only ubuntu-latest |
| Release automation | ⚠️ Partial | Date-based tags, no semver |
| Changelog | ✅ Added | `CHANGELOG.md` with Keep a Changelog format |
| Dependency scanning | ❌ Missing | No `bun audit` in CI |
| Code formatting | ❌ Missing | Prettier mentioned in CONTRIBUTING, script exists but dep missing from package.json |
| Linting | ✅ ESLint configured | ESLint in devDependencies, script `bun run lint` works |
| Smoke tests | ✅ Added | `scripts/test-cli-smoke.ts` exists |
| `.dockerignore` | ✅ Added | Comprehensive exclusion rules |

---

## Docker Build

### Dockerfile — ✅ Implemented

```dockerfile
# Stage 1: Build the web dashboard
FROM oven/bun:1 AS dashboard-builder
WORKDIR /app/dashboard
COPY dashboard/package.json dashboard/bun.lock ./
RUN bun install --frozen-lockfile
COPY dashboard/ ./
RUN bun run build

# Stage 2: Install production dependencies
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 3: Production runtime
FROM oven/bun:1-slim AS production
LABEL org.opencontainers.image.title="Neuron OS (Aegis)"
LABEL org.opencontainers.image.description="The Operating System for Autonomous AI Agents"

# Create non-root user
RUN addgroup --system --gid 1001 aegis \
    && adduser --system --uid 1001 --ingroup aegis --home /home/aegis aegis

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json bun.lock ./
COPY src/ ./src/
COPY index.ts ./
COPY --from=dashboard-builder /app/dashboard/dist/ ./dashboard/dist/
RUN mkdir -p /home/aegis/.aegis /app/data \
    && chown -R aegis:aegis /app /home/aegis/.aegis
USER aegis
VOLUME ["/home/aegis/.aegis"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD bun -e "fetch('http://localhost:8080/api/v1/health')..."
EXPOSE 8080
ENTRYPOINT ["bun", "run", "index.ts"]
CMD ["serve"]
```

### docker-compose.yml — ✅ Implemented

```yaml
services:
  aegis:
    build: .
    ports: ["8080:8080"]
    volumes: ["~/.aegis:/home/aegis/.aegis", "./data:/app/data"]
    environment: [AEGIS_LOG_LEVEL=info, AEGIS_API_PORT=8080]
    restart: unless-stopped

  dashboard:
    build: ./dashboard
    ports: ["3000:80"]
    depends_on: [aegis]
    environment: [VITE_API_URL=http://aegis:8080]
```

---

## CI/CD Improvements

### Multi-Platform CI Matrix — ❌ Not Implemented

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        bun-version: ['1.x']
    runs-on: ${{ matrix.os }}
    # ...
```

CI currently runs on `ubuntu-latest` only. No Windows/macOS coverage.

### Semantic Release — ❌ Not Implemented

No `semantic-release` config. Still using date-based tags.

### Pre-commit Hooks

- ✅ `husky` installed and configured (`"prepare": "husky"`)
- ❌ `lint-staged` not configured

---

## Operations Runbook

### Monitoring

| Metric | Source | Target |
|--------|--------|--------|
| Agent count | AgentManager | Prometheus gauge |
| Agent spawn time | AgentManager | Prometheus histogram |
| API request duration | API server | Prometheus histogram |
| Active tasks | Task queue | Prometheus gauge |
| Memory usage | `process.memoryUsage()` | Prometheus gauge |
| Vector store size | VectorMemory | Prometheus gauge |

### Logging — ✅ Structured Logger in Place

```json
{"level":"info","time":"2026-05-31T10:00:00.000Z","module":"agent","msg":"Agent spawned","agentId":"abc123","type":"build","durationMs":245}
{"level":"warn","time":"2026-05-31T10:00:01.000Z","module":"agent","msg":"Agent heartbeat timeout","agentId":"abc123","timeout":30000}
{"level":"error","time":"2026-05-31T10:00:02.000Z","module":"api","msg":"Invalid API key","remoteAddr":"10.0.0.1","path":"/api/v1/agents"}
```

- ✅ JSON-line format in production (non-TTY), pretty-print in TTY
- ✅ File logging with rotation (10MB default, 5 rotated files)
- ✅ Level controlled by `AEGIS_LOG_LEVEL`

### Health Check Endpoint — ✅ Implemented

```
GET /api/v1/health → { status, version, uptime, agents, ... }
```

---

## Release Process

1. Developer commits with conventional commit messages
2. CI runs typecheck + tests + lint + audit on every push
3. On merge to `main`, semantic-release:
   - Determines version bump from commits
   - Updates CHANGELOG.md
   - Creates git tag
   - Builds Docker image and pushes to registry
   - Creates GitHub release with binaries

### Binary Distribution

```bash
# Build standalone binaries for distribution
bun build index.ts --compile --target=bun-linux-x64 --outfile=aegis-linux-x64
bun build index.ts --compile --target=bun-darwin-x64 --outfile=aegis-darwin-x64
bun build index.ts --compile --target=bun-windows-x64 --outfile=aegis-win-x64.exe
```

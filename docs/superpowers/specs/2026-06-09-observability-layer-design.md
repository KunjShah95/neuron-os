# Observability Layer — Design Spec

## Overview
Add system observability via extended health API, new metrics and souls endpoints, and CLI commands. Phase 1 of a two-phase plan (Phase 2 = TUI dashboard).

## Approach: Incremental (API + CLI)

Extend the existing API server (`src/api/server.ts`) with richer health data and new endpoints. CLI commands wrap the API with local fallback.

## Endpoints

### GET /api/v1/health (enhanced)

**Current returns:** `{ status, version, uptime, agents: { total, running } }`

**Enhanced adds:**
- `warmPool` — warm agent count, promotions count
- `souls` — total souls, mood distribution (`{ elated: N, confident: N, ... }`)
- `plugins` — installed count, registry reachable
- `memory` — memory service reachable boolean, doc count

### GET /api/v1/metrics (new)

Returns snapshot metrics:
```json
{
  "agents": { "total": N, "running": N, "successRate": 0.89, "avgDurationMs": 4520 },
  "souls": { "total": N, "moodBreakdown": { "elated": 2, "confident": 3 }, "avgMoodScore": 72.5 },
  "plugins": { "installed": 4, "published": 12 },
  "system": { "uptime": N, "memoryMb": 156, "version": "1.0.0" }
}
```

Data sourced by aggregating from existing managers — no new collector infra.

### GET /api/v1/souls (new)

Lists all registered souls:
```json
{
  "souls": [{ "agentId": "ag_...", "archetype": "crafter", "name": "...", "mood": "confident", "moodEmoji": "💪", "traits": [...], "adaptations": N, "lastEvolved": "..." }],
  "total": N
}
```

### GET /api/v1/souls/:agentId (new)

Returns a single soul card with full detail (traits, adaptations, mood history).

## CLI Commands

| Command | Source |
|---------|--------|
| `aegis health` | GET /api/v1/health with local fallback |
| `aegis metrics` | GET /api/v1/metrics with local fallback |
| `aegis soul list` | GET /api/v1/souls with local fallback |
| `aegis soul card <id>` | GET /api/v1/souls/:id with local fallback |
| `aegis soul --json` | All soul commands accept `--json` for machine output |

Local fallback reads directly from `AgentManager`, `SoulManager`, `PluginRegistry` when the API server isn't running.

## Implementation Files

- `src/api/server.ts` — add enhanced health handler, metrics handler, souls handlers
- `src/cli/commands/health.ts` — new `aegis health` command
- `src/cli/commands/metrics.ts` — new `aegis metrics` command
- `src/cli/commands/soul.ts` — extend existing with `list`/`card` subcommands
- `src/cli/commands/index.ts` — register new commands

## Error Handling

- API handlers return 500 with `{ error: string }` on failure
- CLI commands log warnings on API failure and fall back to local
- Missing agent ID on soul card returns 404
- Non-existent metrics data returns empty aggregations (zeros), not errors

## Testing

- Unit tests for each CLI handler with mocked managers
- Integration test for each new API endpoint via existing server test pattern
- Verify CLI fallback behavior when server is unreachable

## Future (Phase 2)

- Real-time TUI dashboard with live agent status, mood trends, metrics streaming
- Prometheus-compatible metrics format
- Grafana dashboard template

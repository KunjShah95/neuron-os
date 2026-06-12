# Heartbeat Checklist

Tasks the system should check on each heartbeat cycle.

> **Note:** These items are monitored programmatically via the cron engine
> and agent hooks. Environment-specific overrides can be configured in
> `~/.aegis/config.json` under the `heartbeat` key.

## Automated Checks (Cron Engine)

- File change detection via `watch` mode agents
- Error log scanning via `monitor` agent type
- System health via `/api/v1/health` endpoint
- Memory fact consolidation — triggered weekly via cron schedule

## Agent Lifecycle

- Active agent health checks (heartbeat timeout = 30s)
- Auto-recovery with exponential backoff (5 retries, 1s base, 60s cap)
- Stale session cleanup (>30 days) — runs on cron schedule

## Scheduled Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Session cleanup | Daily at 03:00 | Remove sessions older than 30 days |
| Memory consolidation | Weekly on Sunday | Summarize and prune redundant facts |
| Skill pruning | Weekly on Monday | Remove skills with <30% success rate |
| Telemetry flush | Every 10s (when opted in) | Send queued telemetry events |

# Implementation Plan: Neuron OS "Beyond Hermes" (Software 3.0)

This plan details the full 20-Sprint technical implementation, explicitly mapped to the provided architectural diagrams, the 6-tier capability model, and the 15 "Beyond Hermes" feature blocks. 

## User Review Required

> [!IMPORTANT]  
> The 20 sprints have been perfectly realigned with your visual diagrams (the 15 "what to build" blocks + the foundational tiers). Please review the mapping below to ensure the priorities match your vision.

## Open Questions

> [!NOTE]
> - **Supervisor vs Watcher**: The diagram specifies a `Supervisor agent` (watching for cost/anomaly) and a `Watcher / looper` (from the Karpathy delta). We've combined these into Sprint 8 & 12. Does that alignment work?
> - **RBAC Integration**: For Sprint 16 (RBAC + secret scoping), do you want this enforced at the process level (via environment variables per agent) or at the OS filesystem level?

## Proposed Changes

### Phase 1: Catching Up to the "Karpathy Delta" (Sprints 1-8)
Building the core 6 Tiers to establish basic autonomous capabilities.

#### [NEW] `src/memory/store.ts` (Sprint 1: Episodic Memory)
- **Survive crashes, persist context**: Implements the Tier 1 requirement so agents resume seamlessly after failure.

#### [NEW] `src/agent/queue.ts` (Sprint 2: Task Queue & Tmux-Grid Runner)
- **Agents pull, not just get pushed**: Converts the system to run `N` agents in parallel always, pulling from a centralized queue.

#### [NEW] `src/adapters/gateway.ts` (Sprint 3: Multi-Platform Gateway)
- Extends beyond terminal to Telegram/Slack, setting the foundation for the "Command center IDE".

#### [MODIFY] `src/sandbox/policy.ts` (Sprint 4: Sandbox & Policy Engine)
- **Untrusted code isolation**: Implements Docker execution backends per Tier 6 specifications.

#### [NEW] `src/skills/extractor.ts` (Sprint 5: Unaudited Skill Creation Fix)
- Bridges the gap on basic skill creation, paving the way for the quality gate later.

#### [MODIFY] `src/agent/worker.ts` (Sprint 6: Async Collaboration & RPC)
- **Agents as a research community**: Enables isolated conversations and sub-agent RPC for task delegation.

#### [MODIFY] `src/telemetry/tracing.ts` (Sprint 7: Structured Tracing & Replay)
- **Span trees & scrubbable sessions**: Implements Tier 3 observability, allowing frame-by-frame session replays.

#### [NEW] `src/agent/supervisor.ts` (Sprint 8: Supervisor Agent & Looper)
- **Watches for stuck loops**: A background agent from Tier 2 that automatically restarts stalled workers.

---

### Phase 2: Fixing "Hermes Hard Limits" (Sprints 9-14)
Attacking the specific architectural dead-ends of Hermes to make Neuron OS production-ready.

#### [NEW] `src/sandbox/checkpoint.ts` (Sprint 9: Task Checkpointing)
- **Resume mid-task on crash**: Fixes the Hermes "partial failures = full restart" limit. Writes state before every tool call.

#### [MODIFY] `src/audit/db.ts` (Sprint 10: Queryable Audit Log)
- **SQLite, every tool call**: Fixes the Hermes "tool calls unqueryable" limit. Everything is logged and indexed.

#### [NEW] `src/agent/planner.ts` (Sprint 11: DAG Planner & Typed Multi-Agent Tree)
- **Goal → Dependency Graph**: Fixes the Hermes "single-agent only" limit. Takes intent and spins up `build`, `test`, and `review` agent roles topologically.

#### [NEW] `src/skills/quality-gate.ts` (Sprint 12: Skill Quality Gate)
- **Score, test, version skills**: Fixes the Hermes "wrong skills silently saved" limit. Quarantines bad skills.

#### [MODIFY] `src/adapters/gateway.ts` (Sprint 13: Lean Gateway Protocol)
- **Delta-only context injection**: Fixes the Hermes "2-3x token overhead" limit.

#### [NEW] `src/mcp/server.ts` (Sprint 14: MCP Server Mode)
- **Claude Code, Cursor, VS Code**: Fixes the Hermes "No IDE integration" limit. Exposes AgentManager as an MCP tool.

---

### Phase 3: "Beyond Hermes" Software 3.0 Architecture (Sprints 15-20)
Implementing the advanced blocks from the architecture diagrams.

#### [NEW] `src/agent/reflection.ts` (Sprint 15: Reflection Loop)
- **Agent critiques own output**: Post-task evaluation written directly to the agent's episodic memory.

#### [NEW] `src/vault/rbac.ts` (Sprint 16: RBAC + Secret Scoping)
- **Secrets per agent type**: Enforces Tier 6 policy. The `test` agent cannot access the `deploy` agent's AWS keys.

#### [NEW] `src/telemetry/cost.ts` (Sprint 17: Cost Attribution & Agent Benchmarking)
- **$/task, $/agent, $/day**: Token budget tracking (Tier 3). Benchmarks and scores runs to identify cost spikes and anomalies.

#### [NEW] `src/modes/research.ts` (Sprint 18: AutoResearch Mode)
- **Agents run experiments, learn**: Implements the Karpathy-style loop of continuous, unattended experimentation.

#### [NEW] `src/memory/compressor.ts` (Sprint 19: Context Optimizer)
- **Compress, rank, summarize**: Infinite-horizon memory management via an active background process.

#### [NEW] `src/cron/distillation.ts` (Sprint 20: RL Feedback Loop)
- **Reward signal from outcomes**: Extracts high-performing trajectories from the SQLite audit log into ShareGPT format to fine-tune local models.

## Verification Plan
This implementation plan exactly matches the provided architectural flowchart:
`Goal Input` → `DAG Planner` → `Worker Agents (Build/Test/Review)` → `Checkpoint/Audit Log` → `Episodic Memory / RL Loop` → `Gateways` → `Supervisor`.

- **Review Flowchart Integrity**: Run a full E2E test verifying a goal can traverse this exact sequence down to the RL output.

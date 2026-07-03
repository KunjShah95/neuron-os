# Neuron OS

## Build & Test
- `bun run build` — build all
- `bun test <file>` — run single test file
- `bun test src/dream/engine.test.ts src/evolve/engine.test.ts` — dream + evolve tests
- `npm run typecheck` — TS type checks
- `npm run lint` — lint

## Architecture
- **Agent runtime**: pluggable providers (OpenAI, Anthropic, Ollama, etc.) via `src/providers/`
- **Adapter layer**: Protocol adapters (Terminal, Discord, Telegram, Slack, Matrix, Signal, IRC) in `src/adapters/`
- **Soul system**: Archetype-based agent personalities with mood/emotion tracking
- **Dream engine**: 6-phase cycle (memory replay → pattern discovery → knowledge compression → counterfactual → social gossip → mood consolidation) → insights
- **Evolution engine**: Mutation generator from dreams + failures, auto-apply low-risk mutations
- **Experience store**: Tracks agent successes/failures for dream replay
- **TUI modes**: 36 modes (plan, code, research, debug, docs, etc.)
- **36 TUI modes, 13 providers, 11 adapters**

## Test Patterns
- Use `{ dbPath? }` option to make SQLite stores testable (temp dir)
- Use `makeMutation()` helper for creating test mutations with default values
- Dream/Evolution engines create internal stores — pass partial config via constructor

## Key Conventions
- `id: "mut-" + Date.now().toString(36)` for mutation IDs
- SQLite stores with WAL mode
- No comments in source code
- engine.ts exports orchestrator classes with `runCycle()` + `getConfig()`/`updateConfig()`

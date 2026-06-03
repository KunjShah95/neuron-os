Title: Integrate memory system benchmarks into CI pipeline

Description:
Implements Issue #005. Adds automated benchmark tracking to the CI pipeline so performance regressions are detected before merging.

Changes:

- Added `bun run bench` and `bun run bench:update` scripts to `package.json`
- Updated `scripts/bench-memory-system.ts` with baseline comparison: saves `scripts/bench-baseline.json` via `--update-baseline` flag, compares against baseline on each run, fails with exit code 1 if any stage regressed >20%
- Added benchmark step to `.github/workflows/ci.yml` with `NODE_ENV: test`

Testing:

- Benchmarks run successfully locally: `bun run bench` (runs + compares) and `bun run bench:update` (updates baseline)
- CI pipeline runs benchmarks after tests

Closes #005

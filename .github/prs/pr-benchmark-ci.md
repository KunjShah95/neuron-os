Title: Integrate memory system benchmarks into CI pipeline

Description:
Implements Issue #005. Adds automated benchmark tracking to the CI pipeline so performance regressions are detected before merging.

Changes:

- Added `bun run bench` script to `package.json` for local benchmarking
- Created `scripts/bench-baseline.json` with current performance baselines
- Added benchmark step to `.github/workflows/ci.yml` with threshold-based failure (>20% regression)
- Benchmarks run on every push to main

Testing:

- Benchmarks run successfully locally: `bun run bench --update-baseline`
- CI pipeline verified with baseline comparison

Closes #005

Title: Integrate memory system benchmarks into CI pipeline

Description:
The `scripts/bench-memory-system.ts` script runs comprehensive memory system benchmarks (buildContext scaling, search performance) but is not integrated into the CI pipeline. We should track performance regressions automatically.

Scope:

- Add a benchmark step to `.github/workflows/ci.yml` that runs `bun run scripts/bench-memory-system.ts`
- Set up threshold-based failure: if any benchmark mean time exceeds a baseline by >20%, the CI step fails
- Store baseline results in a committed JSON file (e.g., `scripts/bench-baseline.json`)
- Add a `bun run bench` script to `package.json` for local benchmarking

Acceptance criteria:

- CI runs benchmarks on every push to main
- Benchmark regression >20% fails the pipeline with a clear message
- Baseline can be updated by running `bun run bench --update-baseline`
- Results are logged with stage name, mean time, and comparison to baseline

Notes / hints:

- Use the existing `scripts/bench-memory-system.ts` which measures 6 stages + 3 search benchmarks
- Baseline JSON format: `{ "stage_name": { mean: number, stddev: number, samples: number } }`
- Consider GitHub Actions artifacts to archive raw benchmark output

Estimated effort: 2-3 hours.

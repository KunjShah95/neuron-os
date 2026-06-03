Title: Optimize memory search performance (reduce from ~175ms to <50ms)

Description:
The memory system's `search()` method uses TF-IDF scoring across all memory sources. Current benchmarks show 130-175ms for search, which is a bottleneck for chat responsiveness. This task is to optimize search performance.

Scope:

- Profile the current search implementation in `src/memory/system.ts` (TF-IDF scoring, file reads, result fusion)
- Implement caching for frequently accessed files (MEMORY.md, today's daily log, user.md)
- Pre-compute or memoize TF-IDF term frequencies for static documents
- Add index-based file listing for auto memories instead of `readdirSync` on every search
- Benchmark before/after with `scripts/bench-memory-system.ts`

Acceptance criteria:

- Search (specific query) completes in <50ms mean (down from ~138ms)
- Search (broad query) completes in <70ms mean (down from ~174ms)
- No change to search result quality or ranking
- All existing memory tests pass
- Cache is invalidated when files are modified

Notes / hints:

- The main bottleneck is likely repeated `readFileSync` calls in `loadMemory()` and `loadAutoMemories()` during search
- Consider an LRU cache with TTL for parsed memory files
- TF-IDF scores can be memoized until memory content changes

Estimated effort: 4-6 hours.

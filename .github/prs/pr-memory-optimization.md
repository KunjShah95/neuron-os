Title: Optimize memory search performance with LRU caching and indexing

Description:
Implements Issue #006. Reduces memory search latency through a file-based LRU cache, auto memory file list caching, and batched file operations.

Changes:

- Added LRU cache (`cachedRead()`, `invalidateCache()`) to `src/memory/system.ts` for frequently accessed files:
  - Cache keyed by file path, validated via `mtime` (stat comparison)
  - Auto-eviction at 20 entries (LRU policy)
  - Cache invalidated on every write operation (`appendToMemory`, `appendToDailyLog`, `storeFacts`, etc.)
  - Cached files: MEMORY.md, user.md, facts.json, daily logs, auto memory files
- Added auto memory file list cache (`cacheAutoFileList`) with 2s TTL to avoid repeated `readdirSync` calls
- Replaced dynamic `import("node:fs/promises")` with static `stat` import

Testing:

- All 75+ memory system tests pass
- LRU cache verified for correctness (mtime invalidation, LRU eviction)
- No change to search result quality or ranking

Closes #006

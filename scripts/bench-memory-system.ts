#!/usr/bin/env bun
/**
 * MemorySystem Performance Benchmarks.
 *
 * Benchmarks buildContext() and search() under progressively larger data loads:
 *   1. Initialization
 *   2. 100 memories       (cumulative appends to MEMORY.md)
 *   3. 30 daily logs       (30 separate .md files)
 *   4. 200 auto memories   (individual files in .aegis/memory/auto/)
 *   5. 500 facts           (stored in facts.json)
 *   6. Combined full dataset
 *
 * Each stage runs multiple iterations and reports min / mean / max timing
 * plus the size of the context produced.
 *
 * Usage: bun run scripts/bench-memory-system.ts
 */

import { MemorySystem } from "../src/memory/system"
import { existsSync, mkdirSync, rmSync, readFileSync, writeFileSync, readdirSync } from "node:fs"
import { resolve, join } from "node:path"

// ── Configuration ──────────────────────────────────────────────────

const ITERATIONS = 5                       // runs per benchmark
const NUM_MEMORIES = 100
const NUM_DAILY_LOGS = 30
const NUM_AUTO_MEMORIES = 200
const NUM_FACTS = 500

const BASELINE_FILE = resolve(import.meta.dir || process.cwd(), "bench-baseline.json")
const UPDATE_BASELINE = process.argv.includes("--update-baseline")

const TMP_ROOT = resolve(process.cwd(), "tmp-bench-memory-" + Date.now())

// ── Helpers ─────────────────────────────────────────────────────────

type BenchResult = {
  label: string
  minMs: number
  meanMs: number
  maxMs: number
  contextSize: number          // chars returned by buildContext
  fileStats: Record<string, number>
}

function cleanTmp() {
  if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true })
}

function ensureDir(path: string) {
  mkdirSync(path, { recursive: true })
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  if (ms >= 1) return `${ms.toFixed(1)}ms`
  return `${(ms * 1000).toFixed(0)}µs`
}

function fmtBytes(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)}MB`
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)}KB`
  return `${bytes}B`
}

function getFileSize(path: string): number {
  try { return readFileSync(path).length } catch { return 0 }
}

function collectFileStats(dir: string, _label: string): Record<string, number> {
  const stats: Record<string, number> = {}
  const memFile = resolve(dir, "MEMORY.md")
  const userFile = resolve(dir, "user.md")
  const factsFile = resolve(dir, ".aegis/memory/facts.json")
  const dailyDir = resolve(dir, ".aegis/memory/daily")
  const autoDir = resolve(dir, ".aegis/memory/auto")

  stats["MEMORY.md"] = getFileSize(memFile)
  stats["user.md"] = getFileSize(userFile)
  stats["facts.json"] = getFileSize(factsFile)

  if (existsSync(dailyDir)) {
    const files = readdirSync(dailyDir).filter((f) => f.endsWith(".md"))
    stats["daily_logs"] = files.length
    stats["daily_dir_size"] = files.reduce((sum, f) => sum + getFileSize(join(dailyDir, f)), 0)
  }
  if (existsSync(autoDir)) {
    const files = readdirSync(autoDir).filter((f) => f.endsWith(".md"))
    stats["auto_memories"] = files.length
    stats["auto_dir_size"] = files.reduce((sum, f) => sum + getFileSize(join(autoDir, f)), 0)
  }

  return stats
}

function renderResults(results: BenchResult[]) {
  console.log("")
  console.log("  ┌─────────────────────────────────────────────────────────────────────────────┐")
  console.log("  │  Benchmark                      │   Min    │  Mean    │   Max    │  Context │")
  console.log("  ├─────────────────────────────────────────────────────────────────────────────┤")
  for (const r of results) {
    const label = r.label.padEnd(35)
    const min = fmtMs(r.minMs).padStart(8)
    const mean = fmtMs(r.meanMs).padStart(8)
    const max = fmtMs(r.maxMs).padStart(8)
    const ctx = fmtBytes(r.contextSize).padStart(8)
    console.log(`  │  ${label}│ ${min} │ ${mean} │ ${max} │ ${ctx} │`)
  }
  console.log("  └─────────────────────────────────────────────────────────────────────────────┘")
  console.log("")
}

async function bench(
  label: string,
  setup: () => Promise<void>,
  measure: () => Promise<string>,
  statsDir: string,
): Promise<BenchResult> {
  const timings: number[] = []

  for (let i = 0; i < ITERATIONS; i++) {
    await setup()
    const start = performance.now()
    await measure()
    const elapsed = performance.now() - start
    timings.push(elapsed)
  }

  const min = Math.min(...timings)
  const max = Math.max(...timings)
  const mean = timings.reduce((a, b) => a + b, 0) / timings.length

  // Run once more to capture context size + file stats
  await setup()
  const ctxFinal = await measure()
  const contextSize = ctxFinal.length
  const fileStats = collectFileStats(statsDir, label)

  return { label, minMs: min, meanMs: mean, maxMs: max, contextSize, fileStats }
}

// ── Data generators ────────────────────────────────────────────────

function memoryEntry(i: number): string {
  const topics = [
    "API endpoint design and response format",
    "Database schema migration strategy",
    "Authentication flow using JWT tokens",
    "Caching layer with Redis for query results",
    "Error handling middleware for Express routes",
    "Logging infrastructure with structured JSON output",
    "WebSocket connection management and reconnection",
    "Rate limiting configuration per API key",
    "Background job processing with Bull queues",
    "File upload handling with S3 storage",
    "Data validation using Zod schemas",
    "Search functionality with Elasticsearch",
    "Email notification template system",
    "Feature flag implementation with LaunchDarkly",
    "A/B testing framework for UI changes",
    "Rollback procedure for failed deployments",
    "Health check endpoint for monitoring",
    "Metrics collection for Prometheus",
    "Documentation generation with TypeDoc",
    "Docker image optimization for production",
    "TypeScript strict mode configuration",
    "Database connection pooling settings",
    "Session management with Redis store",
    "GraphQL schema design patterns",
    "Message queue integration with RabbitMQ",
    "OAuth2 integration with Google provider",
    "PDF generation service architecture",
    "Real-time collaboration using WebRTC",
    "Search autocomplete implementation",
    "Push notification delivery system",
  ]
  const topic = topics[i % topics.length]
  return `Memory entry ${i + 1}: ${topic}. Additional context and implementation details were discussed during the sprint planning session.`
}

function dailyLogEntry(day: number, i: number): string {
  const activities = [
    "Code review and refactoring",
    "Bug fixing and testing",
    "Feature implementation",
    "Documentation updates",
    "Performance optimization",
    "Infrastructure improvements",
    "Security audit findings",
    "API integration work",
    "Database optimization",
    "UI/UX improvements",
  ]
  return `Day ${day + 1}, entry ${i + 1}: ${activities[i % activities.length]} — completed and verified with automated tests.`
}

function autoMemoryEntry(i: number): string {
  const insights = [
    "Key learning about async error handling patterns",
    "Discovered race condition in concurrent request handling",
    "Noted the need for better test coverage in edge cases",
    "Identified performance bottleneck in database queries",
    "Found a more efficient algorithm for sorting large datasets",
    "Learned about new TypeScript features for type safety",
    "Recognized pattern for handling backpressure in streams",
    "Discovered caching strategy that reduces latency by 40%",
    "Noted that the build pipeline needs optimization",
    "Realized the importance of structured logging for debugging",
  ]
  return `Auto insight ${i + 1}: ${insights[i % insights.length]}`
}

function factConversation(i: number): string {
  const people = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Hank", "Ivy", "Jack"]
  const projects = ["Neuron OS", "DataPipeline", "AuthService", "SearchEngine", "Notification Hub"]
  const prefs = ["TypeScript over JavaScript", "PostgreSQL over NoSQL", "functional programming", "clean architecture", "test-driven development"]
  const decisions = ["use REST instead of GraphQL", "adopt monorepo structure", "migrate to microservices", "standardize on React", "use Redis for session store"]

  const person = people[i % people.length]
  const project = projects[i % projects.length]
  const pref = prefs[i % prefs.length]
  const decision = decisions[i % decisions.length]

  return `my name is ${person}. I prefer ${pref}. the project is ${project}. we decided to ${decision}.`
}

// ── Runner ──────────────────────────────────────────────────────────

async function runAll() {
  console.log("")
  console.log("  ╔══════════════════════════════════════════════════════════╗")
  console.log("  ║   MemorySystem Performance Benchmarks                    ║")
  console.log("  ║                                                          ║")
  console.log(`  ║   Iterations: ${ITERATIONS}                                ║`)
  console.log(`  ║   Memories:   ${NUM_MEMORIES}                                ║`)
  console.log(`  ║   Daily logs: ${NUM_DAILY_LOGS}                               ║`)
  console.log(`  ║   Auto mems:  ${NUM_AUTO_MEMORIES}                               ║`)
  console.log(`  ║   Facts:      ${NUM_FACTS}                               ║`)
  console.log("  ╚══════════════════════════════════════════════════════════╝")
  console.log("")

  const results: BenchResult[] = []

  // ──────────────────────────────────────────────────────────────────
  // Stage 0: Empty system
  // ──────────────────────────────────────────────────────────────────
  console.log("  ── Stage 0: Empty system ──")

  const dir0 = resolve(TMP_ROOT, "stage-0")
  ensureDir(dir0)

  results.push(await bench(
    "0: Empty buildContext",
    async () => { /* already clean */ },
    async () => {
      const sys = new MemorySystem(dir0)
      await sys.initialize()
      return sys.buildContext({ agentId: "bench", cwd: dir0 })
    },
    dir0,
  ))

  // ──────────────────────────────────────────────────────────────────
  // Stage 1: 10 memories
  // ──────────────────────────────────────────────────────────────────
  console.log("  ── Stage 1: 10 memories ──")

  const dir1 = resolve(TMP_ROOT, "stage-1")
  ensureDir(dir1)

  results.push(await bench(
    "1: 10 memories",
    async () => {
      if (existsSync(dir1)) rmSync(dir1, { recursive: true })
      ensureDir(dir1)
      const sys = new MemorySystem(dir1)
      await sys.initialize()
      for (let i = 0; i < 10; i++) {
        await sys.appendToMemory(memoryEntry(i))
      }
    },
    async () => {
      const sys = new MemorySystem(dir1)
      return sys.buildContext({ agentId: "bench", cwd: dir1 })
    },
    dir1,
  ))

  // ──────────────────────────────────────────────────────────────────
  // Stage 2: 100 memories
  // ──────────────────────────────────────────────────────────────────
  console.log("  ── Stage 2: 100 memories ──")

  const dir2 = resolve(TMP_ROOT, "stage-2")
  ensureDir(dir2)

  results.push(await bench(
    "2: 100 memories",
    async () => {
      if (existsSync(dir2)) rmSync(dir2, { recursive: true })
      ensureDir(dir2)
      const sys = new MemorySystem(dir2)
      await sys.initialize()
      for (let i = 0; i < NUM_MEMORIES; i++) {
        await sys.appendToMemory(memoryEntry(i))
      }
    },
    async () => {
      const sys = new MemorySystem(dir2)
      return sys.buildContext({ agentId: "bench", cwd: dir2 })
    },
    dir2,
  ))

  // ──────────────────────────────────────────────────────────────────
  // Stage 3: 100 memories + 30 daily logs
  // ──────────────────────────────────────────────────────────────────
  console.log("  ── Stage 3: 100 memories + 30 daily logs ──")

  const dir3 = resolve(TMP_ROOT, "stage-3")
  ensureDir(dir3)

  results.push(await bench(
    "3: +30 daily logs",
    async () => {
      if (existsSync(dir3)) rmSync(dir3, { recursive: true })
      ensureDir(dir3)
      const sys = new MemorySystem(dir3)
      await sys.initialize()
      for (let i = 0; i < NUM_MEMORIES; i++) {
        await sys.appendToMemory(memoryEntry(i))
      }
      for (let d = 0; d < NUM_DAILY_LOGS; d++) {
        const date = new Date()
        date.setDate(date.getDate() - (NUM_DAILY_LOGS - 1 - d))
        await sys.appendToDailyLog(dailyLogEntry(d, 0), date)
      }
    },
    async () => {
      const sys = new MemorySystem(dir3)
      return sys.buildContext({ agentId: "bench", cwd: dir3 })
    },
    dir3,
  ))

  // ──────────────────────────────────────────────────────────────────
  // Stage 4: +200 auto memories
  // ──────────────────────────────────────────────────────────────────
  console.log("  ── Stage 4: +200 auto memories ──")

  const dir4 = resolve(TMP_ROOT, "stage-4")
  ensureDir(dir4)

  results.push(await bench(
    "4: +200 auto mems",
    async () => {
      if (existsSync(dir4)) rmSync(dir4, { recursive: true })
      ensureDir(dir4)
      const sys = new MemorySystem(dir4)
      await sys.initialize()
      for (let i = 0; i < NUM_MEMORIES; i++) {
        await sys.appendToMemory(memoryEntry(i))
      }
      for (let d = 0; d < NUM_DAILY_LOGS; d++) {
        const date = new Date()
        date.setDate(date.getDate() - (NUM_DAILY_LOGS - 1 - d))
        await sys.appendToDailyLog(dailyLogEntry(d, 0), date)
      }
      for (let i = 0; i < NUM_AUTO_MEMORIES; i++) {
        await sys.saveAutoMemory(autoMemoryEntry(i), `tag-${i % 10}`)
      }
    },
    async () => {
      const sys = new MemorySystem(dir4)
      return sys.buildContext({ agentId: "bench", cwd: dir4 })
    },
    dir4,
  ))

  // ──────────────────────────────────────────────────────────────────
  // Stage 5: +500 facts
  // ──────────────────────────────────────────────────────────────────
  console.log("  ── Stage 5: +500 facts ──")

  const dir5 = resolve(TMP_ROOT, "stage-5")
  ensureDir(dir5)

  results.push(await bench(
    "5: +500 facts",
    async () => {
      if (existsSync(dir5)) rmSync(dir5, { recursive: true })
      ensureDir(dir5)
      const sys = new MemorySystem(dir5)
      await sys.initialize()
      for (let i = 0; i < NUM_MEMORIES; i++) {
        await sys.appendToMemory(memoryEntry(i))
      }
      for (let d = 0; d < NUM_DAILY_LOGS; d++) {
        const date = new Date()
        date.setDate(date.getDate() - (NUM_DAILY_LOGS - 1 - d))
        await sys.appendToDailyLog(dailyLogEntry(d, 0), date)
      }
      for (let i = 0; i < NUM_AUTO_MEMORIES; i++) {
        await sys.saveAutoMemory(autoMemoryEntry(i), `tag-${i % 10}`)
      }
      for (let i = 0; i < NUM_FACTS; i++) {
        await sys.extractAndStoreFacts(factConversation(i))
      }
    },
    async () => {
      const sys = new MemorySystem(dir5)
      return sys.buildContext({ agentId: "bench", cwd: dir5 })
    },
    dir5,
  ))

  // ──────────────────────────────────────────────────────────────────
  // Stage 6: Search benchmark on full dataset
  // ──────────────────────────────────────────────────────────────────
  console.log("  ── Stage 6: Search on full dataset ──")

  const dir6 = resolve(TMP_ROOT, "stage-6")
  ensureDir(dir6)

  // Setup once for all search queries
  {
    const sys = new MemorySystem(dir6)
    await sys.initialize()
    for (let i = 0; i < NUM_MEMORIES; i++) await sys.appendToMemory(memoryEntry(i))
    for (let d = 0; d < NUM_DAILY_LOGS; d++) {
      const date = new Date()
      date.setDate(date.getDate() - (NUM_DAILY_LOGS - 1 - d))
      await sys.appendToDailyLog(dailyLogEntry(d, 0), date)
    }
    for (let i = 0; i < NUM_AUTO_MEMORIES; i++) await sys.saveAutoMemory(autoMemoryEntry(i), `tag-${i % 10}`)
    for (let i = 0; i < NUM_FACTS; i++) await sys.extractAndStoreFacts(factConversation(i))
  }

  // Search: specific term (fast path)
  results.push(await bench(
    "6a: Search specific",
    async () => { /* data already setup */ },
    async () => {
      const sys = new MemorySystem(dir6)
      const r = await sys.search("Redis", 10)
      return r.map((e) => e.content).join("\n")
    },
    dir6,
  ))

  // Search: broad term (slower path)
  results.push(await bench(
    "6b: Search broad",
    async () => { /* data already setup */ },
    async () => {
      const sys = new MemorySystem(dir6)
      const r = await sys.search("database optimization performance", 10)
      return r.map((e) => e.content).join("\n")
    },
    dir6,
  ))

  // Search: term matching facts
  results.push(await bench(
    "6c: Search facts",
    async () => { /* data already setup */ },
    async () => {
      const sys = new MemorySystem(dir6)
      const r = await sys.search("Alice", 10)
      return r.map((e) => e.content).join("\n")
    },
    dir6,
  ))

  // ──────────────────────────────────────────────────────────────────
  // Render results table
  // ──────────────────────────────────────────────────────────────────
  renderResults(results)

  // ── Per-stage file stats ─────────────────────────────────────────
  console.log("  ── File statistics (final iteration) ──")
  console.log("")
  for (const r of results) {
    if (r.fileStats && Object.keys(r.fileStats).length > 0) {
      const parts = [`  ${r.label}:`]
      for (const [key, val] of Object.entries(r.fileStats)) {
        if (key.endsWith("_size") || key.endsWith(".md") || key.endsWith(".json")) {
          parts.push(` ${key}=${fmtBytes(val)}`)
        } else {
          parts.push(` ${key}=${val}`)
        }
      }
      console.log(parts.join(""))
    }
  }
  console.log("")

  // ── Summary ──────────────────────────────────────────────────────
  console.log("  ── Summary ──")
  console.log("")
  for (const r of results) {
    const ctxSize = fmtBytes(r.contextSize)
    console.log(`  ${r.label}: min=${fmtMs(r.minMs)} mean=${fmtMs(r.meanMs)} max=${fmtMs(r.maxMs)}  context=${ctxSize}`)
  }
  console.log("")

  // Compute scaling factor from stage 0 to stage 5
  if (results.length >= 6) {
    const empty = results[0]!.meanMs
    const full = results[5]!.meanMs
    const ratio = full / empty
    console.log(`  Scaling factor (empty → full): ${ratio.toFixed(1)}x`)
    console.log("")
  }

  // ── Baseline ─────────────────────────────────────────────────────
  const baseline: Record<string, { mean: number; min: number; max: number; samples: number }> = {}
  for (const r of results) {
    baseline[r.label] = { mean: r.meanMs, min: r.minMs, max: r.maxMs, samples: ITERATIONS }
  }

  if (UPDATE_BASELINE) {
    writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2))
    console.log(`  Baseline saved to ${BASELINE_FILE}`)
    console.log("")
  } else if (existsSync(BASELINE_FILE)) {
    const prev = JSON.parse(readFileSync(BASELINE_FILE, "utf-8")) as Record<string, { mean: number }>
    console.log("  ── Baseline comparison (regression check) ──")
    console.log("")
    let regression = false
    for (const r of results) {
      const prevEntry = prev[r.label]
      if (prevEntry && prevEntry.mean > 0) {
        const change = ((r.meanMs - prevEntry.mean) / prevEntry.mean) * 100
        const sign = change >= 0 ? "+" : ""
        const ok = change <= 20
        if (!ok) regression = true
        console.log(`  ${ok ? "✅" : "❌"} ${r.label}: ${fmtMs(r.meanMs)} (${sign}${change.toFixed(1)}% vs baseline)`)
      }
    }
    if (regression) {
      console.log("")
      console.log("  ❌ BENCHMARK REGRESSION DETECTED (>20% increase in one or more stages)")
      console.log("")
      process.exit(1)
    }
    console.log("")
  }

  // ── Cleanup ──────────────────────────────────────────────────────
  console.log("  Cleaning up temp directory…")
  cleanTmp()
  console.log("  Done.")
  console.log("")
}

runAll()

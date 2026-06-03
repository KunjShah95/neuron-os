#!/usr/bin/env bun
/**
 * Unit tests for VectorMemory — in-memory vector store with file persistence.
 *
 * NOTE: VectorMemory's storage path (VECTOR_DIR) is a module-level const
 * hardcoded to process.cwd(). To avoid polluting the real data dir, we
 * clean up before and after the test suite.
 */

import { VectorMemory } from "./vector"
import { existsSync, rmSync } from "node:fs"
import { resolve } from "node:path"

let passed = 0
let failed = 0

function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}

function assertEqual<T>(a: T, b: T, label: string) {
  if (a === b) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
}

// ── Cleanup VectorMemory's persistent storage ───────────────────────
// vector.ts writes to process.cwd()/.aegis/memory/vectors/ — clean it.

const VECTOR_STORAGE = resolve(process.cwd(), ".aegis", "memory", "vectors")

function cleanVectorStorage() {
  if (existsSync(VECTOR_STORAGE)) {
    rmSync(VECTOR_STORAGE, { recursive: true })
  }
}

function freshVM(): VectorMemory {
  const vm = new VectorMemory()
  return vm
}

// ── Initialization ──────────────────────────────────────────────────

async function testInitializeEmptyIndex() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const stats = await vm.getStats()
  assertEqual(stats.total, 0, "initialize() loads empty index as zero entries")
}

// ── Adding entries ──────────────────────────────────────────────────

async function testAddEntry() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const id = await vm.add("Hello world", "test", "greeting")
  assert(id.startsWith("vec-"), "add() returns id starting with vec-")
  assert(id.length > 4, "add() returns non-empty id")

  const stats = await vm.getStats()
  assertEqual(stats.total, 1, "add() increments total to 1")
}

async function testAddMultipleEntries() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("First entry about AI", "test", "ai")
  await vm.add("Second entry about databases", "test", "db")
  await vm.add("Third entry about AI agents", "test", "ai")

  const stats = await vm.getStats()
  assertEqual(stats.total, 3, "add() three entries")
  assertEqual(stats.byCategory["ai"], 2, "add() counts by category (ai=2)")
  assertEqual(stats.byCategory["db"], 1, "add() counts by category (db=1)")
}

async function testAddEntryWithoutCategory() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Uncategorized entry", "test")

  const stats = await vm.getStats()
  assertEqual(stats.total, 1, "uncategorized entry counted")
  assertEqual(stats.byCategory["uncategorized"], 1, "uncategorized entry in uncategorized bucket")
}

// ── Search / cosine similarity ──────────────────────────────────────

async function testSearchReturnsRelevant() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("The database connection pool is full", "error", "database")
  await vm.add("I like cats and they are furry", "chat", "personal")
  await vm.add("Optimize SQL query performance", "note", "database")

  const results = await vm.search("database performance", 5, 0.01)
  assert(results.length >= 2, "search finds database-related entries")
  if (results.length > 0) {
    assert(results[0]!.content.includes("database") || results[0]!.content.includes("performance"),
      "top result contains 'database' or 'performance'")
  }
}

async function testSearchLimit() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  for (let i = 0; i < 10; i++) {
    await vm.add(`Entry number ${i} about AI`, "test", "ai")
  }

  const results = await vm.search("AI", 3, 0)
  assertEqual(results.length, 3, "search respects limit=3")
}

async function testSearchMinSimilarity() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Python programming language", "note", "code")
  await vm.add("Banana bread recipe", "note", "cooking")

  const strict = await vm.search("python", 5, 0.5)
  const loose = await vm.search("python", 5, 0)

  assert(loose.length >= strict.length, "lower minSimilarity returns >= results than higher")
}

async function testSearchEmptyQuery() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Some content", "test", "general")

  const results = await vm.search("", 5)
  assertEqual(results.length, 0, "empty query returns zero results")
}

async function testSearchReturnsSortedByScore() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("I love machine learning and AI", "note", "ai")
  await vm.add("I hiked five miles yesterday", "note", "personal")

  const results = await vm.search("machine learning AI", 5, 0.01)
  assert(results.length >= 1, "search returns AI entry for AI query")
  if (results.length >= 2) {
    assert(results[0]!.content.includes("machine learning"), "top result is most relevant")
  }
}

// ── Cosine similarity ───────────────────────────────────────────────

async function testSimilarTextsRankNearby() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("This is a test document about artificial intelligence", "test", "demo")
  await vm.add("This is a test document about artificial intelligence", "test", "demo")

  const results = await vm.search("artificial intelligence", 10, 0)
  assert(results.length >= 2, "identical texts both returned for matching query")
  // First hit should have similarity >= second hit (stable sort)
  if (results.length >= 2 && results[0] && results[1]) {
    assert(results[0]!.content === results[1]!.content, "identical content entries have same text")
  }
}

// ── Search by category ──────────────────────────────────────────────

async function testSearchByCategory() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Item 1", "test", "alpha")
  await vm.add("Item 2", "test", "beta")
  await vm.add("Item 3", "test", "alpha")

  const alphaResults = await vm.searchByCategory("alpha")
  assertEqual(alphaResults.length, 2, "searchByCategory('alpha') returns 2 entries")

  const betaResults = await vm.searchByCategory("beta")
  assertEqual(betaResults.length, 1, "searchByCategory('beta') returns 1 entry")

  const gammaResults = await vm.searchByCategory("gamma")
  assertEqual(gammaResults.length, 0, "searchByCategory('gamma') returns 0 entries")
}

async function testSearchByCategoryLimit() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  for (let i = 0; i < 10; i++) {
    await vm.add(`Entry ${i}`, "test", "test-cat")
  }

  const results = await vm.searchByCategory("test-cat", 3)
  assertEqual(results.length, 3, "searchByCategory respects limit=3")
}

// ── Stats ───────────────────────────────────────────────────────────

async function testGetStatsEmpty() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const stats = await vm.getStats()
  assertEqual(stats.total, 0, "empty store: total=0")
  assertEqual(Object.keys(stats.byCategory).length, 0, "empty store: byCategory={}")
}

async function testGetStatsAfterAdd() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("A", "src1", "cat1")
  await vm.add("B", "src1", "cat2")
  await vm.add("C", "src2", "cat1")
  await vm.add("D", "src2") // no category -> uncategorized

  const stats = await vm.getStats()
  assertEqual(stats.total, 4, "stats total=4")
  assertEqual(stats.byCategory["cat1"], 2, "stats cat1=2")
  assertEqual(stats.byCategory["cat2"], 1, "stats cat2=1")
  assertEqual(stats.byCategory["uncategorized"], 1, "stats uncategorized=1")
}

// ── Remove / clear ──────────────────────────────────────────────────

async function testRemove() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const id1 = await vm.add("First", "test")
  await vm.add("Second", "test")

  let stats = await vm.getStats()
  assertEqual(stats.total, 2, "before remove: total=2")

  const removed = await vm.remove(id1)
  assert(removed, "remove() returns true for existing ID")

  stats = await vm.getStats()
  assertEqual(stats.total, 1, "after remove: total=1")
}

async function testRemoveNonExistent() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const removed = await vm.remove("non-existent-id")
  assert(!removed, "remove() returns false for non-existent ID")
}

async function testClear() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("A", "test")
  await vm.add("B", "test")
  await vm.add("C", "test")

  let stats = await vm.getStats()
  assertEqual(stats.total, 3, "before clear: total=3")

  await vm.clear()

  stats = await vm.getStats()
  assertEqual(stats.total, 0, "after clear: total=0")
}

// ── Embedding edge cases ────────────────────────────────────────────

async function testEmptyContent() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const id = await vm.add("", "test")
  assert(id.startsWith("vec-"), "add() accepts empty string content")
}

async function testSpecialCharacters() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Hello! How are you? #special @chars", "test", "mixed")
  const results = await vm.search("Hello! @chars", 5, 0)
  assert(results.length >= 1, "search handles special characters in query")
}

async function testLargeContent() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const bigText = "word ".repeat(1000)
  const id = await vm.add(bigText, "test", "large")
  assert(id.startsWith("vec-"), "add() handles 1000-word content")
}

// ── Duplicate entries ───────────────────────────────────────────────

async function testAddDuplicateContent() {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Same content", "test")
  await vm.add("Same content", "test")

  const stats = await vm.getStats()
  assertEqual(stats.total, 2, "add() allows duplicate content (vector memory doesn't deduplicate)")
}

// ── Runner ──────────────────────────────────────────────────────────

async function runAll() {
  console.log("\n=== VectorMemory Tests ===\n")

  // Clean slate before any tests
  cleanVectorStorage()

  await testInitializeEmptyIndex()
  await testAddEntry()
  await testAddMultipleEntries()
  await testAddEntryWithoutCategory()
  await testSearchReturnsRelevant()
  await testSearchLimit()
  await testSearchMinSimilarity()
  await testSearchEmptyQuery()
  await testSearchReturnsSortedByScore()
  await testSimilarTextsRankNearby()
  await testSearchByCategory()
  await testSearchByCategoryLimit()
  await testGetStatsEmpty()
  await testGetStatsAfterAdd()
  await testRemove()
  await testRemoveNonExistent()
  await testClear()
  await testEmptyContent()
  await testSpecialCharacters()
  await testLargeContent()
  await testAddDuplicateContent()

  // Final cleanup
  cleanVectorStorage()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()

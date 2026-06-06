import { describe, it, expect } from "bun:test"
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

describe("Vector Tests", () => {

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

it("should initialize empty index", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const stats = await vm.getStats()
  expect(stats.total).toBe(0)
})

// ── Adding entries ──────────────────────────────────────────────────

it("should add entry", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const id = await vm.add("Hello world", "test", "greeting")
  expect(id.startsWith("vec-")).toBe(true)
  expect(id.length > 4).toBe(true)

  const stats = await vm.getStats()
  expect(stats.total).toBe(1)
})

it("should add multiple entries", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("First entry about AI", "test", "ai")
  await vm.add("Second entry about databases", "test", "db")
  await vm.add("Third entry about AI agents", "test", "ai")

  const stats = await vm.getStats()
  expect(stats.total).toBe(3)
  expect(stats.byCategory["ai"]).toBe(2)
  expect(stats.byCategory["db"]).toBe(1)
})

it("should add entry without category", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Uncategorized entry", "test")

  const stats = await vm.getStats()
  expect(stats.total).toBe(1)
  expect(stats.byCategory["uncategorized"]).toBe(1)
})

// ── Search / cosine similarity ──────────────────────────────────────

it("should search returns relevant", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("The database connection pool is full", "error", "database")
  await vm.add("I like cats and they are furry", "chat", "personal")
  await vm.add("Optimize SQL query performance", "note", "database")

  const results = await vm.search("database performance", 5, 0.01)
  expect(results.length >= 2).toBe(true)
  if (results.length > 0) {
    expect(results[0]!.content.includes("database") || results[0]!.content.includes("performance")).toBe(true)
  }
})

it("should search limit", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  for (let i = 0; i < 10; i++) {
    await vm.add(`Entry number ${i} about AI`, "test", "ai")
  }

  const results = await vm.search("AI", 3, 0)
  expect(results.length).toBe(3)
})

it("should search min similarity", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Python programming language", "note", "code")
  await vm.add("Banana bread recipe", "note", "cooking")

  const strict = await vm.search("python", 5, 0.5)
  const loose = await vm.search("python", 5, 0)

  expect(loose.length >= strict.length).toBe(true)
})

it("should search empty query", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Some content", "test", "general")

  const results = await vm.search("", 5)
  expect(results.length).toBe(0)
})

it("should search returns sorted by score", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("I love machine learning and AI", "note", "ai")
  await vm.add("I hiked five miles yesterday", "note", "personal")

  const results = await vm.search("machine learning AI", 5, 0.01)
  expect(results.length >= 1).toBe(true)
  if (results.length >= 2) {
    expect(results[0]!.content.includes("machine learning")).toBe(true)
  }
})

// ── Cosine similarity ───────────────────────────────────────────────

it("should similar texts rank nearby", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("This is a test document about artificial intelligence", "test", "demo")
  await vm.add("This is a test document about artificial intelligence", "test", "demo")

  const results = await vm.search("artificial intelligence", 10, 0)
  expect(results.length >= 2).toBe(true)
  // First hit should have similarity >= second hit (stable sort)
  if (results.length >= 2 && results[0] && results[1]) {
    expect(results[0]!.content === results[1]!.content).toBe(true)
  }
})

// ── Search by category ──────────────────────────────────────────────

it("should search by category", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Item 1", "test", "alpha")
  await vm.add("Item 2", "test", "beta")
  await vm.add("Item 3", "test", "alpha")

  const alphaResults = await vm.searchByCategory("alpha")
  expect(alphaResults.length).toBe(2)

  const betaResults = await vm.searchByCategory("beta")
  expect(betaResults.length).toBe(1)

  const gammaResults = await vm.searchByCategory("gamma")
  expect(gammaResults.length).toBe(0)
})

it("should search by category limit", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  for (let i = 0; i < 10; i++) {
    await vm.add(`Entry ${i}`, "test", "test-cat")
  }

  const results = await vm.searchByCategory("test-cat", 3)
  expect(results.length).toBe(3)
})

// ── Stats ───────────────────────────────────────────────────────────

it("should get stats empty", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const stats = await vm.getStats()
  expect(stats.total).toBe(0)
  expect(Object.keys(stats.byCategory).length).toBe(0)
})

it("should get stats after add", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("A", "src1", "cat1")
  await vm.add("B", "src1", "cat2")
  await vm.add("C", "src2", "cat1")
  await vm.add("D", "src2") // no category -> uncategorized

  const stats = await vm.getStats()
  expect(stats.total).toBe(4)
  expect(stats.byCategory["cat1"]).toBe(2)
  expect(stats.byCategory["cat2"]).toBe(1)
  expect(stats.byCategory["uncategorized"]).toBe(1)
})

// ── Remove / clear ──────────────────────────────────────────────────

it("should remove", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const id1 = await vm.add("First", "test")
  await vm.add("Second", "test")

  let stats = await vm.getStats()
  expect(stats.total).toBe(2)

  const removed = await vm.remove(id1)
  expect(removed).toBe(true)

  stats = await vm.getStats()
  expect(stats.total).toBe(1)
})

it("should remove non existent", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const removed = await vm.remove("non-existent-id")
  expect(!removed).toBe(true)
})

it("should clear", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("A", "test")
  await vm.add("B", "test")
  await vm.add("C", "test")

  let stats = await vm.getStats()
  expect(stats.total).toBe(3)

  await vm.clear()

  stats = await vm.getStats()
  expect(stats.total).toBe(0)
})

// ── Embedding edge cases ────────────────────────────────────────────

it("should empty content", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const id = await vm.add("", "test")
  expect(id.startsWith("vec-")).toBe(true)
})

it("should special characters", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Hello! How are you? #special @chars", "test", "mixed")
  const results = await vm.search("Hello! @chars", 5, 0)
  expect(results.length >= 1).toBe(true)
})

it("should large content", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  const bigText = "word ".repeat(1000)
  const id = await vm.add(bigText, "test", "large")
  expect(id.startsWith("vec-")).toBe(true)
})

// ── Duplicate entries ───────────────────────────────────────────────

it("should add duplicate content", async () => {
  cleanVectorStorage()
  const vm = freshVM()
  await vm.initialize()

  await vm.add("Same content", "test")
  await vm.add("Same content", "test")

  const stats = await vm.getStats()
  expect(stats.total).toBe(2)
})

// ── Runner ──────────────────────────────────────────────────────────

})

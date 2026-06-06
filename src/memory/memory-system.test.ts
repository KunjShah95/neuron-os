import { describe, it, expect } from "bun:test"
/**
 * Unit tests for MemorySystem — file-based long-term memory, facts, daily logs,
 * auto memories, search, and context building.
 *
 * Each test uses a fresh temp directory and creates its own MemorySystem instance
 * pointed at that directory to avoid state leakage.
 */

import { MemorySystem } from "./system"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("Memory System Tests", () => {



const TMP_ROOT = resolve(process.cwd(), "tmp-test-memsys-" + Date.now())

function freshSystem(subdir: string): MemorySystem {
  const dir = resolve(TMP_ROOT, subdir)
  mkdirSync(dir, { recursive: true })
  return new MemorySystem(dir)
}

// ── Initialization ──────────────────────────────────────────────────

it("should initialize", async () => {
  const sys = freshSystem("init-test")
  await sys.initialize()

  const memFile = resolve(TMP_ROOT, "init-test/MEMORY.md")
  const userFile = resolve(TMP_ROOT, "init-test/user.md")
  const factsFile = resolve(TMP_ROOT, "init-test/.aegis/memory/facts.json")
  expect(existsSync(memFile)).toBe(true)
  expect(existsSync(userFile)).toBe(true)
  expect(existsSync(factsFile)).toBe(true)

  const memContent = readFileSync(memFile, "utf-8")
  expect(memContent.includes("Aegis Memory")).toBe(true)
})

// ── User profile ────────────────────────────────────────────────────

it("should load user profile", async () => {
  const sys = freshSystem("load-user-test")
  await sys.initialize()

  const profile = await sys.loadUserProfile()
  expect(profile.includes("Your preferences")).toBe(true)
})

it("should load user profile empty before init", async () => {
  const sys = freshSystem("load-user-empty")
  // No explicit initialize — MemorySystem constructor doesn't auto-init
  const profile = await sys.loadUserProfile()
  expect(profile).toBe("")
})

it("should append to user profile", async () => {
  const sys = freshSystem("append-user-test")
  await sys.initialize()

  await sys.appendToUserProfile("## Custom Section\n\nCustom content")
  const profile = await sys.loadUserProfile()
  expect(profile.includes("Custom Section")).toBe(true)
  expect(profile.includes("Custom content")).toBe(true)
})

it("should update user profile preferences", async () => {
  const sys = freshSystem("update-prefs")
  await sys.initialize()

  await sys.updateUserProfile({ preferences: ["Use TypeScript", "Write tests", "Be concise"] })
  const profile = await sys.loadUserProfile()
  expect(profile.includes("Use TypeScript")).toBe(true)
  expect(profile.includes("Write tests")).toBe(true)
})

it("should update user profile never do", async () => {
  const sys = freshSystem("update-never")
  await sys.initialize()

  await sys.updateUserProfile({ neverDo: ["Delete production data", "Ignore errors"] })
  const profile = await sys.loadUserProfile()
  expect(profile.includes("Delete production data")).toBe(true)
})

it("should update user profile name", async () => {
  const sys = freshSystem("update-name")
  await sys.initialize()

  await sys.updateUserProfile({ name: "Test User" })
  const profile = await sys.loadUserProfile()
  expect(profile.includes("Test User")).toBe(true)
})

// ── Memory (MEMORY.md) ──────────────────────────────────────────────

it("should load memory", async () => {
  const sys = freshSystem("load-mem")
  await sys.initialize()

  const mem = await sys.loadMemory()
  expect(mem.includes("Aegis Memory")).toBe(true)
})

it("should append to memory", async () => {
  const sys = freshSystem("append-mem")
  await sys.initialize()

  await sys.appendToMemory("Important fact learned today")
  const mem = await sys.loadMemory()
  expect(mem.includes("Important fact learned today")).toBe(true)
  // Should have a timestamp line
  expect(mem.includes("## 20")).toBe(true)
})

// ── Daily logs ──────────────────────────────────────────────────────

it("should load daily log missing", async () => {
  const sys = freshSystem("daily-missing")
  await sys.initialize()

  const log = await sys.loadDailyLog(new Date("2020-01-01"))
  expect(log).toBe("")
})

it("should append and load daily log", async () => {
  const sys = freshSystem("daily-write")
  await sys.initialize()

  const date = new Date("2024-06-15T10:30:00")
  await sys.appendToDailyLog("Worked on feature X", date)

  const log = await sys.loadDailyLog(date)
  expect(log.includes("Daily Log - 2024-06-15")).toBe(true)
  expect(log.includes("Worked on feature X")).toBe(true)
})

it("should append multiple daily entries", async () => {
  const sys = freshSystem("daily-multi")
  await sys.initialize()

  const date = new Date("2024-06-15T10:00:00")
  await sys.appendToDailyLog("Morning work", date)

  const date2 = new Date("2024-06-15T14:00:00")
  await sys.appendToDailyLog("Afternoon work", date2)

  const log = await sys.loadDailyLog(date)
  expect(log.includes("Morning work")).toBe(true)
  expect(log.includes("Afternoon work")).toBe(true)
})

// ── Auto memories ───────────────────────────────────────────────────

it("should save and load auto memory", async () => {
  const sys = freshSystem("auto-save")
  await sys.initialize()

  await sys.saveAutoMemory("Key insight from conversation")
  const memories = await sys.loadAutoMemories(10)
  expect(memories.length >= 1).toBe(true)
  expect(memories[0]!.includes("Key insight from conversation")).toBe(true)
})

it("should save auto memory with tag", async () => {
  const sys = freshSystem("auto-tag")
  await sys.initialize()

  await sys.saveAutoMemory("Bug fix analysis", "bug")
  const memories = await sys.loadAutoMemories(10)
  expect(memories.length >= 1).toBe(true)
  expect(memories[0]!.includes("Bug fix analysis")).toBe(true)
})

it("should load auto memories limit", async () => {
  const sys = freshSystem("auto-limit")
  await sys.initialize()

  for (let i = 0; i < 5; i++) {
    await sys.saveAutoMemory(`Memory entry ${i}`, `tag-${i}`)
  }

  const limited = await sys.loadAutoMemories(2)
  expect(limited.length).toBe(2)
})

it("should load auto memories returns recent", async () => {
  const sys = freshSystem("auto-recent")
  await sys.initialize()

  await sys.saveAutoMemory("Old memory")
  await new Promise((r) => setTimeout(r, 10)) // Ensure different timestamp
  await sys.saveAutoMemory("Recent memory")

  const memories = await sys.loadAutoMemories(10)
  expect(memories.some((m) => m.includes("Recent memory"))).toBe(true)
})

// ── Fact extraction ─────────────────────────────────────────────────

it("should extract identity fact", async () => {
  const sys = freshSystem("fact-identity")
  await sys.initialize()

  const facts = await sys.extractAndStoreFacts("Hi, my name is Alice. I am a developer.")
  const identityFacts = facts.filter((f) => f.category === "identity")
  expect(identityFacts.length >= 1).toBe(true)
  expect(identityFacts.some((f) => f.fact.includes("Alice") || f.fact.includes("developer"))).toBe(true)
})

it("should extract preference fact", async () => {
  const sys = freshSystem("fact-pref")
  await sys.initialize()

  const facts = await sys.extractAndStoreFacts("I prefer functional programming. I like Rust.")
  const prefFacts = facts.filter((f) => f.category === "preference")
  expect(prefFacts.length >= 1).toBe(true)
})

it("should extract project fact", async () => {
  const sys = freshSystem("fact-proj")
  await sys.initialize()

  const facts = await sys.extractAndStoreFacts("the project is a CLI tool for AI agents")
  const projFacts = facts.filter((f) => f.category === "project")
  expect(projFacts.length >= 1).toBe(true)
})

it("should fact deduplication", async () => {
  const sys = freshSystem("fact-dedup")
  await sys.initialize()

  await sys.extractAndStoreFacts("my name is Bob")
  await sys.extractAndStoreFacts("my name is Bob") // Same fact again

  const allFacts = await sys.getAllFacts()
  const bobFacts = allFacts.filter((f) => f.fact.toLowerCase().includes("bob"))
  expect(bobFacts.length).toBe(1)
})

it("should get facts by category", async () => {
  const sys = freshSystem("fact-cat")
  await sys.initialize()

  await sys.extractAndStoreFacts("my name is Charlie. I prefer Python. the project is DataTool.")
  const identity = await sys.getFactsByCategory("identity")
  expect(identity.length >= 1).toBe(true)
  expect(identity.every((f) => f.category === "identity")).toBe(true)
})

it("should get all facts", async () => {
  const sys = freshSystem("fact-all")
  await sys.initialize()

  await sys.extractAndStoreFacts("my name is Dana. I enjoy hiking.")
  const all = await sys.getAllFacts()
  expect(all.length >= 2).toBe(true)
})

// ── Search ──────────────────────────────────────────────────────────

it("should search returns matches", async () => {
  const sys = freshSystem("search-test")
  await sys.initialize()

  await sys.appendToMemory("The database runs on PostgreSQL")
  const results = await sys.search("database", 10)
  expect(results.length >= 1).toBe(true)
  expect(results.some((r) => r.source === "memory")).toBe(true)
})

it("should search empty query", async () => {
  const sys = freshSystem("search-empty")
  await sys.initialize()

  const results = await sys.search("", 10)
  expect(results.length).toBe(0)
})

it("should search returns facts", async () => {
  const sys = freshSystem("search-facts")
  await sys.initialize()

  await sys.extractAndStoreFacts("the project is called NeuronOS")
  // The fact regex extracts the capture group: "called NeuronOS"
  // Search for "NeuronOS" which appears in the extracted fact
  const results = await sys.search("NeuronOS", 10)
  expect(results.length >= 1).toBe(true)
})

it("should search limit", async () => {
  const sys = freshSystem("search-limit")
  await sys.initialize()

  for (let i = 0; i < 5; i++) {
    await sys.appendToMemory(`Memory entry ${i} about searchable content`)
  }

  // Search for a term that appears in all of them
  const results = await sys.search("searchable", 3)
  expect(results.length <= 3).toBe(true)
})

// ── computeRelevance (private, tested indirectly via search) ────────

it("should exact match ranked higher", async () => {
  const sys = freshSystem("relevance")
  await sys.initialize()

  await sys.appendToMemory("The weather today is sunny and warm")
  await sys.appendToMemory("Weather forecasting uses complex models")

  const results = await sys.search("weather today", 5)
  expect(results.length >= 1).toBe(true)
  // First result should contain more matching terms
  if (results.length >= 2) {
    const first = results[0]!.content
    const second = results[1]!.content
    const firstTerms = (first.match(/weather|today/gi) || []).length
    const secondTerms = (second.match(/weather|today/gi) || []).length
    expect(firstTerms >= secondTerms).toBe(true)
  }
})

// ── buildContext ────────────────────────────────────────────────────

it("should build context includes user profile", async () => {
  const sys = freshSystem("ctx-user")
  await sys.initialize()

  const ctx = await sys.buildContext({ agentId: "test-1", cwd: TMP_ROOT })
  expect(ctx.includes("User Profile")).toBe(true)
})

it("should build context includes memory", async () => {
  const sys = freshSystem("ctx-mem")
  await sys.initialize()

  await sys.appendToMemory("Critical project knowledge")
  const ctx = await sys.buildContext({ agentId: "test-2", cwd: TMP_ROOT })
  expect(ctx.includes("Long-term Memory")).toBe(true)
})

it("should build context includes facts", async () => {
  const sys = freshSystem("ctx-facts")
  await sys.initialize()

  await sys.extractAndStoreFacts("the project is called Aegis")
  const ctx = await sys.buildContext({ agentId: "test-3", cwd: TMP_ROOT })
  expect(ctx.includes("Known Facts")).toBe(true)
})

it("should build context includes daily log", async () => {
  const sys = freshSystem("ctx-daily")
  await sys.initialize()

  const today = new Date()
  await sys.appendToDailyLog("Worked on memory module tests", today)
  const ctx = await sys.buildContext({ agentId: "test-4", cwd: TMP_ROOT })
  expect(ctx.includes("Today's Log")).toBe(true)
})

it("should build context without agent memory", async () => {
  // MemorySystem without AgentMemoryConnector
  const sys = new MemorySystem(resolve(TMP_ROOT, "ctx-no-am"))
  await sys.initialize()

  const ctx = await sys.buildContext({ agentId: "test-5", cwd: TMP_ROOT })
  expect(ctx.length > 0).toBe(true)
})

// ── Runner ──────────────────────────────────────────────────────────

})

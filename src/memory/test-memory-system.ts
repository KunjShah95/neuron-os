#!/usr/bin/env bun
/**
 * Unit tests for MemorySystem — file-based long-term memory, facts, daily logs,
 * auto memories, search, and context building.
 *
 * Each test uses a fresh temp directory and creates its own MemorySystem instance
 * pointed at that directory to avoid state leakage.
 */

import { MemorySystem } from "./system"
import { existsSync, mkdirSync, rmSync, readFileSync } from "node:fs"
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

function assertContains(haystack: string, needle: string, label: string) {
  if (haystack.includes(needle)) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected to contain ${JSON.stringify(needle)}`) }
}

const TMP_ROOT = resolve(process.cwd(), "tmp-test-memsys-" + Date.now())

function cleanTmp() {
  if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true })
}

function freshSystem(subdir: string): MemorySystem {
  const dir = resolve(TMP_ROOT, subdir)
  mkdirSync(dir, { recursive: true })
  return new MemorySystem(dir)
}

// ── Initialization ──────────────────────────────────────────────────

async function testInitialize() {
  const sys = freshSystem("init-test")
  await sys.initialize()

  const memFile = resolve(TMP_ROOT, "init-test/MEMORY.md")
  const userFile = resolve(TMP_ROOT, "init-test/user.md")
  const factsFile = resolve(TMP_ROOT, "init-test/.aegis/memory/facts.json")
  assert(existsSync(memFile), "initialize() creates MEMORY.md")
  assert(existsSync(userFile), "initialize() creates user.md")
  assert(existsSync(factsFile), "initialize() creates facts.json")

  const memContent = readFileSync(memFile, "utf-8")
  assertContains(memContent, "Aegis Memory", "MEMORY.md has header")
}

// ── User profile ────────────────────────────────────────────────────

async function testLoadUserProfile() {
  const sys = freshSystem("load-user-test")
  await sys.initialize()

  const profile = await sys.loadUserProfile()
  assert(profile.includes("Your preferences"), "loadUserProfile returns default content")
}

async function testLoadUserProfileEmptyBeforeInit() {
  const sys = freshSystem("load-user-empty")
  // No explicit initialize — MemorySystem constructor doesn't auto-init
  const profile = await sys.loadUserProfile()
  assertEqual(profile, "", "loadUserProfile returns empty before initialize()")
}

async function testAppendToUserProfile() {
  const sys = freshSystem("append-user-test")
  await sys.initialize()

  await sys.appendToUserProfile("## Custom Section\n\nCustom content")
  const profile = await sys.loadUserProfile()
  assertContains(profile, "Custom Section", "appendToUserProfile adds content")
  assertContains(profile, "Custom content", "appended content is present")
}

async function testUpdateUserProfilePreferences() {
  const sys = freshSystem("update-prefs")
  await sys.initialize()

  await sys.updateUserProfile({ preferences: ["Use TypeScript", "Write tests", "Be concise"] })
  const profile = await sys.loadUserProfile()
  assertContains(profile, "Use TypeScript", "updateUserProfile adds preference")
  assertContains(profile, "Write tests", "updateUserProfile adds second preference")
}

async function testUpdateUserProfileNeverDo() {
  const sys = freshSystem("update-never")
  await sys.initialize()

  await sys.updateUserProfile({ neverDo: ["Delete production data", "Ignore errors"] })
  const profile = await sys.loadUserProfile()
  assertContains(profile, "Delete production data", "updateUserProfile adds neverDo")
}

async function testUpdateUserProfileName() {
  const sys = freshSystem("update-name")
  await sys.initialize()

  await sys.updateUserProfile({ name: "Test User" })
  const profile = await sys.loadUserProfile()
  assertContains(profile, "Test User", "updateUserProfile updates name")
}

// ── Memory (MEMORY.md) ──────────────────────────────────────────────

async function testLoadMemory() {
  const sys = freshSystem("load-mem")
  await sys.initialize()

  const mem = await sys.loadMemory()
  assertContains(mem, "Aegis Memory", "loadMemory returns content")
}

async function testAppendToMemory() {
  const sys = freshSystem("append-mem")
  await sys.initialize()

  await sys.appendToMemory("Important fact learned today")
  const mem = await sys.loadMemory()
  assertContains(mem, "Important fact learned today", "appendToMemory adds content")
  // Should have a timestamp line
  assert(mem.includes("## 20"), "appendToMemory adds timestamp line")
}

// ── Daily logs ──────────────────────────────────────────────────────

async function testLoadDailyLogMissing() {
  const sys = freshSystem("daily-missing")
  await sys.initialize()

  const log = await sys.loadDailyLog(new Date("2020-01-01"))
  assertEqual(log, "", "loadDailyLog returns empty for missing date")
}

async function testAppendAndLoadDailyLog() {
  const sys = freshSystem("daily-write")
  await sys.initialize()

  const date = new Date("2024-06-15T10:30:00")
  await sys.appendToDailyLog("Worked on feature X", date)

  const log = await sys.loadDailyLog(date)
  assertContains(log, "Daily Log - 2024-06-15", "loadDailyLog has header")
  assertContains(log, "Worked on feature X", "loadDailyLog has content")
}

async function testAppendMultipleDailyEntries() {
  const sys = freshSystem("daily-multi")
  await sys.initialize()

  const date = new Date("2024-06-15T10:00:00")
  await sys.appendToDailyLog("Morning work", date)

  const date2 = new Date("2024-06-15T14:00:00")
  await sys.appendToDailyLog("Afternoon work", date2)

  const log = await sys.loadDailyLog(date)
  assertContains(log, "Morning work", "first entry present")
  assertContains(log, "Afternoon work", "second entry present")
}

// ── Auto memories ───────────────────────────────────────────────────

async function testSaveAndLoadAutoMemory() {
  const sys = freshSystem("auto-save")
  await sys.initialize()

  await sys.saveAutoMemory("Key insight from conversation")
  const memories = await sys.loadAutoMemories(10)
  assert(memories.length >= 1, "loadAutoMemories returns saved memory")
  assertContains(memories[0]!, "Key insight from conversation", "auto memory content matches")
}

async function testSaveAutoMemoryWithTag() {
  const sys = freshSystem("auto-tag")
  await sys.initialize()

  await sys.saveAutoMemory("Bug fix analysis", "bug")
  const memories = await sys.loadAutoMemories(10)
  assert(memories.length >= 1, "tagged memory saved")
  assertContains(memories[0]!, "Bug fix analysis", "tagged memory content matches")
}

async function testLoadAutoMemoriesLimit() {
  const sys = freshSystem("auto-limit")
  await sys.initialize()

  for (let i = 0; i < 5; i++) {
    await sys.saveAutoMemory(`Memory entry ${i}`, `tag-${i}`)
  }

  const limited = await sys.loadAutoMemories(2)
  assertEqual(limited.length, 2, "loadAutoMemories respects limit")
}

async function testLoadAutoMemoriesReturnsRecent() {
  const sys = freshSystem("auto-recent")
  await sys.initialize()

  await sys.saveAutoMemory("Old memory")
  await new Promise((r) => setTimeout(r, 10)) // Ensure different timestamp
  await sys.saveAutoMemory("Recent memory")

  const memories = await sys.loadAutoMemories(10)
  assert(memories.some((m) => m.includes("Recent memory")), "recent memories returned")
}

// ── Fact extraction ─────────────────────────────────────────────────

async function testExtractIdentityFact() {
  const sys = freshSystem("fact-identity")
  await sys.initialize()

  const facts = await sys.extractAndStoreFacts("Hi, my name is Alice. I am a developer.")
  const identityFacts = facts.filter((f) => f.category === "identity")
  assert(identityFacts.length >= 1, "extracted identity fact")
  assert(identityFacts.some((f) => f.fact.includes("Alice") || f.fact.includes("developer")),
    "identity fact contains name or role")
}

async function testExtractPreferenceFact() {
  const sys = freshSystem("fact-pref")
  await sys.initialize()

  const facts = await sys.extractAndStoreFacts("I prefer functional programming. I like Rust.")
  const prefFacts = facts.filter((f) => f.category === "preference")
  assert(prefFacts.length >= 1, "extracted preference fact")
}

async function testExtractProjectFact() {
  const sys = freshSystem("fact-proj")
  await sys.initialize()

  const facts = await sys.extractAndStoreFacts("the project is a CLI tool for AI agents")
  const projFacts = facts.filter((f) => f.category === "project")
  assert(projFacts.length >= 1, "extracted project fact")
}

async function testFactDeduplication() {
  const sys = freshSystem("fact-dedup")
  await sys.initialize()

  await sys.extractAndStoreFacts("my name is Bob")
  await sys.extractAndStoreFacts("my name is Bob") // Same fact again

  const allFacts = await sys.getAllFacts()
  const bobFacts = allFacts.filter((f) => f.fact.toLowerCase().includes("bob"))
  assertEqual(bobFacts.length, 1, "deduplicates identical fact")
}

async function testGetFactsByCategory() {
  const sys = freshSystem("fact-cat")
  await sys.initialize()

  await sys.extractAndStoreFacts("my name is Charlie. I prefer Python. the project is DataTool.")
  const identity = await sys.getFactsByCategory("identity")
  assert(identity.length >= 1, "getFactsByCategory('identity') returns facts")
  assert(identity.every((f) => f.category === "identity"), "all returned facts are identity category")
}

async function testGetAllFacts() {
  const sys = freshSystem("fact-all")
  await sys.initialize()

  await sys.extractAndStoreFacts("my name is Dana. I enjoy hiking.")
  const all = await sys.getAllFacts()
  assert(all.length >= 2, "getAllFacts returns all extracted facts")
}

// ── Search ──────────────────────────────────────────────────────────

async function testSearchReturnsMatches() {
  const sys = freshSystem("search-test")
  await sys.initialize()

  await sys.appendToMemory("The database runs on PostgreSQL")
  const results = await sys.search("database", 10)
  assert(results.length >= 1, "search finds database-related memory")
  assert(results.some((r) => r.source === "memory"), "search result source is 'memory'")
}

async function testSearchEmptyQuery() {
  const sys = freshSystem("search-empty")
  await sys.initialize()

  const results = await sys.search("", 10)
  assertEqual(results.length, 0, "empty query returns zero results")
}

async function testSearchReturnsFacts() {
  const sys = freshSystem("search-facts")
  await sys.initialize()

  await sys.extractAndStoreFacts("the project is called NeuronOS")
  // The fact regex extracts the capture group: "called NeuronOS"
  // Search for "NeuronOS" which appears in the extracted fact
  const results = await sys.search("NeuronOS", 10)
  assert(results.length >= 1, "search finds facts matching query")
}

async function testSearchLimit() {
  const sys = freshSystem("search-limit")
  await sys.initialize()

  for (let i = 0; i < 5; i++) {
    await sys.appendToMemory(`Memory entry ${i} about searchable content`)
  }

  // Search for a term that appears in all of them
  const results = await sys.search("searchable", 3)
  assert(results.length <= 3, "search respects limit")
}

// ── computeRelevance (private, tested indirectly via search) ────────

async function testExactMatchRankedHigher() {
  const sys = freshSystem("relevance")
  await sys.initialize()

  await sys.appendToMemory("The weather today is sunny and warm")
  await sys.appendToMemory("Weather forecasting uses complex models")

  const results = await sys.search("weather today", 5)
  assert(results.length >= 1, "search returns results for weather query")
  // First result should contain more matching terms
  if (results.length >= 2) {
    const first = results[0]!.content
    const second = results[1]!.content
    const firstTerms = (first.match(/weather|today/gi) || []).length
    const secondTerms = (second.match(/weather|today/gi) || []).length
    assert(firstTerms >= secondTerms, "more matching terms ranked higher")
  }
}

// ── buildContext ────────────────────────────────────────────────────

async function testBuildContextIncludesUserProfile() {
  const sys = freshSystem("ctx-user")
  await sys.initialize()

  const ctx = await sys.buildContext({ agentId: "test-1", cwd: TMP_ROOT })
  assertContains(ctx, "User Profile", "buildContext includes User Profile section")
}

async function testBuildContextIncludesMemory() {
  const sys = freshSystem("ctx-mem")
  await sys.initialize()

  await sys.appendToMemory("Critical project knowledge")
  const ctx = await sys.buildContext({ agentId: "test-2", cwd: TMP_ROOT })
  assertContains(ctx, "Long-term Memory", "buildContext includes Long-term Memory section")
}

async function testBuildContextIncludesFacts() {
  const sys = freshSystem("ctx-facts")
  await sys.initialize()

  await sys.extractAndStoreFacts("the project is called Aegis")
  const ctx = await sys.buildContext({ agentId: "test-3", cwd: TMP_ROOT })
  assertContains(ctx, "Known Facts", "buildContext includes Known Facts section")
}

async function testBuildContextIncludesDailyLog() {
  const sys = freshSystem("ctx-daily")
  await sys.initialize()

  const today = new Date()
  await sys.appendToDailyLog("Worked on memory module tests", today)
  const ctx = await sys.buildContext({ agentId: "test-4", cwd: TMP_ROOT })
  assertContains(ctx, "Today's Log", "buildContext includes Today's Log section")
}

async function testBuildContextWithoutAgentMemory() {
  // MemorySystem without AgentMemoryConnector
  const sys = new MemorySystem(resolve(TMP_ROOT, "ctx-no-am"))
  await sys.initialize()

  const ctx = await sys.buildContext({ agentId: "test-5", cwd: TMP_ROOT })
  assert(ctx.length > 0, "buildContext returns content even without agentMemory")
}

// ── Runner ──────────────────────────────────────────────────────────

async function runAll() {
  console.log("\n=== MemorySystem Tests ===\n")

  cleanTmp()

  await testInitialize()
  await testLoadUserProfile()
  await testLoadUserProfileEmptyBeforeInit()
  await testAppendToUserProfile()
  await testUpdateUserProfilePreferences()
  await testUpdateUserProfileNeverDo()
  await testUpdateUserProfileName()
  await testLoadMemory()
  await testAppendToMemory()
  await testLoadDailyLogMissing()
  await testAppendAndLoadDailyLog()
  await testAppendMultipleDailyEntries()
  await testSaveAndLoadAutoMemory()
  await testSaveAutoMemoryWithTag()
  await testLoadAutoMemoriesLimit()
  await testLoadAutoMemoriesReturnsRecent()
  await testExtractIdentityFact()
  await testExtractPreferenceFact()
  await testExtractProjectFact()
  await testFactDeduplication()
  await testGetFactsByCategory()
  await testGetAllFacts()
  await testSearchReturnsMatches()
  await testSearchEmptyQuery()
  await testSearchReturnsFacts()
  await testSearchLimit()
  await testExactMatchRankedHigher()
  await testBuildContextIncludesUserProfile()
  await testBuildContextIncludesMemory()
  await testBuildContextIncludesFacts()
  await testBuildContextIncludesDailyLog()
  await testBuildContextWithoutAgentMemory()

  cleanTmp()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()

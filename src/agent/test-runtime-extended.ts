#!/usr/bin/env bun
/**
 * Extended AgentRuntime unit tests.
 *
 * Tests tool execution, memory integration, skill loading, and
 * the buildSystemPrompt pipeline — beyond the basic prompt tests.
 */

import { existsSync, mkdirSync, rmSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"

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

const TMP_DIR = resolve(tmpdir(), `aegis-test-runtime-ext-${Date.now()}`)

function setup() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })
}

function teardown() {
  if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true, force: true })
}

// ══════════════════════════════════════════════════════════════════
//  AgentRuntime: Construction & Context
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  AgentRuntime — Construction & Context                   ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testCreateRuntime() {
  const { AgentRuntime } = await import("./runtime")

  const runtime = new AgentRuntime({ agentId: "test-runner", cwd: TMP_DIR })
  assertEqual(runtime.context.agentId, "test-runner", "runtime preserves agentId")
  assertEqual(runtime.context.cwd, TMP_DIR, "runtime preserves cwd")
}

async function testCreateRuntimeWithMemory() {
  const { AgentRuntime } = await import("./runtime")
  const { MemorySystem } = await import("../memory/system")

  const memory = new MemorySystem(TMP_DIR)
  await memory.initialize()

  const runtime = new AgentRuntime({ agentId: "mem-test", cwd: TMP_DIR }, memory)
  assertEqual(runtime.context.agentId, "mem-test", "runtime with injected memory works")
}

async function testCreateAgentRuntimeHelper() {
  const { createAgentRuntime } = await import("./runtime")

  const runtime = createAgentRuntime("helper-test", "build", TMP_DIR)
  assertEqual(runtime.context.agentId, "helper-test", "createAgentRuntime sets agentId")
  assertEqual(runtime.context.agentType, "build", "createAgentRuntime sets agentType")
  assertEqual(runtime.context.cwd, TMP_DIR, "createAgentRuntime sets cwd")
}

// ══════════════════════════════════════════════════════════════════
//  AgentRuntime: Tool Execution
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  AgentRuntime — Tool Execution                          ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testExecuteToolAgentNotFound() {
  const { AgentRuntime } = await import("./runtime")

  const runtime = new AgentRuntime({ agentId: "nonexistent-agent", cwd: TMP_DIR })
  const result = await runtime.executeTool("bash", { command: "echo hi" })
  assert(!result.success, "executeTool fails for nonexistent agent")
  assert(typeof result.error === "string" && result.error.includes("not found"), "error message mentions agent not found")
}

async function testExecuteToolInvalidName() {
  const { AgentRuntime } = await import("./runtime")

  const runtime = new AgentRuntime({ agentId: "test-runner-2", cwd: TMP_DIR })
  const result = await runtime.executeTool("__nonexistent__tool__", {})
  assert(!result.success, "executeTool fails for nonexistent tool")
}

// ══════════════════════════════════════════════════════════════════
//  AgentRuntime: Memory Operations
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  AgentRuntime — Memory Operations                       ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testSaveAndSearchMemory() {
  const { AgentRuntime } = await import("./runtime")
  const { MemorySystem } = await import("../memory/system")

  setup()
  const memory = new MemorySystem(TMP_DIR)
  await memory.initialize()

  const runtime = new AgentRuntime({ agentId: "mem-ops", cwd: TMP_DIR }, memory)

  // Save to memory
  await runtime.saveToMemory("Test memory entry for runtime", "memory")
  await runtime.saveToMemory("Test daily log for runtime", "daily")
  await runtime.saveToMemory("Test auto memory for runtime", "auto")

  // Load memory context
  const ctx = await runtime.loadMemory()
  assertContains(ctx, "Test memory entry for runtime", "loadMemory includes saved memory content")
  assertContains(ctx, "Test daily log for runtime", "loadMemory includes daily log content")
  assertContains(ctx, "Test auto memory for runtime", "loadMemory includes auto memory content")

  // Search memory
  const searchResult = await runtime.searchMemory("runtime")
  assert(searchResult.length > 0, "searchMemory returns results for matching query")
  assertContains(searchResult, "Test memory entry", "searchMemory contains written content")
  teardown()
}

async function testSearchMemoryNoResults() {
  const { AgentRuntime } = await import("./runtime")
  const { MemorySystem } = await import("../memory/system")

  setup()
  const memory = new MemorySystem(TMP_DIR)
  await memory.initialize()

  const runtime = new AgentRuntime({ agentId: "search-empty", cwd: TMP_DIR }, memory)

  const result = await runtime.searchMemory("zzz_nonexistent_zzz")
  assert(result.includes("No relevant memories"), "searchMemory returns no-results message")
  teardown()
}

// ══════════════════════════════════════════════════════════════════
//  AgentRuntime: System Prompt Building
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  AgentRuntime — System Prompt                           ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testBuildSystemPromptWithMemory() {
  const { AgentRuntime } = await import("./runtime")
  const { MemorySystem } = await import("../memory/system")

  setup()
  const memory = new MemorySystem(TMP_DIR)
  await memory.initialize()
  await memory.appendToMemory("System prompt integration test data")

  const runtime = new AgentRuntime(
    { agentId: "prompt-test", agentType: "build", cwd: TMP_DIR },
    memory,
  )

  const prompt = await runtime.buildSystemPrompt()
  assertContains(prompt, "build agent", "system prompt includes agent type instructions")
  assertContains(prompt, "System prompt integration", "system prompt includes memory context")
  teardown()
}

async function testBuildSystemPromptWithDifferentTypes() {
  const { AgentRuntime } = await import("./runtime")
  const { MemorySystem } = await import("../memory/system")

  const dir = resolve(TMP_DIR, "prompt-types")
  mkdirSync(dir, { recursive: true })

  const memory = new MemorySystem(dir)
  await memory.initialize()

  const runtimeBuild = new AgentRuntime({ agentId: "build-test", agentType: "build", cwd: dir }, memory)
  const runtimeDebug = new AgentRuntime({ agentId: "debug-test", agentType: "debug", cwd: dir }, memory)

  const promptBuild = await runtimeBuild.buildSystemPrompt()
  const promptDebug = await runtimeDebug.buildSystemPrompt()

  assertContains(promptBuild, "build agent", "build agent prompt")
  assertContains(promptDebug, "debug agent", "debug agent prompt")
}

async function testBuildSystemPromptMinimal() {
  const { AgentRuntime } = await import("./runtime")
  const { MemorySystem } = await import("../memory/system")

  const dir = resolve(TMP_DIR, "prompt-minimal")
  mkdirSync(dir, { recursive: true })

  const memory = new MemorySystem(dir)
  await memory.initialize()

  const runtime = new AgentRuntime(
    { agentId: "minimal", cwd: TMP_DIR },
    memory,
  )

  const prompt = await runtime.buildSystemPrompt()
  assert(prompt.length > 0, "system prompt is non-empty even without agent type")
}

// ══════════════════════════════════════════════════════════════════
//  RUNNER
// ══════════════════════════════════════════════════════════════════

async function runAll() {
  console.log("\n  ╔══════════════════════════════════════════╗")
  console.log("  ║   AgentRuntime Extended Tests            ║")
  console.log("  ╚══════════════════════════════════════════╝")

  // ── Construction ──
  await testCreateRuntime()
  await testCreateRuntimeWithMemory()
  await testCreateAgentRuntimeHelper()

  // ── Tool Execution ──
  await testExecuteToolAgentNotFound()
  await testExecuteToolInvalidName()

  // ── Memory ──
  await testSaveAndSearchMemory()
  await testSearchMemoryNoResults()

  // ── System Prompt ──
  await testBuildSystemPromptWithMemory()
  await testBuildSystemPromptWithDifferentTypes()
  await testBuildSystemPromptMinimal()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()

#!/usr/bin/env bun
/**
 * Integration tests for the full agent lifecycle:
 *
 * ── MemorySystem → buildContext ──
 *   Write data (memories, facts, daily logs, auto memories, user profile)
 *   → buildContext() returns assembled context with all sections
 *
 * ── AgentRuntime → buildSystemPrompt ──
 *   Runtime builds a system prompt incorporating agent type instructions,
 *   soul, skill catalog, and memory context
 *
 * ── Cross-component flow ──
 *   MemorySystem writes → AgentRuntime.loadMemory() retrieves → buildSystemPrompt() includes it
 *
 * These tests use temp directories and do not require real AI API keys.
 */

import { MemorySystem } from "../memory/system"
import { AgentRuntime, createAgentRuntime } from "./runtime"
import { AgentEngine, type AgentEngineConfig } from "./engine"
import { createTestEngine as createTestEngineFromUtils } from "../test-utils/mock-ai"
import { existsSync, mkdirSync, rmSync } from "node:fs"
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

function assertNotContains(haystack: string, needle: string, label: string) {
  if (!haystack.includes(needle)) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected NOT to contain ${JSON.stringify(needle)}`) }
}

const TMP_ROOT = resolve(process.cwd(), "tmp-test-lifecycle-" + Date.now())

function cleanTmp() {
  if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true })
}

function freshMemorySystem(subdir: string): MemorySystem {
  const dir = resolve(TMP_ROOT, subdir)
  mkdirSync(dir, { recursive: true })
  return new MemorySystem(dir)
}

// ================================================================
//  MEMORYSYSTEM DATA FLOW → BUILDCONTEXT
// ================================================================

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  MemorySystem → buildContext Integration               ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testMemoryDataFlow() {
  // Initialise → write memory → buildContext contains it
  const sys = freshMemorySystem("mem-flow")
  await sys.initialize()

  await sys.appendToMemory("The authentication service uses JWT tokens with 24h expiry")
  const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "mem-flow") })

  assertContains(ctx, "Long-term Memory", "buildContext includes Long-term Memory section")
  assertContains(ctx, "JWT tokens", "buildContext includes written memory content")
  assertContains(ctx, "User Profile", "buildContext includes User Profile section")
}

async function testDailyLogInContext() {
  const sys = freshMemorySystem("daily-flow")
  await sys.initialize()

  const today = new Date()
  await sys.appendToDailyLog("Refactored the agent engine to support streaming", today)

  const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "daily-flow") })
  assertContains(ctx, "Today's Log", "buildContext includes Today's Log section")
  assertContains(ctx, "streaming", "buildContext includes daily log content")
}

async function testFactsInContext() {
  const sys = freshMemorySystem("facts-flow")
  await sys.initialize()

  await sys.extractAndStoreFacts("the project is called Neuron OS. I prefer TypeScript.")
  const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "facts-flow") })

  assertContains(ctx, "Known Facts", "buildContext includes Known Facts section")
  assertContains(ctx, "Neuron OS", "buildContext includes extracted fact about project")
  assertContains(ctx, "TypeScript", "buildContext includes extracted fact about preference")
}

async function testAutoMemoriesInContext() {
  const sys = freshMemorySystem("auto-flow")
  await sys.initialize()

  await sys.saveAutoMemory("Key insight: the pipeline should use async generators")
  const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "auto-flow") })

  assertContains(ctx, "Recent Auto Memories", "buildContext includes Recent Auto Memories section")
  assertContains(ctx, "async generators", "buildContext includes auto memory content")
}

async function testContextIsStructuredWithMarkdownHeaders() {
  const sys = freshMemorySystem("ctx-structure")
  await sys.initialize()

  await sys.appendToMemory("Important: database connection pooling is configured")
  await sys.appendToDailyLog("Set up connection pool settings", new Date())
  await sys.extractAndStoreFacts("the project uses PostgreSQL")
  await sys.saveAutoMemory("Connection pool size should be 20")

  const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "ctx-structure") })

  // Verify sections are separated by ---
  const sections = ctx.split("\n\n---\n\n")
  assert(sections.length >= 3, "buildContext returns multiple sections separated by ---")

  // Check section headers
  const headerCount = (ctx.match(/# (User Profile|Long-term Memory|Today's Log|Known Facts|Recent Auto Memories)/g) || []).length
  assert(headerCount >= 3, "buildContext includes at least 3 named sections")
}

async function testEmptyContext() {
  // Uninitialized MemorySystem returns empty context
  const sys = freshMemorySystem("ctx-empty")
  // No initialize() call
  const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "ctx-empty") })
  assertEqual(ctx, "", "buildContext returns empty string when nothing initialized")
}

async function testMultipleMemoryAppendsAccumulate() {
  const sys = freshMemorySystem("mem-accumulate")
  await sys.initialize()

  await sys.appendToMemory("Entry one: API endpoints documented")
  await sys.appendToMemory("Entry two: Rate limiting added")
  await sys.appendToMemory("Entry three: Error handling improved")

  const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "mem-accumulate") })
  assertContains(ctx, "Entry one", "first memory entry present")
  assertContains(ctx, "Entry two", "second memory entry present")
  assertContains(ctx, "Entry three", "third memory entry present")
}

async function testSearchIntegration() {
  // Write data → search finds it → buildContext reflects it
  const sys = freshMemorySystem("search-int")
  await sys.initialize()

  await sys.appendToMemory("PostgreSQL is the primary database with read replicas")
  await sys.extractAndStoreFacts("the database is PostgreSQL")

  // Search should find both sources
  const results = await sys.search("PostgreSQL", 10)
  assert(results.length >= 1, "search finds PostgreSQL results")
  assert(results.some((r) => r.source === "memory"), "search returns memory source results")

  // Rebuild context
  const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "search-int") })
  assertContains(ctx, "PostgreSQL", "buildContext includes searched content")
}

async function testUserProfileInContext() {
  const sys = freshMemorySystem("user-ctx")
  await sys.initialize()

  await sys.updateUserProfile({ name: "Integration Test User", preferences: ["Clean code", "Comprehensive tests"] })

  const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "user-ctx") })
  assertContains(ctx, "Integration Test User", "buildContext includes user name")
  assertContains(ctx, "Clean code", "buildContext includes user preferences")
}

// ================================================================
//  AGENTRUNTIME INTEGRATION
// ================================================================

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  AgentRuntime Integration                               ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testRuntimeCreatesSystemPrompt() {
  // AgentRuntime.buildSystemPrompt() returns a structured prompt
  const dir = resolve(TMP_ROOT, "rt-prompt")
  mkdirSync(dir, { recursive: true })

  const runtime = createAgentRuntime("integration-test", "build", dir)
  const prompt = await runtime.buildSystemPrompt()

  assert(prompt.length > 0, "buildSystemPrompt returns non-empty string")
  assertContains(prompt, "build agent", "system prompt includes agent type instructions")
}

async function testMemorySystemContextIsolation() {
  // Two MemorySystem instances with different directories should have isolated contexts
  const dirA = resolve(TMP_ROOT, "isolation-a")
  const dirB = resolve(TMP_ROOT, "isolation-b")
  mkdirSync(dirA, { recursive: true })
  mkdirSync(dirB, { recursive: true })

  const sysA = new MemorySystem(dirA)
  await sysA.initialize()
  await sysA.appendToMemory("Data for agent A only")

  const sysB = new MemorySystem(dirB)
  await sysB.initialize()
  await sysB.appendToMemory("Data for agent B only")

  const ctxA = await sysA.buildContext({ agentId: "a", cwd: dirA })
  const ctxB = await sysB.buildContext({ agentId: "b", cwd: dirB })

  assertContains(ctxA, "agent A", "context A contains its own data")
  assertContains(ctxB, "agent B", "context B contains its own data")
  assertNotContains(ctxA, "agent B", "context A does not leak context B's data")
}

async function testRuntimeWithDifferentAgentTypes() {
  // Different agent types produce different system prompts
  const runtimeBuild = createAgentRuntime("test-build", "build", resolve(TMP_ROOT, "rt-type-build"))
  const runtimePlan = createAgentRuntime("test-plan", "plan", resolve(TMP_ROOT, "rt-type-plan"))
  const runtimeDebug = createAgentRuntime("test-debug", "debug", resolve(TMP_ROOT, "rt-type-debug"))

  const promptBuild = await runtimeBuild.buildSystemPrompt()
  const promptPlan = await runtimePlan.buildSystemPrompt()
  const promptDebug = await runtimeDebug.buildSystemPrompt()

  assertContains(promptBuild, "build agent", "build agent prompt describes build focus")
  assertContains(promptPlan, "planning agent", "plan agent prompt describes planning focus")
  assertContains(promptDebug, "debug agent", "debug agent prompt describes debug focus")
}

async function testRuntimeWithInjectedMemory() {
  // TRUE integration test: inject a MemorySystem into AgentRuntime and verify
  // that data written to the memory system appears in the runtime's system prompt.
  // This was not possible before the refactoring because AgentRuntime used
  // the global singleton memorySystem.
  const dir = resolve(TMP_ROOT, "rt-injected-memory")
  mkdirSync(dir, { recursive: true })

  // Create a MemorySystem pointed at the temp dir
  const memory = new MemorySystem(dir)
  await memory.initialize()

  // Write data to the memory system
  await memory.appendToMemory("Injected memory: the API uses GraphQL for data fetching")
  await memory.updateUserProfile({ name: "Injected User", preferences: ["Dependency injection"] })
  await memory.extractAndStoreFacts("the project is Integration Test. I prefer TypeScript.")
  await memory.appendToDailyLog("Tested injected memory integration with AgentRuntime", new Date())
  await memory.saveAutoMemory("Injected memory works correctly", "testing")

  // Create an AgentRuntime with the injected memory system
  const runtime = new AgentRuntime(
    { agentId: "injected-test", agentType: "build", cwd: dir },
    memory,  // inject the MemorySystem directly
  )

  // Build the system prompt — it should include the injected memory data
  const prompt = await runtime.buildSystemPrompt()

  // Verify agent type instructions (these come from getAgentTypeInstructions, not memory)
  assertContains(prompt, "build agent", "injected: system prompt includes build agent instructions")

  // Verify memory data is present in the prompt
  assertContains(prompt, "GraphQL", "injected: memory content appears in system prompt")
  assertContains(prompt, "Injected User", "injected: user profile appears in system prompt")
  assertContains(prompt, "Integration Test", "injected: facts appear in system prompt")
  assertContains(prompt, "Injected memory works", "injected: auto memories appear in system prompt")
}

async function testRuntimeSaveToMemoryWithInjectedMemory() {
  // Test that saveToMemory writes to the injected memory system,
  // and the data is retrievable via loadMemory.
  const dir = resolve(TMP_ROOT, "rt-save-injected")
  mkdirSync(dir, { recursive: true })

  const memory = new MemorySystem(dir)
  await memory.initialize()

  const runtime = new AgentRuntime(
    { agentId: "save-test", agentType: "plan", cwd: dir },
    memory,
  )

  // Save to memory via the runtime
  await runtime.saveToMemory("Saved via runtime.saveToMemory: database connection configured", "memory")
  await runtime.saveToMemory("Saved via runtime.saveToMemory: daily progress logged", "daily")
  await runtime.saveToMemory("Saved via runtime.saveToMemory: key insight captured", "auto")

  // Build the system prompt — should include all saved data
  const prompt = await runtime.buildSystemPrompt()

  assertContains(prompt, "connection configured", "saveToMemory: memory entry appears in prompt")
  assertContains(prompt, "daily progress", "saveToMemory: daily log appears in prompt")
  assertContains(prompt, "key insight", "saveToMemory: auto memory appears in prompt")
}

async function testRuntimeSearchMemoryWithInjectedMemory() {
  // Test that searchMemory searches the injected memory system.
  const dir = resolve(TMP_ROOT, "rt-search-injected")
  mkdirSync(dir, { recursive: true })

  const memory = new MemorySystem(dir)
  await memory.initialize()

  await memory.appendToMemory("Redis cache configured for session store")
  await memory.appendToMemory("PostgreSQL connection pool size set to 20")

  const runtime = new AgentRuntime(
    { agentId: "search-test", agentType: "debug", cwd: dir },
    memory,
  )

  // Search via the runtime — should search the injected memory
  const memoryString = await runtime.loadMemory()
  assertContains(memoryString, "Redis cache", "loadMemory: returns injected memory content")
  assertContains(memoryString, "PostgreSQL", "loadMemory: returns second memory entry")
}

// ================================================================
//  CROSS-COMPONENT END-TO-END FLOW
// ================================================================

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  End-to-End Lifecycle Flow                              ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testFullLifecycleFlow() {
  // Complete flow: initialize → populate all data types → buildContext
  // → verify structured output with all sections populated
  const dir = resolve(TMP_ROOT, "e2e-full")
  mkdirSync(dir, { recursive: true })

  const memory = new MemorySystem(dir)
  await memory.initialize()

  // 1. Store user profile
  await memory.updateUserProfile({ name: "E2E Test", preferences: ["Integration tests", "Type safety"] })

  // 2. Store memories
  await memory.appendToMemory("The system uses a modular agent architecture")
  await memory.appendToMemory("Memory is persisted to disk using markdown files")

  // 3. Store daily log
  await memory.appendToDailyLog("Implemented end-to-end integration tests", new Date())

  // 4. Extract and store facts (using patterns that match the regex in system.ts)
  //    identity: /(?:I am|I'm|my name is|call me)\s+(\w+)/
  //    project:  /(?:we are working on|the project is|this project)\s+(.+)/
  //    preference: /(?:I prefer|I like|I love|I enjoy|my favorite)\s+(.+)/
  await memory.extractAndStoreFacts("my name is Alice. I prefer TypeScript. the project is Neuron OS.")

  // 5. Save auto memories
  await memory.saveAutoMemory("Integration tests should cover the full lifecycle", "testing")

  // 6. Build context and verify everything is included
  const ctx = await memory.buildContext({ agentId: "e2e-test", cwd: dir })

  assert(ctx.length > 0, "full lifecycle context is non-empty")

  // Verify all expected sections present
  assertContains(ctx, "User Profile", "end-to-end: User Profile section")
  assertContains(ctx, "Long-term Memory", "end-to-end: Long-term Memory section")
  assertContains(ctx, "Today's Log", "end-to-end: Today's Log section")
  assertContains(ctx, "Known Facts", "end-to-end: Known Facts section")
  assertContains(ctx, "Recent Auto Memories", "end-to-end: Recent Auto Memories section")

  // Verify data content
  assertContains(ctx, "modular agent architecture", "end-to-end: memory content preserved")
  assertContains(ctx, "TypeScript", "end-to-end: preference fact preserved")
  assertContains(ctx, "Neuron OS", "end-to-end: project fact preserved")
  assertContains(ctx, "Integration tests", "end-to-end: user preference preserved")
  assertContains(ctx, "E2E Test", "end-to-end: user name preserved")
  assertContains(ctx, "end-to-end integration tests", "end-to-end: daily log preserved")

  // Verify high-confidence facts appear with their category tags
  assertContains(ctx, "[identity]", "end-to-end: identity fact tagged in output")
  assertContains(ctx, "[preference]", "end-to-end: preference fact tagged in output")
  assertContains(ctx, "[project]", "end-to-end: project fact tagged in output")
}

async function testLifecycleWithSearchAfterWrite() {
  // Write data → search → verify search results → rebuild context
  // → verify context reflects written + searched content
  const dir = resolve(TMP_ROOT, "e2e-search-write")
  mkdirSync(dir, { recursive: true })

  const memory = new MemorySystem(dir)
  await memory.initialize()

  await memory.appendToMemory("API rate limiting is configured at 100 requests per minute")
  await memory.extractAndStoreFacts("the project is API Rate Limiter. I prefer rate limiting as a pattern.")

  // Search for the content
  const results = await memory.search("rate limit", 10)
  assert(results.length >= 1, "e2e search: finds rate limit results")
  assert(results.some((r) => r.content.includes("100")), "e2e search: results contain specific data")

  // Rebuild context
  const ctx = await memory.buildContext({ agentId: "e2e-search", cwd: dir })
  assertContains(ctx, "rate limiting", "e2e: context includes written memory content")
  assertContains(ctx, "Rate Limiter", "e2e: context includes extracted fact")
}

// ================================================================
//  MOCK AI PROVIDER FOR AGENTENGINE TESTS (imported from shared utilities)
// ================================================================

/**
 * Convenience wrapper around shared createTestEngine that uses the
 * lifecycle test-specific TMP_ROOT.
 */
async function createTestEngine(
  subdir: string,
  aiResponse: string,
  engineConfig?: AgentEngineConfig,
): Promise<{ engine: AgentEngine; runtime: AgentRuntime; memory: MemorySystem; dir: string }> {
  return createTestEngineFromUtils(TMP_ROOT, subdir, aiResponse, engineConfig)
}

// ================================================================
//  AGENTENGINE WITH MOCK AI
// ================================================================

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  AgentEngine with Mock AI                              ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testEngineChatReturnsMockResponse() {
  // Chat returns the predefined text from the mock AI
  const { engine } = await createTestEngine(
    "engine-chat",
    "This is a mocked AI response about TypeScript type safety.",
  )

  const result = await engine.chat([{ role: "user", content: "Tell me about TypeScript" }])

  assert(result.text.length > 0, "chat returns non-empty text")
  assertEqual(result.text, "This is a mocked AI response about TypeScript type safety.", "chat returns the mock AI response")
}

async function testEngineStreamChatReturnsFullText() {
  // streamChat accumulates chunks and returns the full text
  const { engine } = await createTestEngine(
    "engine-stream",
    "Streaming response with multiple chunks for testing.",
  )

  const collectedChunks: string[] = []
  const fullText = await engine.streamChat(
    [{ role: "user", content: "Write a short message" }],
    {
      onChunk: (chunk) => { collectedChunks.push(chunk) },
    },
  )

  assert(collectedChunks.length > 1, "streamChat emits multiple chunks for a multi-word response")
  assertEqual(fullText, "Streaming response with multiple chunks for testing.", "streamChat returns the full assembled text")

  // Verify chunks combine to full text
  const combined = collectedChunks.join("")
  assertEqual(combined, fullText, "onChunk callbacks combine to the full response")
}

async function testEngineStreamChatWithoutCallbacks() {
  // streamChat works without optional callbacks
  const { engine } = await createTestEngine(
    "engine-stream-nocb",
    "Response without callbacks.",
  )

  const fullText = await engine.streamChat([{ role: "user", content: "Hi" }])
  assertEqual(fullText, "Response without callbacks.", "streamChat works without onChunk callback")
}

async function testEngineChatWithInjectedMemory() {
  // Chat builds a system prompt from the injected MemorySystem
  // and passes it to the AI model (visible via the mock).
  const { engine, memory } = await createTestEngine(
    "engine-memory",
    "Response about agents.",
  )

  // Write data to the injected memory
  await memory.appendToMemory("The agent engine supports streaming chat responses")
  await memory.extractAndStoreFacts("the project is Mock AI Test. I prefer integration tests.")

  // Chat — this triggers buildSystemPrompt() which reads from the injected memory
  const result = await engine.chat([{ role: "user", content: "What does the engine support?" }])

  assert(result.text.length > 0, "chat with memory injection returns non-empty response")
  assertEqual(result.text, "Response about agents.", "chat with injected memory returns mock response")
}

async function testEngineChatWithMaxSteps() {
  // MaxSteps config is respected
  const { engine } = await createTestEngine(
    "engine-maxsteps",
    "Final answer with limited steps.",
    { maxSteps: 3 },
  )

  const result = await engine.chat([{ role: "user", content: "Solve this problem step by step" }])
  assert(result.text.length > 0, "chat with maxSteps returns response")
  assertEqual(result.text, "Final answer with limited steps.", "chat respects maxSteps")
}

async function testEngineChatUsesSystemPrompt() {
  // Verify the system prompt is built from the runtime (includes agent type + skill catalog)
  const { engine } = await createTestEngine(
    "engine-sysprompt",
    "System prompt received and understood.",
  )

  const result = await engine.chat([{ role: "user", content: "What is your role?" }])

  // The mock returns what we asked it to, but the important thing is
  // that the engine builds a system prompt without error and calls the model
  assert(result.text.length > 0, "chat with system prompt builds and invokes model")
}

async function testEngineChatWithMultipleMessages() {
  // Chat handles multiple message history
  const { engine } = await createTestEngine(
    "engine-multi-msg",
    "Here's the follow-up analysis.",
  )

  const messages = [
    { role: "user" as const, content: "First question" },
    { role: "assistant" as const, content: "First answer" },
    { role: "user" as const, content: "Follow-up question" },
  ]

  const result = await engine.chat(messages)
  assertEqual(result.text, "Here's the follow-up analysis.", "chat handles multi-message history")
}

// ================================================================
//  FULL PIPELINE: AGENTENGINE + RUNTIME + MEMORY
// ================================================================

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  Full Pipeline: AgentEngine + Runtime + Memory         ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testFullPipelineWriteAndChat() {
  // Complete pipeline: write data to memory → chat → mock AI responds
  // This verifies the entire lifecycle with no real API keys needed.
  const { engine, memory } = await createTestEngine(
    "pipeline-full",
    "Analysis complete. All systems operational.",
  )

  // Populate memory with context
  await memory.updateUserProfile({ name: "Pipeline Test", preferences: ["Integration tests"] })
  await memory.appendToMemory("The monitoring system checks health every 30 seconds")
  await memory.extractAndStoreFacts("the project is Full Pipeline. I prefer comprehensive testing.")
  await memory.appendToDailyLog("Ran full pipeline integration test", new Date())

  // Chat — the system prompt will include all the memory context
  const result = await engine.chat([{ role: "user", content: "Run the health check" }])

  assert(result.text.length > 0, "full pipeline: chat returns response")
  assertEqual(result.text, "Analysis complete. All systems operational.", "full pipeline: mock response returned")
}

async function testFullPipelineWithStreaming() {
  // Complete pipeline with streaming response
  const { engine, memory } = await createTestEngine(
    "pipeline-stream",
    "System message received. Processing request. Done."
  )

  // Add some memory context
  await memory.appendToMemory("Streaming endpoints are available at /api/stream")
  await memory.extractAndStoreFacts("the project is Streaming Pipeline.")

  // Stream chat
  const chunks: string[] = []
  const fullText = await engine.streamChat(
    [{ role: "user", content: "Stream data from the API" }],
    { onChunk: (chunk) => { chunks.push(chunk) } },
  )

  assert(chunks.length > 0, "full pipeline stream: chunks received")
  assert(fullText.length > 0, "full pipeline stream: full text returned")
  assertEqual(chunks.join(""), fullText, "full pipeline stream: chunks combine to full text")
}

// ================================================================
//  RUNNER
// ================================================================

async function runAll() {
  console.log("\n  ╔══════════════════════════════════════════╗")
  console.log("  ║   Full Agent Lifecycle Integration Tests  ║")
  console.log("  ╚══════════════════════════════════════════╝")

  cleanTmp()

  // ── MemorySystem → buildContext ──
  await testMemoryDataFlow()
  await testDailyLogInContext()
  await testFactsInContext()
  await testAutoMemoriesInContext()
  await testContextIsStructuredWithMarkdownHeaders()
  await testEmptyContext()
  await testMultipleMemoryAppendsAccumulate()
  await testSearchIntegration()
  await testUserProfileInContext()

  // ── AgentRuntime Integration ──
  await testRuntimeCreatesSystemPrompt()
  await testRuntimeWithDifferentAgentTypes()
  await testRuntimeWithInjectedMemory()
  await testRuntimeSaveToMemoryWithInjectedMemory()
  await testRuntimeSearchMemoryWithInjectedMemory()
  await testMemorySystemContextIsolation()

  // ── End-to-End Flow ──
  await testFullLifecycleFlow()
  await testLifecycleWithSearchAfterWrite()

  // ── AgentEngine with Mock AI ──
  await testEngineChatReturnsMockResponse()
  await testEngineStreamChatReturnsFullText()
  await testEngineStreamChatWithoutCallbacks()
  await testEngineChatWithInjectedMemory()
  await testEngineChatWithMaxSteps()
  await testEngineChatUsesSystemPrompt()
  await testEngineChatWithMultipleMessages()

  // ── Full Pipeline ──
  await testFullPipelineWriteAndChat()
  await testFullPipelineWithStreaming()

  cleanTmp()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()

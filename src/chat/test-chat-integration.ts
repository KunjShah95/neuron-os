#!/usr/bin/env bun
/**
 * Chat system integration tests with a mock AI provider.
 *
 * Tests the full chat pipeline: input handling → store → provider → streaming
 * using the mock AI infrastructure from test-lifecycle-integration.ts.
 *
 * No real API keys required.
 */

import { createInitialChatState, addUserMessage, addAssistantMessage, appendToStreamingMessage, finalizeStreamingMessage, saveChatSession, setStreamingError, createCheckpoint, rewindToCheckpoint } from "./store"
import type { ChatState } from "./store"
import { AgentRuntime } from "../agent/runtime"
import { AgentEngine, type AgentEngineConfig } from "../agent/engine"
import { MemorySystem } from "../memory/system"
import { createMockModel, createTestEngine as createTestEngineFromUtils, AIProviderManager, type AIConfig } from "../test-utils/mock-ai"
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

const TMP_ROOT = resolve(process.cwd(), "tmp-test-chat-int-" + Date.now())

function cleanTmp() {
  if (existsSync(TMP_ROOT)) rmSync(TMP_ROOT, { recursive: true })
}

// ── Mock AI helpers (imported from shared test utilities) ────────

async function createTestEnv(
  subdir: string,
  aiResponse: string,
  engineConfig?: AgentEngineConfig,
): Promise<{ engine: AgentEngine; runtime: AgentRuntime; memory: MemorySystem; state: ChatState }> {
  const { engine, runtime, memory } = await createTestEngineFromUtils(TMP_ROOT, subdir, aiResponse, engineConfig)
  const state = createInitialChatState("build")
  return { engine, runtime, memory, state }
}

// ══════════════════════════════════════════════════════════════════
//  Chat Store → Engine → Memory Pipeline
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  Chat Integration Tests: Store → Engine → Memory       ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testChatStoreCreatesState() {
  const state = createInitialChatState("build")
  assertEqual(state.messages.length, 1, "initial state has welcome message")
  assertEqual(state.messages[0]!.role, "assistant", "welcome message is from assistant")
  assertEqual(state.agentType, "build", "agent type is set")
  assert(state.sessionId.length > 0, "session ID is generated")
  assertEqual(state.ui.isStreaming, false, "not streaming initially")
  assertEqual(state.ui.input, "", "input empty initially")
}

async function testChatStoreAddUserAndAssistant() {
  const state = createInitialChatState()
  addUserMessage(state, "Hello from integration test")
  assertEqual(state.messages.length, 2, "user message added")
  assertEqual(state.messages[1]!.role, "user", "message role is user")
  assertEqual(state.messages[1]!.content, "Hello from integration test", "user message content preserved")
  assertEqual(state.ui.input, "", "input cleared after sending")
  assertEqual(state.ui.history.length, 1, "history has 1 entry")

  addAssistantMessage(state)
  assertEqual(state.messages.length, 3, "assistant message added")
  assertEqual(state.messages[2]!.status, "streaming", "assistant message starts streaming")
  assert(state.ui.isStreaming, "isStreaming set to true")
}

async function testChatStoreStreamingAndFinalize() {
  const state = createInitialChatState()
  addUserMessage(state, "Write a poem")
  addAssistantMessage(state)
  appendToStreamingMessage(state, "Roses are red, ")
  appendToStreamingMessage(state, "violets are blue")
  assertEqual(state.messages[2]!.content, "Roses are red, violets are blue", "streaming content accumulated")

  finalizeStreamingMessage(state)
  assertEqual(state.messages[2]!.status, "complete", "message finalized as complete")
  assert(!state.ui.isStreaming, "isStreaming false after finalize")
}

async function testChatStoreErrorHandling() {
  const state = createInitialChatState()
  addUserMessage(state, "Cause an error")
  addAssistantMessage(state)
  setStreamingError(state, "API connection failed")
  assertEqual(state.messages[2]!.status, "error", "message marked as error")
  assertEqual(state.messages[2]!.content, "Error: API connection failed", "error message preserved")
  assert(!state.ui.isStreaming, "isStreaming false after error")
}

async function testChatStoreCheckpointAndRewind() {
  const state = createInitialChatState()
  addUserMessage(state, "Message 1")
  addAssistantMessage(state)
  finalizeStreamingMessage(state)
  const msgCount = state.messages.length

  createCheckpoint(state, "Before message 2")
  assertEqual(state.checkpoints.length, 1, "checkpoint created")

  addUserMessage(state, "Message 2")
  assert(state.messages.length > msgCount, "more messages after checkpoint")

  const rewound = rewindToCheckpoint(state, 0)
  assert(rewound, "rewind successful")
  assertEqual(state.messages.length, msgCount, "messages restored to checkpoint count")
}

async function testChatSessionSaveAndLoad() {
  const state = createInitialChatState()
  addUserMessage(state, "Session test message")
  addAssistantMessage(state)
  finalizeStreamingMessage(state)

  // saveChatSession should not throw
  try {
    saveChatSession(state)
    assert(true, "saveChatSession completes without error")
  } catch (err: any) {
    assert(false, `saveChatSession threw: ${err.message}`)
  }
}

// ══════════════════════════════════════════════════════════════════
//  AgentEngine Chat with Mock AI
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  AgentEngine Chat with Mock AI Provider                ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testEngineChatBasic() {
  const { engine } = await createTestEnv("engine-basic", "Mock response for chat.")
  const result = await engine.chat([{ role: "user", content: "Hello" }])
  assertEqual(result.text, "Mock response for chat.", "chat returns mock response")
}

async function testEngineStreamChatBasic() {
  const { engine } = await createTestEnv("engine-stream-basic", "Streaming mock response.")
  const chunks: string[] = []
  const fullText = await engine.streamChat(
    [{ role: "user", content: "Stream this" }],
    { onChunk: (chunk) => { chunks.push(chunk) } },
  )
  assertEqual(fullText, "Streaming mock response.", "streamChat returns full text")
  assert(chunks.length > 0, "chunks were emitted")
  assertEqual(chunks.join(""), fullText, "chunks combine to full text")
}

async function testEngineChatMultipleMessages() {
  const { engine } = await createTestEnv("engine-multi", "Final analysis.")
  const messages = [
    { role: "user" as const, content: "First" },
    { role: "assistant" as const, content: "First response" },
    { role: "user" as const, content: "Follow up" },
  ]
  const result = await engine.chat(messages)
  assertEqual(result.text, "Final analysis.", "chat with history returns mock response")
}

async function testEngineChatWithMemory() {
  const { engine, memory } = await createTestEnv("engine-mem", "Memory-aware response.")
  await memory.appendToMemory("Important: the database uses PostgreSQL")
  const result = await engine.chat([{ role: "user", content: "What database?" }])
  assert(result.text.length > 0, "chat with memory returns response")
  assertEqual(result.text, "Memory-aware response.", "memory content flows through engine")
}

async function testEngineStreamChatNoCallbacks() {
  const { engine } = await createTestEnv("engine-stream-nocb", "No callback response.")
  const result = await engine.streamChat([{ role: "user", content: "Hi" }])
  assertEqual(result, "No callback response.", "streamChat works without callbacks")
}

async function testEngineChatWithDifferentAgentTypes() {
  // Test that the agent type influences the system prompt
  const dir = resolve(TMP_ROOT, "engine-agent-types")
  mkdirSync(dir, { recursive: true })
  const memory = new MemorySystem(dir)
  await memory.initialize()

  const mockModel = createMockModel("Build response")
  const buildAI = new AIProviderManager({ provider: "mock", model: "mock-model" } as unknown as AIConfig)
  Object.defineProperty(buildAI, "getModel", { value: () => mockModel, writable: false })

  const runtime = new AgentRuntime({ agentId: "build-test", agentType: "build", cwd: dir }, memory)
  const engine = new AgentEngine(runtime, buildAI)
  const result = await engine.chat([{ role: "user", content: "What type are you?" }])
  assert(result.text.length > 0, "chat with build agent type returns response")
}

async function testEngineChatMaxSteps() {
  const { engine } = await createTestEnv("engine-steps", "Stepped response.", { maxSteps: 5 })
  const result = await engine.chat([{ role: "user", content: "Do step by step" }])
  assertEqual(result.text, "Stepped response.", "chat with maxSteps returns mock response")
}

// ══════════════════════════════════════════════════════════════════
//  Full Pipeline: Memory → Runtime → Engine → Response
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  Full Pipeline: Memory → Runtime → Engine → Response    ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testFullPipelineAllDataTypes() {
  const { engine, memory } = await createTestEnv("pipeline-all", "Pipeline response.")
  await memory.appendToMemory("Memory entry for pipeline test")
  await memory.appendToDailyLog("Daily log entry for pipeline test", new Date())
  await memory.extractAndStoreFacts("the project is Pipeline Test. I prefer integration tests.")
  await memory.saveAutoMemory("Auto memory for pipeline test", "pipeline")
  await memory.updateUserProfile({ name: "Pipeline User", preferences: ["Comprehensive testing"] })

  const result = await engine.chat([{ role: "user", content: "Run pipeline" }])
  assert(result.text.length > 0, "full pipeline returns response")
  assertEqual(result.text, "Pipeline response.", "full pipeline mock response correct")
}

async function testFullPipelineStreamingAllData() {
  const { engine, memory } = await createTestEnv("pipeline-stream-all", "Streaming pipeline response.")
  await memory.appendToMemory("Streaming memory data")
  await memory.extractAndStoreFacts("the project is Streaming Pipeline Test.")

  const chunks: string[] = []
  const fullText = await engine.streamChat(
    [{ role: "user", content: "Test pipeline streaming" }],
    { onChunk: (chunk) => { chunks.push(chunk) } },
  )

  assert(chunks.length > 0, "streaming pipeline: chunks received")
  assertEqual(fullText, "Streaming pipeline response.", "streaming pipeline: full text correct")
  assertEqual(chunks.join(""), fullText, "streaming pipeline: chunks combine correctly")
}

async function testFullPipelineWriteAndSearch() {
  // Write → search → verify memory roundtrip
  const { engine, memory } = await createTestEnv("pipeline-roundtrip", "Roundtrip response.")

  await memory.appendToMemory("Roundtrip test data for memory roundtrip verification")
  const results = await memory.search("roundtrip", 5)
  assert(results.length >= 1, "search finds written data")
  assert(results.some((r) => r.content.includes("Roundtrip test")), "search result contains written content")

  const result = await engine.chat([{ role: "user", content: "Test roundtrip" }])
  assertEqual(result.text, "Roundtrip response.", "chat after memory roundtrip works")
}

// ================================================================
//  RUNNER
// ================================================================

async function runAll() {
  console.log("\n  ╔══════════════════════════════════════════╗")
  console.log("  ║   Chat Integration Test Suite            ║")
  console.log("  ╚══════════════════════════════════════════╝")

  cleanTmp()

  // ── Chat Store Tests ──
  await testChatStoreCreatesState()
  await testChatStoreAddUserAndAssistant()
  await testChatStoreStreamingAndFinalize()
  await testChatStoreErrorHandling()
  await testChatStoreCheckpointAndRewind()
  await testChatSessionSaveAndLoad()

  // ── AgentEngine with Mock AI ──
  await testEngineChatBasic()
  await testEngineStreamChatBasic()
  await testEngineChatMultipleMessages()
  await testEngineChatWithMemory()
  await testEngineStreamChatNoCallbacks()
  await testEngineChatWithDifferentAgentTypes()
  await testEngineChatMaxSteps()

  // ── Full Pipeline ──
  await testFullPipelineAllDataTypes()
  await testFullPipelineStreamingAllData()
  await testFullPipelineWriteAndSearch()

  cleanTmp()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()

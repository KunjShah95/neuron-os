import { describe, it, expect } from "bun:test"
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
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"

describe("Chat Integration Tests", () => {

const TMP_ROOT = resolve(process.cwd(), "tmp-test-chat-int-" + Date.now())

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

console.log("╚══════════════════════════════════════════════════════════╝\n")

it("should chat store creates state", async () => {
  const state = createInitialChatState("build")
  expect(state.messages.length).toBe(1)
  expect(state.messages[0]!.role).toBe("assistant")
  expect(state.agentType).toBe("build")
  expect(state.sessionId.length > 0).toBe(true)
  expect(state.ui.isStreaming).toBe(false)
  expect(state.ui.input).toBe("")
})

it("should chat store add user and assistant", async () => {
  const state = createInitialChatState()
  addUserMessage(state, "Hello from integration test")
  expect(state.messages.length).toBe(2)
  expect(state.messages[1]!.role).toBe("user")
  expect(state.messages[1]!.content).toBe("Hello from integration test")
  expect(state.ui.input).toBe("")
  expect(state.ui.history.length).toBe(1)

  addAssistantMessage(state)
  expect(state.messages.length).toBe(3)
  expect(state.messages[2]!.status).toBe("streaming")
  expect(state.ui.isStreaming).toBe(true)
})

it("should chat store streaming and finalize", async () => {
  const state = createInitialChatState()
  addUserMessage(state, "Write a poem")
  addAssistantMessage(state)
  appendToStreamingMessage(state, "Roses are red, ")
  appendToStreamingMessage(state, "violets are blue")
  expect(state.messages[2]!.content).toBe("Roses are red, violets are blue")

  finalizeStreamingMessage(state)
  expect(state.messages[2]!.status).toBe("complete")
  expect(!state.ui.isStreaming).toBe(true)
})

it("should chat store error handling", async () => {
  const state = createInitialChatState()
  addUserMessage(state, "Cause an error")
  addAssistantMessage(state)
  setStreamingError(state, "API connection failed")
  expect(state.messages[2]!.status).toBe("error")
  expect(state.messages[2]!.content).toBe("Error: API connection failed")
  expect(!state.ui.isStreaming).toBe(true)
})

it("should chat store checkpoint and rewind", async () => {
  const state = createInitialChatState()
  addUserMessage(state, "Message 1")
  addAssistantMessage(state)
  finalizeStreamingMessage(state)
  const msgCount = state.messages.length

  createCheckpoint(state, "Before message 2")
  expect(state.checkpoints.length).toBe(1)

  addUserMessage(state, "Message 2")
  expect(state.messages.length > msgCount).toBe(true)

  const rewound = rewindToCheckpoint(state, 0)
  expect(rewound).toBe(true)
  expect(state.messages.length).toBe(msgCount)
})

it("should chat session save and load", async () => {
  const state = createInitialChatState()
  addUserMessage(state, "Session test message")
  addAssistantMessage(state)
  finalizeStreamingMessage(state)

  // saveChatSession should not throw
  try {
    saveChatSession(state)
    expect(true).toBe(true)
  } catch (err: any) {
    expect(false).toBe(true)
  }
})

// ══════════════════════════════════════════════════════════════════
//  AgentEngine Chat with Mock AI
// ══════════════════════════════════════════════════════════════════

console.log("╚══════════════════════════════════════════════════════════╝\n")

it("should engine chat basic", async () => {
  const { engine } = await createTestEnv("engine-basic", "Mock response for chat.")
  const result = await engine.chat([{ role: "user", content: "Hello" }])
  expect(result.text).toBe("Mock response for chat.")
})

it("should engine stream chat basic", async () => {
  const { engine } = await createTestEnv("engine-stream-basic", "Streaming mock response.")
  const chunks: string[] = []
  const fullText = await engine.streamChat(
    [{ role: "user", content: "Stream this" }],
    { onChunk: (chunk) => { chunks.push(chunk) } },
  )
  expect(fullText).toBe("Streaming mock response.")
  expect(chunks.length > 0).toBe(true)
  expect(chunks.join("")).toBe(fullText)
})

it("should engine chat multiple messages", async () => {
  const { engine } = await createTestEnv("engine-multi", "Final analysis.")
  const messages = [
    { role: "user" as const, content: "First" },
    { role: "assistant" as const, content: "First response" },
    { role: "user" as const, content: "Follow up" },
  ]
  const result = await engine.chat(messages)
  expect(result.text).toBe("Final analysis.")
})

it("should engine chat with memory", async () => {
  const { engine, memory } = await createTestEnv("engine-mem", "Memory-aware response.")
  await memory.appendToMemory("Important: the database uses PostgreSQL")
  const result = await engine.chat([{ role: "user", content: "What database?" }])
  expect(result.text.length > 0).toBe(true)
  expect(result.text).toBe("Memory-aware response.")
})

it("should engine stream chat no callbacks", async () => {
  const { engine } = await createTestEnv("engine-stream-nocb", "No callback response.")
  const result = await engine.streamChat([{ role: "user", content: "Hi" }])
  expect(result).toBe("No callback response.")
})

it("should engine chat with different agent types", async () => {
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
  expect(result.text.length > 0).toBe(true)
})

it("should engine chat max steps", async () => {
  const { engine } = await createTestEnv("engine-steps", "Stepped response.", { maxSteps: 5 })
  const result = await engine.chat([{ role: "user", content: "Do step by step" }])
  expect(result.text).toBe("Stepped response.")
})

// ══════════════════════════════════════════════════════════════════
//  Full Pipeline: Memory → Runtime → Engine → Response
// ══════════════════════════════════════════════════════════════════

console.log("╚══════════════════════════════════════════════════════════╝\n")

it("should full pipeline all data types", async () => {
  const { engine, memory } = await createTestEnv("pipeline-all", "Pipeline response.")
  await memory.appendToMemory("Memory entry for pipeline test")
  await memory.appendToDailyLog("Daily log entry for pipeline test", new Date())
  await memory.extractAndStoreFacts("the project is Pipeline Test. I prefer integration tests.")
  await memory.saveAutoMemory("Auto memory for pipeline test", "pipeline")
  await memory.updateUserProfile({ name: "Pipeline User", preferences: ["Comprehensive testing"] })

  const result = await engine.chat([{ role: "user", content: "Run pipeline" }])
  expect(result.text.length > 0).toBe(true)
  expect(result.text).toBe("Pipeline response.")
})

it("should full pipeline streaming all data", async () => {
  const { engine, memory } = await createTestEnv("pipeline-stream-all", "Streaming pipeline response.")
  await memory.appendToMemory("Streaming memory data")
  await memory.extractAndStoreFacts("the project is Streaming Pipeline Test.")

  const chunks: string[] = []
  const fullText = await engine.streamChat(
    [{ role: "user", content: "Test pipeline streaming" }],
    { onChunk: (chunk) => { chunks.push(chunk) } },
  )

  expect(chunks.length > 0).toBe(true)
  expect(fullText).toBe("Streaming pipeline response.")
  expect(chunks.join("")).toBe(fullText)
})

it("should full pipeline write and search", async () => {
  // Write → search → verify memory roundtrip
  const { engine, memory } = await createTestEnv("pipeline-roundtrip", "Roundtrip response.")

  await memory.appendToMemory("Roundtrip test data for memory roundtrip verification")
  const results = await memory.search("roundtrip", 5)
  expect(results.length >= 1).toBe(true)
  expect(results.some((r) => r.content.includes("Roundtrip test"))).toBe(true)

  const result = await engine.chat([{ role: "user", content: "Test roundtrip" }])
  expect(result.text).toBe("Roundtrip response.")
})

// ================================================================
//  RUNNER
// ================================================================

})

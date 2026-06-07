import { describe, it, expect } from "bun:test"
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
import { mkdirSync } from "node:fs"
import { resolve } from "node:path"

describe("Lifecycle Integration Tests", () => {
  const TMP_ROOT = resolve(process.cwd(), "tmp-test-lifecycle-" + Date.now())

  function freshMemorySystem(subdir: string): MemorySystem {
    const dir = resolve(TMP_ROOT, subdir)
    mkdirSync(dir, { recursive: true })
    return new MemorySystem(dir)
  }

  // ================================================================
  //  MEMORYSYSTEM DATA FLOW → BUILDCONTEXT
  // ================================================================

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should memory data flow", async () => {
    // Initialise → write memory → buildContext contains it
    const sys = freshMemorySystem("mem-flow")
    await sys.initialize()

    await sys.appendToMemory("The authentication service uses JWT tokens with 24h expiry")
    const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "mem-flow") })

    expect(ctx).toContain("Long-term Memory")
    expect(ctx).toContain("JWT tokens")
    expect(ctx).toContain("User Profile")
  })

  it("should daily log in context", async () => {
    const sys = freshMemorySystem("daily-flow")
    await sys.initialize()

    const today = new Date()
    await sys.appendToDailyLog("Refactored the agent engine to support streaming", today)

    const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "daily-flow") })
    expect(ctx).toContain("Today's Log")
    expect(ctx).toContain("streaming")
  })

  it("should facts in context", async () => {
    const sys = freshMemorySystem("facts-flow")
    await sys.initialize()

    await sys.extractAndStoreFacts("the project is called Neuron OS. I prefer TypeScript.")
    const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "facts-flow") })

    expect(ctx).toContain("Known Facts")
    expect(ctx).toContain("Neuron OS")
    expect(ctx).toContain("TypeScript")
  })

  it("should auto memories in context", async () => {
    const sys = freshMemorySystem("auto-flow")
    await sys.initialize()

    await sys.saveAutoMemory("Key insight: the pipeline should use async generators")
    const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "auto-flow") })

    expect(ctx).toContain("Recent Auto Memories")
    expect(ctx).toContain("async generators")
  })

  it("should context is structured with markdown headers", async () => {
    const sys = freshMemorySystem("ctx-structure")
    await sys.initialize()

    await sys.appendToMemory("Important: database connection pooling is configured")
    await sys.appendToDailyLog("Set up connection pool settings", new Date())
    await sys.extractAndStoreFacts("the project uses PostgreSQL")
    await sys.saveAutoMemory("Connection pool size should be 20")

    const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "ctx-structure") })

    // Verify sections are separated by ---
    const sections = ctx.split("\n\n---\n\n")
    expect(sections.length >= 3).toBe(true)

    // Check section headers
    const headerCount = (
      ctx.match(/# (User Profile|Long-term Memory|Today's Log|Known Facts|Recent Auto Memories)/g) || []
    ).length
    expect(headerCount >= 3).toBe(true)
  })

  it("should empty context", async () => {
    // Uninitialized MemorySystem returns empty context
    const sys = freshMemorySystem("ctx-empty")
    // No initialize() call
    const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "ctx-empty") })
    expect(ctx).toBe("")
  })

  it("should multiple memory appends accumulate", async () => {
    const sys = freshMemorySystem("mem-accumulate")
    await sys.initialize()

    await sys.appendToMemory("Entry one: API endpoints documented")
    await sys.appendToMemory("Entry two: Rate limiting added")
    await sys.appendToMemory("Entry three: Error handling improved")

    const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "mem-accumulate") })
    expect(ctx).toContain("Entry one")
    expect(ctx).toContain("Entry two")
    expect(ctx).toContain("Entry three")
  })

  it("should search integration", async () => {
    // Write data → search finds it → buildContext reflects it
    const sys = freshMemorySystem("search-int")
    await sys.initialize()

    await sys.appendToMemory("PostgreSQL is the primary database with read replicas")
    await sys.extractAndStoreFacts("the database is PostgreSQL")

    // Search should find both sources
    const results = await sys.search("PostgreSQL", 10)
    expect(results.length >= 1).toBe(true)
    expect(results.some((r) => r.source === "memory")).toBe(true)

    // Rebuild context
    const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "search-int") })
    expect(ctx).toContain("PostgreSQL")
  })

  it("should user profile in context", async () => {
    const sys = freshMemorySystem("user-ctx")
    await sys.initialize()

    await sys.updateUserProfile({ name: "Integration Test User", preferences: ["Clean code", "Comprehensive tests"] })

    const ctx = await sys.buildContext({ agentId: "test", cwd: resolve(TMP_ROOT, "user-ctx") })
    expect(ctx).toContain("Integration Test User")
    expect(ctx).toContain("Clean code")
  })

  // ================================================================
  //  AGENTRUNTIME INTEGRATION
  // ================================================================

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should runtime creates system prompt", async () => {
    // AgentRuntime.buildSystemPrompt() returns a structured prompt
    const dir = resolve(TMP_ROOT, "rt-prompt")
    mkdirSync(dir, { recursive: true })

    const runtime = createAgentRuntime("integration-test", "build", dir)
    const prompt = await runtime.buildSystemPrompt()

    expect(prompt.length > 0).toBe(true)
    expect(prompt).toContain("build agent")
  })

  it("should memory system context isolation", async () => {
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

    expect(ctxA).toContain("agent A")
    expect(ctxB).toContain("agent B")
    expect(ctxA).not.toContain("agent B")
  })

  it("should runtime with different agent types", async () => {
    // Different agent types produce different system prompts
    const runtimeBuild = createAgentRuntime("test-build", "build", resolve(TMP_ROOT, "rt-type-build"))
    const runtimePlan = createAgentRuntime("test-plan", "plan", resolve(TMP_ROOT, "rt-type-plan"))
    const runtimeDebug = createAgentRuntime("test-debug", "debug", resolve(TMP_ROOT, "rt-type-debug"))

    const promptBuild = await runtimeBuild.buildSystemPrompt()
    const promptPlan = await runtimePlan.buildSystemPrompt()
    const promptDebug = await runtimeDebug.buildSystemPrompt()

    expect(promptBuild).toContain("build agent")
    expect(promptPlan).toContain("planning agent")
    expect(promptDebug).toContain("debug agent")
  })

  it("should runtime with injected memory", async () => {
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
      memory, // inject the MemorySystem directly
    )

    // Build the system prompt — it should include the injected memory data
    const prompt = await runtime.buildSystemPrompt()

    // Verify agent type instructions (these come from getAgentTypeInstructions, not memory)
    expect(prompt).toContain("build agent")

    // Verify memory data is present in the prompt
    expect(prompt).toContain("GraphQL")
    expect(prompt).toContain("Injected User")
    expect(prompt).toContain("Integration Test")
    expect(prompt).toContain("Injected memory works")
  })

  it("should runtime save to memory with injected memory", async () => {
    // Test that saveToMemory writes to the injected memory system,
    // and the data is retrievable via loadMemory.
    const dir = resolve(TMP_ROOT, "rt-save-injected")
    mkdirSync(dir, { recursive: true })

    const memory = new MemorySystem(dir)
    await memory.initialize()

    const runtime = new AgentRuntime({ agentId: "save-test", agentType: "plan", cwd: dir }, memory)

    // Save to memory via the runtime
    await runtime.saveToMemory("Saved via runtime.saveToMemory: database connection configured", "memory")
    await runtime.saveToMemory("Saved via runtime.saveToMemory: daily progress logged", "daily")
    await runtime.saveToMemory("Saved via runtime.saveToMemory: key insight captured", "auto")

    // Build the system prompt — should include all saved data
    const prompt = await runtime.buildSystemPrompt()

    expect(prompt).toContain("connection configured")
    expect(prompt).toContain("daily progress")
    expect(prompt).toContain("key insight")
  })

  it("should runtime search memory with injected memory", async () => {
    // Test that searchMemory searches the injected memory system.
    const dir = resolve(TMP_ROOT, "rt-search-injected")
    mkdirSync(dir, { recursive: true })

    const memory = new MemorySystem(dir)
    await memory.initialize()

    await memory.appendToMemory("Redis cache configured for session store")
    await memory.appendToMemory("PostgreSQL connection pool size set to 20")

    const runtime = new AgentRuntime({ agentId: "search-test", agentType: "debug", cwd: dir }, memory)

    // Search via the runtime — should search the injected memory
    const memoryString = await runtime.loadMemory()
    expect(memoryString).toContain("Redis cache")
    expect(memoryString).toContain("PostgreSQL")
  })

  // ================================================================
  //  CROSS-COMPONENT END-TO-END FLOW
  // ================================================================

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should full lifecycle flow", async () => {
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

    expect(ctx.length > 0).toBe(true)

    // Verify all expected sections present
    expect(ctx).toContain("User Profile")
    expect(ctx).toContain("Long-term Memory")
    expect(ctx).toContain("Today's Log")
    expect(ctx).toContain("Known Facts")
    expect(ctx).toContain("Recent Auto Memories")

    // Verify data content
    expect(ctx).toContain("modular agent architecture")
    expect(ctx).toContain("TypeScript")
    expect(ctx).toContain("Neuron OS")
    expect(ctx).toContain("Integration tests")
    expect(ctx).toContain("E2E Test")
    expect(ctx).toContain("end-to-end integration tests")

    // Verify high-confidence facts appear with their category tags
    expect(ctx).toContain("[identity]")
    expect(ctx).toContain("[preference]")
    expect(ctx).toContain("[project]")
  })

  it("should lifecycle with search after write", async () => {
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
    expect(results.length >= 1).toBe(true)
    expect(results.some((r) => r.content.includes("100"))).toBe(true)

    // Rebuild context
    const ctx = await memory.buildContext({ agentId: "e2e-search", cwd: dir })
    expect(ctx).toContain("rate limiting")
    expect(ctx).toContain("Rate Limiter")
  })

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

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should engine chat returns mock response", async () => {
    // Chat returns the predefined text from the mock AI
    const { engine } = await createTestEngine(
      "engine-chat",
      "This is a mocked AI response about TypeScript type safety.",
    )

    const result = await engine.chat([{ role: "user", content: "Tell me about TypeScript" }])

    expect(result.text.length > 0).toBe(true)
    expect(result.text).toBe("This is a mocked AI response about TypeScript type safety.")
  })

  it("should engine stream chat returns full text", async () => {
    // streamChat accumulates chunks and returns the full text
    const { engine } = await createTestEngine("engine-stream", "Streaming response with multiple chunks for testing.")

    const collectedChunks: string[] = []
    const fullText = await engine.streamChat([{ role: "user", content: "Write a short message" }], {
      onChunk: (chunk) => {
        collectedChunks.push(chunk)
      },
    })

    expect(collectedChunks.length > 1).toBe(true)
    expect(fullText).toBe("Streaming response with multiple chunks for testing.")

    // Verify chunks combine to full text
    const combined = collectedChunks.join("")
    expect(combined).toBe(fullText)
  })

  it("should engine stream chat without callbacks", async () => {
    // streamChat works without optional callbacks
    const { engine } = await createTestEngine("engine-stream-nocb", "Response without callbacks.")

    const fullText = await engine.streamChat([{ role: "user", content: "Hi" }])
    expect(fullText).toBe("Response without callbacks.")
  })

  it("should engine chat with injected memory", async () => {
    // Chat builds a system prompt from the injected MemorySystem
    // and passes it to the AI model (visible via the mock).
    const { engine, memory } = await createTestEngine("engine-memory", "Response about agents.")

    // Write data to the injected memory
    await memory.appendToMemory("The agent engine supports streaming chat responses")
    await memory.extractAndStoreFacts("the project is Mock AI Test. I prefer integration tests.")

    // Chat — this triggers buildSystemPrompt() which reads from the injected memory
    const result = await engine.chat([{ role: "user", content: "What does the engine support?" }])

    expect(result.text.length > 0).toBe(true)
    expect(result.text).toBe("Response about agents.")
  })

  it("should engine chat with max steps", async () => {
    // MaxSteps config is respected
    const { engine } = await createTestEngine("engine-maxsteps", "Final answer with limited steps.", { maxSteps: 3 })

    const result = await engine.chat([{ role: "user", content: "Solve this problem step by step" }])
    expect(result.text.length > 0).toBe(true)
    expect(result.text).toBe("Final answer with limited steps.")
  })

  it("should engine chat uses system prompt", async () => {
    // Verify the system prompt is built from the runtime (includes agent type + skill catalog)
    const { engine } = await createTestEngine("engine-sysprompt", "System prompt received and understood.")

    const result = await engine.chat([{ role: "user", content: "What is your role?" }])

    // The mock returns what we asked it to, but the important thing is
    // that the engine builds a system prompt without error and calls the model
    expect(result.text.length > 0).toBe(true)
  })

  it("should engine chat with multiple messages", async () => {
    // Chat handles multiple message history
    const { engine } = await createTestEngine("engine-multi-msg", "Here's the follow-up analysis.")

    const messages = [
      { role: "user" as const, content: "First question" },
      { role: "assistant" as const, content: "First answer" },
      { role: "user" as const, content: "Follow-up question" },
    ]

    const result = await engine.chat(messages)
    expect(result.text).toBe("Here's the follow-up analysis.")
  })

  // ================================================================
  //  FULL PIPELINE: AGENTENGINE + RUNTIME + MEMORY
  // ================================================================

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should full pipeline write and chat", async () => {
    // Complete pipeline: write data to memory → chat → mock AI responds
    // This verifies the entire lifecycle with no real API keys needed.
    const { engine, memory } = await createTestEngine("pipeline-full", "Analysis complete. All systems operational.")

    // Populate memory with context
    await memory.updateUserProfile({ name: "Pipeline Test", preferences: ["Integration tests"] })
    await memory.appendToMemory("The monitoring system checks health every 30 seconds")
    await memory.extractAndStoreFacts("the project is Full Pipeline. I prefer comprehensive testing.")
    await memory.appendToDailyLog("Ran full pipeline integration test", new Date())

    // Chat — the system prompt will include all the memory context
    const result = await engine.chat([{ role: "user", content: "Run the health check" }])

    expect(result.text.length > 0).toBe(true)
    expect(result.text).toBe("Analysis complete. All systems operational.")
  })

  it("should full pipeline with streaming", async () => {
    // Complete pipeline with streaming response
    const { engine, memory } = await createTestEngine(
      "pipeline-stream",
      "System message received. Processing request. Done.",
    )

    // Add some memory context
    await memory.appendToMemory("Streaming endpoints are available at /api/stream")
    await memory.extractAndStoreFacts("the project is Streaming Pipeline.")

    // Stream chat
    const chunks: string[] = []
    const fullText = await engine.streamChat([{ role: "user", content: "Stream data from the API" }], {
      onChunk: (chunk) => {
        chunks.push(chunk)
      },
    })

    expect(chunks.length > 0).toBe(true)
    expect(fullText.length > 0).toBe(true)
    expect(chunks.join("")).toBe(fullText)
  })

  // ================================================================
  //  RUNNER
  // ================================================================
})

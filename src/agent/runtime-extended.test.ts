import { describe, it, expect } from "bun:test"
/**
 * Extended AgentRuntime unit tests.
 *
 * Tests tool execution, memory integration, skill loading, and
 * the buildSystemPrompt pipeline — beyond the basic prompt tests.
 */

import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { tmpdir } from "node:os"

describe("Runtime Extended Tests", () => {
  const TMP_DIR = resolve(tmpdir(), `aegis-test-runtime-ext-${Date.now()}`)

  // ══════════════════════════════════════════════════════════════════
  //  AgentRuntime: Construction & Context
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should create runtime", async () => {
    const { AgentRuntime } = await import("./runtime")

    const runtime = new AgentRuntime({ agentId: "test-runner", cwd: TMP_DIR })
    expect(runtime.context.agentId).toBe("test-runner")
    expect(runtime.context.cwd).toBe(TMP_DIR)
  })

  it("should create runtime with memory", async () => {
    const { AgentRuntime } = await import("./runtime")
    const { MemorySystem } = await import("../memory/system")

    const memory = new MemorySystem(TMP_DIR)
    await memory.initialize()

    const runtime = new AgentRuntime({ agentId: "mem-test", cwd: TMP_DIR }, memory)
    expect(runtime.context.agentId).toBe("mem-test")
  })

  it("should create agent runtime helper", async () => {
    const { createAgentRuntime } = await import("./runtime")

    const runtime = createAgentRuntime("helper-test", "build", TMP_DIR)
    expect(runtime.context.agentId).toBe("helper-test")
    expect(runtime.context.agentType).toBe("build")
    expect(runtime.context.cwd).toBe(TMP_DIR)
  })

  // ══════════════════════════════════════════════════════════════════
  //  AgentRuntime: Tool Execution
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should execute tool agent not found", async () => {
    const { AgentRuntime } = await import("./runtime")

    const runtime = new AgentRuntime({ agentId: "nonexistent-agent", cwd: TMP_DIR })
    const result = await runtime.executeTool("bash", { command: "echo hi" })
    expect(!result.success).toBe(true)
    expect(typeof result.error === "string" && result.error.includes("not found")).toBe(true)
  })

  it("should execute tool invalid name", async () => {
    const { AgentRuntime } = await import("./runtime")

    const runtime = new AgentRuntime({ agentId: "test-runner-2", cwd: TMP_DIR })
    const result = await runtime.executeTool("__nonexistent__tool__", {})
    expect(!result.success).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  AgentRuntime: Memory Operations
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should save and search memory", async () => {
    const { AgentRuntime } = await import("./runtime")
    const { MemorySystem } = await import("../memory/system")

    const memory = new MemorySystem(TMP_DIR)
    await memory.initialize()

    const runtime = new AgentRuntime({ agentId: "mem-ops", cwd: TMP_DIR }, memory)

    // Save to memory
    await runtime.saveToMemory("Test memory entry for runtime", "memory")
    await runtime.saveToMemory("Test daily log for runtime", "daily")
    await runtime.saveToMemory("Test auto memory for runtime", "auto")

    // Load memory context
    const ctx = await runtime.loadMemory()
    expect(ctx).toContain("Test memory entry for runtime")
    expect(ctx).toContain("Test daily log for runtime")
    expect(ctx).toContain("Test auto memory for runtime")

    // Search memory
    const searchResult = await runtime.searchMemory("runtime")
    expect(searchResult.length > 0).toBe(true)
    expect(searchResult).toContain("Test memory entry")
  })

  it("should search memory no results", async () => {
    const { AgentRuntime } = await import("./runtime")
    const { MemorySystem } = await import("../memory/system")

    const memory = new MemorySystem(TMP_DIR)
    await memory.initialize()

    const runtime = new AgentRuntime({ agentId: "search-empty", cwd: TMP_DIR }, memory)

    const result = await runtime.searchMemory("zzz_nonexistent_zzz")
    expect(result.includes("No relevant memories")).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  AgentRuntime: System Prompt Building
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should build system prompt with memory", async () => {
    const { AgentRuntime } = await import("./runtime")
    const { MemorySystem } = await import("../memory/system")

    const memory = new MemorySystem(TMP_DIR)
    await memory.initialize()
    await memory.appendToMemory("System prompt integration test data")

    const runtime = new AgentRuntime({ agentId: "prompt-test", agentType: "build", cwd: TMP_DIR }, memory)

    const prompt = await runtime.buildSystemPrompt()
    expect(prompt).toContain("build agent")
    expect(prompt).toContain("System prompt integration")
  })

  it("should build system prompt with different types", async () => {
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

    expect(promptBuild).toContain("build agent")
    expect(promptDebug).toContain("debug agent")
  })

  it("should build system prompt minimal", async () => {
    const { AgentRuntime } = await import("./runtime")
    const { MemorySystem } = await import("../memory/system")

    const dir = resolve(TMP_DIR, "prompt-minimal")
    mkdirSync(dir, { recursive: true })

    const memory = new MemorySystem(dir)
    await memory.initialize()

    const runtime = new AgentRuntime({ agentId: "minimal", cwd: TMP_DIR }, memory)

    const prompt = await runtime.buildSystemPrompt()
    expect(prompt.length > 0).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  RUNNER
  // ══════════════════════════════════════════════════════════════════
})

import { describe, it, expect } from "bun:test"
import { createAgentRuntime } from "./runtime"
import { toolRegistry } from "../tools"

describe("Runtime Tests", () => {
  it("should build system prompt with expected content", async () => {
    const runtime = createAgentRuntime("runtime-test", "build", process.cwd())
    const prompt = await runtime.buildSystemPrompt()
    expect(prompt.includes("Build Soul")).toBe(true)
    expect(prompt.includes("Skill Catalog")).toBe(true)
    expect(prompt.includes("code-review")).toBe(true)
  })

  it("should execute read_skill tool for installed skills", async () => {
    createAgentRuntime("runtime-test", "build", process.cwd())
    const result = await toolRegistry.execute(
      "read_skill",
      { name: "code-review" },
      {
        agentId: "runtime-test",
        agentType: "build",
        cwd: process.cwd(),
        permissions: [{ name: "read_skill", allow: true }],
      },
    )
    expect(result.success).toBe(true)
    expect(result.output.includes("Code Review")).toBe(true)
  })

  it("should filter tool execution based on allowedTools list", async () => {
    const { agentManager } = await import("./manager")
    const runtime = createAgentRuntime("runtime-test-restrict", "build", process.cwd())

    // Mock an agent in agentManager
    agentManager.agents.set("runtime-test-restrict", {
      id: "runtime-test-restrict",
      status: "running",
      def: {
        id: "runtime-test-restrict",
        name: "Test Restrict",
        agentType: "build",
        tools: [{ name: "read_skill", allow: true }],
      },
    } as any)

    try {
      // 1. By default, tool is allowed (allowedTools is null)
      const result1 = await runtime.executeTool("read_skill", { name: "code-review" })
      expect(result1.success).toBe(true)

      // 2. Set allowed tools list to not include read_skill
      runtime.setAllowedTools(["other_tool"])
      const result2 = await runtime.executeTool("read_skill", { name: "code-review" })
      expect(result2.success).toBe(false)
      expect(result2.error).toContain("is not in the allowed list")

      // 3. Set allowed tools list to include read_skill
      runtime.setAllowedTools(["read_skill"])
      const result3 = await runtime.executeTool("read_skill", { name: "code-review" })
      expect(result3.success).toBe(true)
    } finally {
      agentManager.agents.delete("runtime-test-restrict")
    }
  })
})

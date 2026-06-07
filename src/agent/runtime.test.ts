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
})

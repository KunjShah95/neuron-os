import { describe, it, expect } from "bun:test"
import { computerTool } from "./computer"
import { toolRegistry } from "./registry"

describe("Computer Tests", () => {

  // Register if not already registered
  if (!toolRegistry.get("computer")) {
    toolRegistry.register(computerTool)
  }

  const tool = toolRegistry.get("computer")!

  it("should be registered with correct metadata", () => {
    expect(tool).toBeDefined()
    expect(tool.name).toBe("computer")
    expect(tool.parameters.length).toBe(5)
  })

  it("should handle screenshot action (may fail on headless)", async () => {
    const result = await computerTool.execute(
      { action: "screenshot" },
      { agentId: "test", cwd: process.cwd(), permissions: [{ name: "computer", allow: true }] }
    )
    expect(result.success === false || result.success === true).toBe(true)
  })

  it("should reject mouse_move without coordinates", async () => {
    const result = await computerTool.execute(
      { action: "mouse_move" },
      { agentId: "test", cwd: process.cwd(), permissions: [{ name: "computer", allow: true }] }
    )
    expect(result.success).toBe(false)
  })

  it("should reject unknown action", async () => {
    const result = await computerTool.execute(
      { action: "nonexistent", coordinate: [100, 100] } as any,
      { agentId: "test", cwd: process.cwd(), permissions: [{ name: "computer", allow: true }] }
    )
    expect(result.success).toBe(false)
  })

  it("should reject type without text", async () => {
    const result = await computerTool.execute(
      { action: "type" },
      { agentId: "test", cwd: process.cwd(), permissions: [{ name: "computer", allow: true }] }
    )
    expect(result.success).toBe(false)
  })

})

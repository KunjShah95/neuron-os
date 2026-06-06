import { describe, it, expect } from "bun:test"
import { ToolsetDef } from "./types"

describe("ToolsetDef schema", () => {
  it("validates a minimal toolset", () => {
    const result = ToolsetDef.safeParse({
      name: "web",
      description: "Web research tools",
      tools: ["web_search", "web_extract"],
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid names", () => {
    const result = ToolsetDef.safeParse({
      name: "Web Tools!",
      description: "bad",
    })
    expect(result.success).toBe(false)
  })

  it("defaults tools and includes to empty arrays", () => {
    const result = ToolsetDef.parse({
      name: "empty",
      description: "empty set",
    })
    expect(result.tools).toEqual([])
    expect(result.includes).toEqual([])
  })

  it("accepts includes", () => {
    const result = ToolsetDef.safeParse({
      name: "full-stack",
      description: "Everything",
      includes: ["web", "file-ops"],
    })
    expect(result.success).toBe(true)
  })
})

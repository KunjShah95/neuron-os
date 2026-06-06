import { describe, it, expect } from "bun:test"
import { BUNDLED_TOOLSETS } from "./bundled"
import { ToolsetDef } from "./types"

describe("Bundled toolsets", () => {
  it("exports an array of valid toolsets", () => {
    expect(Array.isArray(BUNDLED_TOOLSETS)).toBe(true)
    expect(BUNDLED_TOOLSETS.length).toBeGreaterThan(0)
  })

  it("every bundled toolset passes schema validation", () => {
    for (const ts of BUNDLED_TOOLSETS) {
      const result = ToolsetDef.safeParse(ts)
      expect(result.success).toBe(true)
    }
  })

  it("includes the 'all' alias", () => {
    const names = BUNDLED_TOOLSETS.map((t) => t.name)
    expect(names).toContain("all")
  })
})

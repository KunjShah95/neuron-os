import { describe, it, expect, beforeEach } from "bun:test"
import { ToolsetRegistry } from "./registry"

describe("ToolsetRegistry", () => {
  let registry: ToolsetRegistry

  beforeEach(() => {
    registry = new ToolsetRegistry()
    registry.register({ name: "web", description: "", tools: ["fetch"], includes: [] })
    registry.register({ name: "file-ops", description: "", tools: ["read", "write"], includes: [] })
    registry.register({ name: "research", description: "", tools: [], includes: ["web", "file-ops"] })
  })

  it("resolves a flat toolset", () => {
    const result = registry.resolveToolset("web")
    expect(result.tools).toEqual(["fetch"])
  })

  it("resolves a composed toolset (diamond dedup)", () => {
    registry.register({ name: "full-stack", description: "", tools: [], includes: ["research"] })
    const result = registry.resolveToolset("full-stack")
    expect(result.tools.sort()).toEqual(["fetch", "read", "write"])
  })

  it("throws on unknown toolset", () => {
    expect(() => registry.resolveToolset("nope")).toThrow("Unknown toolset")
  })

  it("throws on circular includes", () => {
    registry.register({ name: "a", description: "", tools: [], includes: ["b"] })
    registry.register({ name: "b", description: "", tools: [], includes: ["a"] })
    expect(() => registry.resolveToolset("a")).toThrow("Circular")
  })

  it("resolves the 'all' alias to every registered tool", () => {
    registry.register({ name: "all", description: "", tools: [], includes: [] })
    registry.register({ name: "shell", description: "", tools: ["bash"], includes: [] })
    const result = registry.resolveToolset("all")
    expect(result.tools).toContain("fetch")
    expect(result.tools).toContain("read")
    expect(result.tools).toContain("write")
    expect(result.tools).toContain("bash")
  })

  it("resolveMultipleToolsets merges unique tools", () => {
    const result = registry.resolveMultipleToolsets(["web", "file-ops"])
    expect(result.tools.sort()).toEqual(["fetch", "read", "write"])
  })

  it("lists all registered toolsets", () => {
    const names = registry.listToolsets().map((t) => t.name)
    expect(names).toContain("web")
    expect(names).toContain("research")
    expect(names).toContain("file-ops")
  })
})

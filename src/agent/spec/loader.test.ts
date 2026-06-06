import { describe, it, expect } from "bun:test"
import { loadSpecWithImports } from "./loader"

describe("loader", () => {
  it("loads and validates a spec file", () => {
    const spec = loadSpecWithImports("test/fixtures/specs/minimal.yaml")
    expect(spec.apiVersion).toBe("aegis/v1")
    expect(spec.metadata.name).toBe("minimal-test")
  })

  it("resolves from: imports with merge", () => {
    const spec = loadSpecWithImports("test/fixtures/specs/child.yaml")
    expect(spec.metadata.name).toBe("child-agent")
    // from parent
    expect(spec.spec.model.provider).toBe("anthropic")
    // overridden by child
    expect(spec.spec.model.name).toBe("claude-sonnet-4-20250514")
  })
})

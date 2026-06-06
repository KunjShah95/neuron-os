import { describe, it, expect } from "bun:test"
import { hashSpec, deriveSessionId } from "./hasher"
import { AgentSpec } from "./schema"

const SPEC = AgentSpec.parse({
  apiVersion: "aegis/v1",
  kind: "Agent",
  metadata: { name: "test" },
  spec: { type: "build", model: { provider: "openai", name: "gpt-4o" } },
})

describe("hasher", () => {
  it("produces deterministic hash", () => {
    const h1 = hashSpec(SPEC)
    const h2 = hashSpec(SPEC)
    expect(h1).toBe(h2)
  })

  it("different specs produce different hashes", () => {
    const spec2 = AgentSpec.parse({
      ...SPEC,
      metadata: { name: "test-2" },
      spec: { ...SPEC.spec, type: "plan" },
    })
    expect(hashSpec(SPEC)).not.toBe(hashSpec(spec2))
  })

  it("deriveSessionId is deterministic", () => {
    const hash = hashSpec(SPEC)
    const id1 = deriveSessionId(hash, "fix bug")
    const id2 = deriveSessionId(hash, "fix bug")
    expect(id1).toBe(id2)
  })

  it("different inputs produce different session IDs", () => {
    const hash = hashSpec(SPEC)
    expect(deriveSessionId(hash, "fix bug")).not.toBe(deriveSessionId(hash, "add feature"))
  })
})

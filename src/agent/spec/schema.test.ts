import { describe, it, expect } from "bun:test"
import { AgentSpec } from "./schema"

const MINIMAL_SPEC = {
  apiVersion: "aegis/v1" as const,
  kind: "Agent" as const,
  metadata: { name: "test-agent" },
  spec: {
    type: "build" as const,
    model: { provider: "anthropic", name: "claude-sonnet-4-20250514" },
  },
}

describe("AgentSpec schema", () => {
  it("validates a minimal spec", () => {
    const result = AgentSpec.safeParse(MINIMAL_SPEC)
    expect(result.success).toBe(true)
  })

  it("rejects wrong apiVersion", () => {
    const result = AgentSpec.safeParse({ ...MINIMAL_SPEC, apiVersion: "v2" })
    expect(result.success).toBe(false)
  })

  it("rejects invalid agent type", () => {
    const result = AgentSpec.safeParse({ ...MINIMAL_SPEC, spec: { ...MINIMAL_SPEC.spec, type: "invalid" } })
    expect(result.success).toBe(false)
  })

  it("fills defaults for optional fields", () => {
    const parsed = AgentSpec.parse(MINIMAL_SPEC)
    expect(parsed.spec.model.temperature).toBe(0)
    expect(parsed.spec.triggers).toEqual([{ type: "manual" }])
  })

  it("validates metadata name regex", () => {
    const result = AgentSpec.safeParse({
      ...MINIMAL_SPEC,
      metadata: { name: "Invalid Name!" },
    })
    expect(result.success).toBe(false)
  })

  it("validates full spec with all fields", () => {
    const result = AgentSpec.safeParse({
      ...MINIMAL_SPEC,
      metadata: {
        name: "full-agent",
        labels: { team: "core", tier: "2" },
        annotations: { description: "Full test" },
      },
      spec: {
        ...MINIMAL_SPEC.spec,
        system_prompt: { template: "You are {{type}}", append_skills: false },
        tools: { allow: ["read", "bash"], deny: ["delegate_task"], toolset: "full-stack" },
        context_files: ["src/**/*.ts"],
        skills: ["code-review"],
        memory: { namespace: "team-a", ttl_days: 30, recall_top_k: 5 },
        hooks: [{ event: "spawn", phase: "post", command: "echo hello" }],
        env: { DEBUG: "true" },
        budget: { usd: 0.5, tokens: 100000 },
        triggers: [{ type: "cron", schedule: "0 3 * * *" }],
      },
    })
    expect(result.success).toBe(true)
  })
})

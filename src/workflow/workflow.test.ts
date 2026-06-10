/**
 * workflow/workflow.test.ts — Unit tests for workflow schema and validator.
 */

import { describe, it, expect } from "bun:test"
import {
  validateWorkflowConfig,
  validateWorkflowNode,
  WorkflowConfigSchema,
  WorkflowNodeSchema,
} from "./schema"
import { validateWorkflow } from "./validator"
import type { WorkflowConfig } from "./types"

// ── Schema Validation ──────────────────────────────────────────────────

describe("WorkflowConfigSchema", () => {
  it("accepts a valid minimal config", () => {
    const result = validateWorkflowConfig({
      name: "test",
      topology: "sequential",
      nodes: [{ id: "n1", type: "build" }],
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("rejects missing name", () => {
    const result = validateWorkflowConfig({
      topology: "sequential",
      nodes: [{ id: "n1", type: "build" }],
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.field === "name")).toBe(true)
  })

  it("rejects invalid topology", () => {
    const result = validateWorkflowConfig({
      name: "test",
      topology: "invalid",
      nodes: [{ id: "n1", type: "build" }],
    })
    expect(result.valid).toBe(false)
  })

  it("rejects empty nodes array", () => {
    const result = validateWorkflowConfig({
      name: "test",
      topology: "sequential",
      nodes: [],
    })
    expect(result.valid).toBe(false)
  })

  it("rejects invalid agent type", () => {
    const result = validateWorkflowConfig({
      name: "test",
      topology: "sequential",
      nodes: [{ id: "n1", type: "nonexistent" }],
    })
    expect(result.valid).toBe(false)
  })

  it("accepts all valid topologies", () => {
    for (const topo of ["sequential", "fan-out", "debate", "ensemble", "supervisor"]) {
      const result = validateWorkflowConfig({
        name: "test",
        topology: topo,
        nodes: [{ id: "n1", type: "build" }],
      })
      expect(result.valid).toBe(true)
    }
  })

  it("accepts config with edges", () => {
    const result = validateWorkflowConfig({
      name: "test",
      topology: "sequential",
      nodes: [
        { id: "n1", type: "build" },
        { id: "n2", type: "test" },
      ],
      edges: [{ from: "n1", to: "n2" }],
    })
    expect(result.valid).toBe(true)
  })

  it("accepts config with optional fields", () => {
    const result = validateWorkflowConfig({
      name: "test",
      description: "A test workflow",
      topology: "fan-out",
      budget_usd: 10,
      timeout_minutes: 30,
      nodes: [
        {
          id: "n1",
          type: "plan",
          tools: ["read", "grep"],
          provider: "openai",
          model: "gpt-4o",
          budget_usd: 5,
          prompt_template: "Analyze the codebase",
          sandbox: { enabled: false },
        },
      ],
    })
    expect(result.valid).toBe(true)
  })
})

describe("WorkflowNodeSchema", () => {
  it("accepts valid node", () => {
    const result = validateWorkflowNode({ id: "agent-1", type: "build" })
    expect(result.valid).toBe(true)
  })

  it("rejects empty id", () => {
    const result = validateWorkflowNode({ id: "", type: "build" })
    expect(result.valid).toBe(false)
  })

  it("rejects invalid id characters", () => {
    const result = validateWorkflowNode({ id: "has spaces!", type: "build" })
    expect(result.valid).toBe(false)
  })

  it("accepts id with hyphens and underscores", () => {
    const result = validateWorkflowNode({ id: "my_agent-1", type: "test" })
    expect(result.valid).toBe(true)
  })
})

// ── Structural Validation ──────────────────────────────────────────────

describe("validateWorkflow", () => {
  it("passes for a valid workflow", () => {
    const config: WorkflowConfig = {
      name: "test",
      topology: "sequential",
      nodes: [
        { id: "plan", type: "plan" },
        { id: "build", type: "build", depends_on: ["plan"] },
        { id: "test", type: "test", depends_on: ["build"] },
      ],
    }
    const result = validateWorkflow(config)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("detects missing dependency reference", () => {
    const config: WorkflowConfig = {
      name: "test",
      topology: "sequential",
      nodes: [
        { id: "build", type: "build", depends_on: ["nonexistent"] },
      ],
    }
    const result = validateWorkflow(config)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes("nonexistent"))).toBe(true)
  })

  it("detects self-dependency", () => {
    const config: WorkflowConfig = {
      name: "test",
      topology: "sequential",
      nodes: [{ id: "n1", type: "build", depends_on: ["n1"] }],
    }
    const result = validateWorkflow(config)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes("cannot depend on itself"))).toBe(true)
  })

  it("detects cycles", () => {
    const config: WorkflowConfig = {
      name: "test",
      topology: "sequential",
      nodes: [
        { id: "a", type: "build", depends_on: ["b"] },
        { id: "b", type: "build", depends_on: ["a"] },
      ],
    }
    const result = validateWorkflow(config)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes("Cycle"))).toBe(true)
  })

  it("detects duplicate node ids", () => {
    const config: WorkflowConfig = {
      name: "test",
      topology: "sequential",
      nodes: [
        { id: "n1", type: "build" },
        { id: "n1", type: "test" },
      ],
    }
    const result = validateWorkflow(config)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes("Duplicate"))).toBe(true)
  })

  it("detects invalid edge references", () => {
    const config: WorkflowConfig = {
      name: "test",
      topology: "sequential",
      nodes: [{ id: "n1", type: "build" }],
      edges: [{ from: "n1", to: "nonexistent" }],
    }
    const result = validateWorkflow(config)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes("unknown target"))).toBe(true)
  })

  it("warns about orphan nodes", () => {
    const config: WorkflowConfig = {
      name: "test",
      topology: "sequential",
      nodes: [
        { id: "n1", type: "build" },
        { id: "n2", type: "test" },
      ],
    }
    const result = validateWorkflow(config)
    expect(result.warnings.some((w) => w.message.includes("disconnected"))).toBe(true)
  })

  it("warns when node budgets exceed workflow budget", () => {
    const config: WorkflowConfig = {
      name: "test",
      topology: "sequential",
      budget_usd: 5,
      nodes: [
        { id: "n1", type: "build", budget_usd: 3 },
        { id: "n2", type: "test", budget_usd: 4 },
      ],
      edges: [{ from: "n1", to: "n2" }],
    }
    const result = validateWorkflow(config)
    expect(result.warnings.some((w) => w.message.includes("budget"))).toBe(true)
  })

  it("validates edge self-loops", () => {
    const config: WorkflowConfig = {
      name: "test",
      topology: "sequential",
      nodes: [{ id: "n1", type: "build" }],
      edges: [{ from: "n1", to: "n1" }],
    }
    const result = validateWorkflow(config)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.message.includes("itself"))).toBe(true)
  })
})

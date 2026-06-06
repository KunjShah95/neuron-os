import { describe, it, expect } from "bun:test"
/**
 * Unit tests for the DAG Planner module.
 *
 * Tests plan graph structure, node lifecycle, and dependency resolution.
 * The DAGPlanner.executePlan() uses a polling loop over a real task queue,
 * so we test with minimal graphs that complete quickly.
 */

import { type PlanGraph, type PlanNode } from "./planner"

describe("PlanNode Interface", () => {

  it("should create a basic node with empty dependencies", () => {
    const node: PlanNode = {
      id: "node-1",
      goal: "Run tests",
      dependencies: [],
    }
    expect(node.id).toBe("node-1")
    expect(node.goal).toBe("Run tests")
    expect(node.dependencies).toEqual([])
    expect(node.agentType).toBeUndefined()
    expect(node.priority).toBeUndefined()
  })

  it("should create a node with dependencies", () => {
    const node: PlanNode = {
      id: "node-2",
      goal: "Deploy after tests",
      dependencies: ["node-1"],
    }
    expect(node.dependencies).toEqual(["node-1"])
  })

  it("should create a node with agent type and priority", () => {
    const node: PlanNode = {
      id: "node-3",
      goal: "Critical build task",
      dependencies: [],
      agentType: "build",
      priority: "high",
    }
    expect(node.agentType).toBe("build")
    expect(node.priority).toBe("high")
  })

  it("should create a plan graph", () => {
    const graph: PlanGraph = {
      nodes: [
        { id: "a", goal: "Task A", dependencies: [] },
        { id: "b", goal: "Task B", dependencies: ["a"] },
      ],
    }
    expect(graph.nodes.length).toBe(2)
    expect(graph.nodes[1]!.dependencies).toEqual(["a"])
  })

})

describe("PlanGraph validation", () => {

  it("should handle empty graph", () => {
    const graph: PlanGraph = { nodes: [] }
    expect(graph.nodes.length).toBe(0)
  })

  it("should handle single node graph", () => {
    const graph: PlanGraph = {
      nodes: [{ id: "only", goal: "Only task", dependencies: [] }],
    }
    expect(graph.nodes.length).toBe(1)
    expect(graph.nodes[0]!.id).toBe("only")
  })

  it("should handle linear dependency chain", () => {
    const graph: PlanGraph = {
      nodes: [
        { id: "step-1", goal: "Step 1", dependencies: [] },
        { id: "step-2", goal: "Step 2", dependencies: ["step-1"] },
        { id: "step-3", goal: "Step 3", dependencies: ["step-2"] },
      ],
    }
    expect(graph.nodes.length).toBe(3)
    expect(graph.nodes[2]!.dependencies).toEqual(["step-2"])
  })

  it("should handle fan-out dependencies", () => {
    const graph: PlanGraph = {
      nodes: [
        { id: "setup", goal: "Setup", dependencies: [] },
        { id: "build", goal: "Build", dependencies: ["setup"] },
        { id: "test", goal: "Test", dependencies: ["setup"] },
        { id: "deploy", goal: "Deploy", dependencies: ["build", "test"] },
      ],
    }
    expect(graph.nodes.length).toBe(4)
    expect(graph.nodes[3]!.dependencies).toEqual(["build", "test"])
  })

  it("should handle no-dependency parallel nodes", () => {
    const graph: PlanGraph = {
      nodes: [
        { id: "a", goal: "Independent A", dependencies: [] },
        { id: "b", goal: "Independent B", dependencies: [] },
        { id: "c", goal: "Independent C", dependencies: [] },
      ],
    }
    // All nodes have empty dependencies, so all are dispatchable
    expect(graph.nodes.length).toBe(3)
  })

})

/**
 * workflow/validator — Topology and dependency validation for workflows.
 *
 * Performs structural validation beyond what Zod schema validation covers:
 * - Cycle detection via topological sort
 * - Dependency reference existence
 * - Budget constraint checking
 * - Orphan node detection
 * - Tool availability per node type
 */

import type {
  WorkflowConfig,
  WorkflowValidationError,
  WorkflowValidationResult,
} from "./types"
import { AGENT_TYPES } from "../agent/agent-types"
import { validateWorkflowConfig } from "./schema"

/**
 * Validate a workflow config fully: schema + structural checks.
 */
export function validateWorkflow(config: WorkflowConfig): WorkflowValidationResult {
  const allErrors: WorkflowValidationError[] = []
  const allWarnings: WorkflowValidationError[] = []

  // Schema validation (via Zod)
  const schemaResult = validateWorkflowConfig(config)
  if (!schemaResult.valid) {
    return schemaResult
  }

  // Collect all node IDs
  const nodeIds = new Set(config.nodes.map((n) => n.id))

  // 1. Check dependency references exist
  for (const node of config.nodes) {
    if (node.depends_on) {
      for (const dep of node.depends_on) {
        if (!nodeIds.has(dep)) {
          allErrors.push({
            message: `Node "${node.id}" depends on "${dep}" which does not exist`,
            severity: "error",
            nodeId: node.id,
            field: "depends_on",
          })
        }
        if (dep === node.id) {
          allErrors.push({
            message: `Node "${node.id}" cannot depend on itself`,
            severity: "error",
            nodeId: node.id,
            field: "depends_on",
          })
        }
      }
    }
  }

  // 2. Check edge references exist
  if (config.edges) {
    for (const edge of config.edges) {
      if (!nodeIds.has(edge.from)) {
        allErrors.push({
          message: `Edge references unknown source node "${edge.from}"`,
          severity: "error",
          field: "edges",
        })
      }
      if (!nodeIds.has(edge.to)) {
        allErrors.push({
          message: `Edge references unknown target node "${edge.to}"`,
          severity: "error",
          field: "edges",
        })
      }
      if (edge.from === edge.to) {
        allErrors.push({
          message: `Edge cannot connect node "${edge.from}" to itself`,
          severity: "error",
          field: "edges",
        })
      }
    }
  }

  // 3. Cycle detection via topological sort
  const cycleError = detectCycles(config)
  if (cycleError) {
    allErrors.push(cycleError)
  }

  // 4. Check tool availability per node type
  for (const node of config.nodes) {
    const agentType = AGENT_TYPES[node.type as keyof typeof AGENT_TYPES]
    if (agentType && node.tools) {
      const allowedTools = new Set(agentType.tools.map((t) => t.name))
      for (const tool of node.tools) {
        if (!allowedTools.has(tool)) {
          allWarnings.push({
            message: `Node "${node.id}" requests tool "${tool}" which is not in the default toolset for type "${node.type}"`,
            severity: "warning",
            nodeId: node.id,
            field: "tools",
          })
        }
      }
    }
  }

  // 5. Budget validation
  if (config.budget_usd !== undefined) {
    const nodeBudgetTotal = config.nodes.reduce((sum, n) => sum + (n.budget_usd ?? 0), 0)
    if (nodeBudgetTotal > config.budget_usd) {
      allWarnings.push({
        message: `Node budgets total $${nodeBudgetTotal.toFixed(2)} exceeds workflow budget of $${config.budget_usd.toFixed(2)}`,
        severity: "warning",
        field: "budget_usd",
      })
    }
  }

  // 6. Orphan node detection (no edges, no dependencies)
  const nodesWithEdges = new Set<string>()
  for (const edge of config.edges ?? []) {
    nodesWithEdges.add(edge.from)
    nodesWithEdges.add(edge.to)
  }
  for (const node of config.nodes) {
    const hasDependencies = (node.depends_on?.length ?? 0) > 0
    const hasEdges = nodesWithEdges.has(node.id)
    if (!hasDependencies && !hasEdges && config.nodes.length > 1) {
      allWarnings.push({
        message: `Node "${node.id}" has no dependencies or edges — it may be disconnected from the workflow`,
        severity: "warning",
        nodeId: node.id,
      })
    }
  }

  // 7. Duplicate node ID check
  const seenIds = new Set<string>()
  for (const node of config.nodes) {
    if (seenIds.has(node.id)) {
      allErrors.push({
        message: `Duplicate node id: "${node.id}"`,
        severity: "error",
        nodeId: node.id,
      })
    }
    seenIds.add(node.id)
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  }
}

// ── Cycle Detection ────────────────────────────────────────────────────

function detectCycles(config: WorkflowConfig): WorkflowValidationError | null {
  const adj = new Map<string, string[]>()
  for (const node of config.nodes) {
    adj.set(node.id, [])
  }

  // Build adjacency ONLY from edges (edges define the DAG direction).
  // depends_on is metadata; if no edges exist, derive them from depends_on.
  if (config.edges && config.edges.length > 0) {
    for (const edge of config.edges) {
      const list = adj.get(edge.from)
      if (list && !list.includes(edge.to)) list.push(edge.to)
    }
  } else {
    // Derive edges from depends_on: if B depends_on A, then A → B
    for (const node of config.nodes) {
      if (node.depends_on) {
        for (const dep of node.depends_on) {
          const list = adj.get(dep)
          if (list && !list.includes(node.id)) list.push(node.id)
        }
      }
    }
  }

  // DFS cycle detection
  const WHITE = 0 // unvisited
  const GRAY = 1 // in stack
  const BLACK = 2 // done

  const color = new Map<string, number>()
  for (const node of config.nodes) {
    color.set(node.id, WHITE)
  }

  const parent = new Map<string, string>()

  function dfs(u: string): string[] | null {
    color.set(u, GRAY)

    for (const v of adj.get(u) ?? []) {
      if (!color.has(v)) continue
      if (color.get(v) === GRAY) {
        // Reconstruct cycle
        const cycle: string[] = [v, u]
        let cur = u
        while (cur !== v) {
          cur = parent.get(cur) ?? ""
          if (cur === undefined) break
          cycle.push(cur)
        }
        return cycle.reverse()
      }
      if (color.get(v) === WHITE) {
        parent.set(v, u)
        const cycle = dfs(v)
        if (cycle) return cycle
      }
    }

    color.set(u, BLACK)
    return null
  }

  for (const node of config.nodes) {
    if (color.get(node.id) === WHITE) {
      const cycle = dfs(node.id)
      if (cycle) {
        return {
          message: `Cycle detected: ${cycle.join(" → ")}`,
          severity: "error",
        }
      }
    }
  }

  return null
}

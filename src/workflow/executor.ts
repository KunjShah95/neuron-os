/**
 * workflow/executor — Execute workflow YAML files.
 *
 * Parses a workflow YAML, builds an execution DAG from nodes and edges,
 * resolves dependency order via topological sort, then executes nodes
 * through the mesh orchestrator.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse as parseYaml } from "yaml"
import { createLogger } from "../cli/logger"
import type {
  WorkflowConfig,
  WorkflowNode,
  WorkflowNodeResult,
  WorkflowRunResult,
} from "./types"
import { validateWorkflow } from "./validator"
import { MeshOrchestrator } from "../mesh/orchestrator"
import type { MeshConfig, MeshAgent } from "../mesh/types"
import type { AgentTypeName } from "../agent/agent-types"

const log = createLogger("workflow:executor")

// ── Parse ──────────────────────────────────────────────────────────────

export function parseWorkflowFile(filePath: string): WorkflowConfig {
  const resolved = resolve(filePath)
  const raw = readFileSync(resolved, "utf-8")
  const config = parseYaml(raw) as WorkflowConfig

  if (!config.name) throw new Error("Workflow missing 'name' field")
  if (!config.topology) throw new Error("Workflow missing 'topology' field")
  if (!config.nodes || !Array.isArray(config.nodes) || config.nodes.length === 0) {
    throw new Error("Workflow must have at least one node")
  }

  return config
}

// ── Build Execution Order ──────────────────────────────────────────────

export function buildExecutionOrder(config: WorkflowConfig): WorkflowNode[] {
  const inDegree = new Map<string, number>()
  const adj = new Map<string, string[]>()

  for (const node of config.nodes) {
    inDegree.set(node.id, 0)
    adj.set(node.id, [])
  }

  for (const edge of config.edges ?? []) {
    adj.get(edge.from)?.push(edge.to)
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
  }

  for (const node of config.nodes) {
    if (node.depends_on) {
      for (const dep of node.depends_on) {
        if (!adj.get(dep)?.includes(node.id)) {
          adj.get(dep)?.push(node.id)
          inDegree.set(node.id, (inDegree.get(node.id) ?? 0) + 1)
        }
      }
    }
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const order: WorkflowNode[] = []
  const nodeMap = new Map(config.nodes.map((n) => [n.id, n]))

  while (queue.length > 0) {
    const id = queue.shift() ?? ""
    const node = nodeMap.get(id)
    if (node) order.push(node)

    for (const neighbor of adj.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  if (order.length !== config.nodes.length) {
    throw new Error("Workflow contains a cycle — cannot determine execution order")
  }

  return order
}

// ── Map to Mesh ────────────────────────────────────────────────────────

function nodeToMeshAgent(node: WorkflowNode): MeshAgent {
  return {
    id: node.id,
    role: mapTypeToRole(node.type),
    goal: node.prompt_template ?? `${node.type} agent for task: ${node.id}`,
    model: node.model,
    provider: node.provider,
    dependsOn: node.depends_on ?? [],
    timeout: node.sandbox?.enabled ? 600000 : 300000,
  }
}

function mapTypeToRole(type: AgentTypeName): MeshAgent["role"] {
  const mapping: Record<AgentTypeName, MeshAgent["role"]> = {
    build: "implementer",
    plan: "architect",
    read: "researcher",
    write: "implementer",
    test: "tester",
    validate: "reviewer",
    review: "reviewer",
    debug: "debugger",
    document: "implementer",
    refactor: "implementer",
    deploy: "implementer",
    monitor: "tester",
    explore: "researcher",
    adversarial: "reviewer",
  }
  return mapping[type] ?? "implementer"
}

function buildMeshConfig(config: WorkflowConfig, orderedNodes: WorkflowNode[]): MeshConfig {
  const agents = orderedNodes.map(nodeToMeshAgent)

  switch (config.topology) {
    case "sequential":
      return { topology: "sequential", agents }
    case "fan-out":
      return {
        topology: "fan-out",
        coordinator: agents[0] as MeshAgent,
        workers: agents.slice(1),
        strategy: "all",
      }
    case "debate":
      return {
        topology: "debate",
        question: config.nodes[0]?.prompt_template ?? config.name,
        debaters: agents,
        rounds: 2,
        synthesis: "vote",
      }
    case "ensemble":
      return {
        topology: "ensemble",
        task: config.nodes[0]?.prompt_template ?? config.name,
        runs: agents.map((a, i) => ({
          agent: a,
          model: a.model ?? (i % 2 === 0 ? "gpt-4o" : "claude-3-5-sonnet-latest"),
        })),
        aggregation: "vote",
      }
    case "supervisor":
      return {
        topology: "supervisor",
        supervisor: agents[0] as MeshAgent,
        subAgents: agents.slice(1),
        reviewRequired: true,
      }
    default:
      return { topology: "sequential", agents }
  }
}

// ── Execute ────────────────────────────────────────────────────────────

export async function executeWorkflow(config: WorkflowConfig): Promise<WorkflowRunResult> {
  const startedAt = new Date().toISOString()
  const nodeResults: WorkflowNodeResult[] = []
  log.info("Workflow execution started", { name: config.name, topology: config.topology })

  const validation = validateWorkflow(config)
  if (!validation.valid) {
    const msgs = validation.errors.map((e) => e.message).join("; ")
    throw new Error(`Workflow validation failed: ${msgs}`)
  }

  const orderedNodes = buildExecutionOrder(config)
  const meshConfig = buildMeshConfig(config, orderedNodes)
  const orchestrator = new MeshOrchestrator()

  try {
    const meshResult = await orchestrator.run(meshConfig)

    for (const node of orderedNodes) {
      const meshAgentResult = meshResult.agentResults.find((r) => r.agentId === node.id)
      nodeResults.push({
        nodeId: node.id,
        status: meshAgentResult?.outcome === "success" ? "completed" : "failed",
        output: meshAgentResult?.output,
        error: meshAgentResult?.error,
        durationMs: meshAgentResult?.durationMs ?? 0,
      })
    }

    const completedAt = new Date().toISOString()
    const totalDurationMs = nodeResults.reduce((s, r) => s + r.durationMs, 0)
    const successful = nodeResults.filter((r) => r.status === "completed").length

    const result: WorkflowRunResult = {
      workflowName: config.name,
      status: meshResult.overallOutcome === "success" ? "completed" : "failed",
      startedAt,
      completedAt,
      totalDurationMs,
      nodeResults,
      summary: `${successful}/${nodeResults.length} nodes succeeded (${config.topology})`,
    }

    log.info("Workflow execution completed", {
      name: config.name,
      outcome: result.status,
      nodes: nodeResults.length,
    })

    return result
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.error("Workflow execution failed", { name: config.name, error: errorMsg })

    return {
      workflowName: config.name,
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      totalDurationMs: 0,
      nodeResults,
      summary: `Workflow failed: ${errorMsg}`,
    }
  }
}

export async function executeWorkflowFile(filePath: string): Promise<WorkflowRunResult> {
  const config = parseWorkflowFile(filePath)
  return executeWorkflow(config)
}

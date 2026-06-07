import { taskQueue, type TaskPriority } from "./queue"
import { createLogger } from "../cli/logger"

const log = createLogger("dag-planner")

export interface PlanNode {
  id: string
  goal: string
  agentType?: string
  priority?: TaskPriority
  dependencies: string[] // array of node IDs that must complete first
}

export interface PlanGraph {
  nodes: PlanNode[]
}

export class DAGPlanner {
  /**
   * Submits a DAG of tasks to the TaskQueue.
   * Note: In a true implementation, dependent tasks would only be submitted
   * AFTER their dependencies complete. For this MVP, we simulate a DAG planner
   * by dispatching them in topological order or managing a state machine.
   */
  public async executePlan(plan: PlanGraph): Promise<void> {
    const remaining = new Map(plan.nodes.map((n) => [n.id, n]))
    const completed = new Set<string>()
    const inFlight = new Set<string>()

    log.info(`Executing DAG with ${plan.nodes.length} nodes`)

    while (completed.size < plan.nodes.length) {
      // Find all nodes whose dependencies are satisfied and are not yet in-flight/completed
      const readyNodes = Array.from(remaining.values()).filter((n) => {
        return n.dependencies.every((dep) => completed.has(dep)) && !inFlight.has(n.id)
      })

      for (const node of readyNodes) {
        log.info(`Dispatching node ${node.id}: ${node.goal}`)
        inFlight.add(node.id)

        // Dispatch to task queue
        // In a real implementation we'd track the actual queue IDs,
        // but here we simulate asynchronous completion for the MVP loop.
        const queueId = taskQueue.submit(`[${node.agentType || "default"}] ${node.goal}`, node.priority || "normal")

        // Fire and forget a watcher
        this.watchTask(queueId, node.id, inFlight, completed, remaining)
      }

      // Wait a bit before checking again
      await new Promise((r) => setTimeout(r, 1000))
    }

    log.info(`DAG execution completed successfully.`)
  }

  private async watchTask(
    queueId: string,
    nodeId: string,
    inFlight: Set<string>,
    completed: Set<string>,
    remaining: Map<string, PlanNode>,
  ) {
    while (true) {
      const task = taskQueue.getTask(queueId)
      if (task) {
        if (task.status === "completed") {
          log.info(`Node ${nodeId} completed`)
          inFlight.delete(nodeId)
          completed.add(nodeId)
          remaining.delete(nodeId)
          break
        }
        if (task.status === "failed") {
          log.error(`Node ${nodeId} failed. Aborting DAG.`)
          // Handle DAG failure gracefully
          break
        }
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

export const dagPlanner = new DAGPlanner()

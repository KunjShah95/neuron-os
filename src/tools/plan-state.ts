import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import type { Tool, ToolResult } from "./registry"

export interface PlanItem {
  id: number
  description: string
  status: "pending" | "in_progress" | "done" | "failed"
  note: string
}

export interface PlanState {
  goal: string
  items: PlanItem[]
  updatedAt: number
}

const AGENT_STATE_DIR = ".agent"

function getStatePath(cwd: string): string {
  return resolve(cwd, AGENT_STATE_DIR, "state.json")
}

function ensureDir(path: string): void {
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

function loadPlan(cwd: string): PlanState | null {
  const statePath = getStatePath(cwd)
  if (!existsSync(statePath)) return null
  try {
    return JSON.parse(readFileSync(statePath, "utf-8"))
  } catch {
    return null
  }
}

function savePlan(cwd: string, plan: PlanState): void {
  const statePath = getStatePath(cwd)
  ensureDir(statePath)
  plan.updatedAt = Date.now()
  writeFileSync(statePath, JSON.stringify(plan, null, 2), "utf-8")
}

export const planStateTool: Tool = {
  name: "plan_state",
  description: `Read or update the current plan state.

The plan is a structured TodoWrite-style list that YOU rewrite each turn.
Call this tool at the start of every turn to show your progress.

Operations:
- "get" — return the current plan (or empty if none)
- "update" — REPLACE the entire plan with a new set of items (rewrite whole, never mutate incrementally)

When updating, provide the full list of items with current statuses.
Status values: "pending" | "in_progress" | "done" | "failed"
Use the "note" field to capture key decisions, blockers, or observations.`,
  parameters: [
    {
      name: "operation",
      type: "string",
      description: '"get" to read plan, "update" to replace entire plan',
      required: true,
    },
    {
      name: "goal",
      type: "string",
      description: "The overall goal (required for update)",
    },
    {
      name: "items",
      type: "string",
      description: 'JSON array of plan items for update: [{"id":1,"description":"...","status":"pending","note":""}]',
    },
  ],
  async execute(params, ctx): Promise<ToolResult> {
    const operation = params.operation as string

    if (operation === "get") {
      const plan = loadPlan(ctx.cwd)
      if (!plan) {
        return {
          success: true,
          output: "No plan set. Call plan_state with operation='update' to create one.",
        }
      }
      const lines = [`GOAL: ${plan.goal}`, ""]
      for (const item of plan.items) {
        const mark = { pending: " ", in_progress: ">", done: "x", failed: "!" }[item.status]
        lines.push(`  [${mark}] ${item.id}. ${item.description}`)
        if (item.note) lines.push(`       note: ${item.note}`)
      }
      return {
        success: true,
        output: lines.join("\n"),
        metadata: { itemCount: plan.items.length, ...plan },
      }
    }

    if (operation === "update") {
      const goal = params.goal as string
      let items: PlanItem[]

      try {
        items = JSON.parse(params.items as string) as PlanItem[]
      } catch {
        return {
          success: false,
          output: "",
          error: "Invalid JSON for items parameter",
        }
      }

      if (!goal) {
        return {
          success: false,
          output: "",
          error: "goal is required for update operation",
        }
      }

      const plan: PlanState = { goal, items, updatedAt: Date.now() }
      savePlan(ctx.cwd, plan)

      const doneCount = items.filter((i) => i.status === "done").length
      const failedCount = items.filter((i) => i.status === "failed").length
      const pendingCount = items.filter((i) => i.status === "pending" || i.status === "in_progress").length

      return {
        success: true,
        output: `Plan updated: ${items.length} items total (${doneCount} done, ${failedCount} failed, ${pendingCount} remaining)`,
        metadata: { itemCount: items.length, doneCount, failedCount, pendingCount },
      }
    }

    return {
      success: false,
      output: "",
      error: `Unknown operation: ${operation}. Use "get" or "update".`,
    }
  },
}

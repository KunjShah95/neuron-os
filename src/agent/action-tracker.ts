/**
 * ActionTracker — tracks staged file mutations with approve/reject lifecycle.
 *
 * Each action starts as "pending" and transitions to "approved", "rejected",
 * or "executed" status.
 */

export type ActionType =
  | "file_create"
  | "file_modify"
  | "file_delete"
  | "folder_create"
  | "code_analysis"
  | "tool_execute"

export type ActionStatus = "pending" | "approved" | "rejected" | "executed"

export interface ActionLog {
  id: string
  type: ActionType
  path: string
  details: {
    before?: string
    after?: string
    command?: string
    toolName?: string
  }
  status: ActionStatus
  timestamp: Date
  error?: string
}

export class ActionTracker {
  private actions: ActionLog[] = []
  private nextId = 1

  /** Log a new action. Returns the action id. */
  log(entry: Omit<ActionLog, "id" | "timestamp" | "status">): string {
    const id = `action-${this.nextId++}-${Date.now()}`
    this.actions.push({
      ...entry,
      id,
      status: entry.type === "code_analysis" ? "executed" : "pending",
      timestamp: new Date(),
    })
    return id
  }

  /** Get all actions in order. */
  getActions(): ActionLog[] {
    return [...this.actions]
  }

  /** Get actions that are still pending (not approved/rejected/executed). */
  getPendingMutations(): ActionLog[] {
    return this.actions.filter((a) => a.status === "pending" && a.type !== "code_analysis")
  }

  /** Get actions that have been approved. */
  getApprovedActions(): ActionLog[] {
    return this.actions.filter((a) => a.status === "approved")
  }

  /** Approve a specific action by id. */
  approve(id: string): boolean {
    const action = this.actions.find((a) => a.id === id)
    if (!action || action.status !== "pending") return false
    action.status = "approved"
    return true
  }

  /** Approve all pending mutations at once. */
  approveAll(): number {
    let count = 0
    for (const a of this.actions) {
      if (a.status === "pending" && a.type !== "code_analysis") {
        a.status = "approved"
        count++
      }
    }
    return count
  }

  /** Reject a specific action by id. */
  reject(id: string): boolean {
    const action = this.actions.find((a) => a.id === id)
    if (!action || action.status !== "pending") return false
    action.status = "rejected"
    return true
  }

  /** Reject all pending mutations. */
  rejectAll(): number {
    let count = 0
    for (const a of this.actions) {
      if (a.status === "pending" && a.type !== "code_analysis") {
        a.status = "rejected"
        count++
      }
    }
    return count
  }

  /** Mark all approved actions as executed (after apply). */
  markExecuted(): number {
    let count = 0
    for (const a of this.actions) {
      if (a.status === "approved") {
        a.status = "executed"
        count++
      }
    }
    return count
  }

  /** Get a summary of pending actions grouped by type. */
  getSummary(): string {
    const pending = this.getPendingMutations()
    if (pending.length === 0) return "No pending changes."

    const grouped: Record<string, ActionLog[]> = {}
    for (const a of pending) {
      const key = a.type
      if (!grouped[key]) grouped[key] = []
      grouped[key]?.push(a)
    }

    const lines: string[] = ["Pending changes:"]
    for (const [type, items] of Object.entries(grouped)) {
      const label = type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
      lines.push(`  ${label}: ${items.length}`)
      for (const item of items) {
        if (item.type === "tool_execute") {
          lines.push(`    🖥 ${item.details.command}`)
        } else if (item.path) {
          lines.push(`    📄 ${item.path}`)
        }
      }
    }
    return lines.join("\n")
  }

  /** Clear all actions. */
  clear(): void {
    this.actions = []
  }
}

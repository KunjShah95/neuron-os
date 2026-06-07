/**
 * approval — CLI approval flow for reviewing and approving/rejecting staged changes.
 *
 * Uses @clack/prompts for interactive approval in CLI mode.
 */

import * as p from "@clack/prompts"
import { ActionTracker, type ActionLog } from "./action-tracker"
import { renderActionSummary, formatPatch, composeBeforeAfter } from "./diff-view"
import type { AgentToolExecutor } from "./agent-tools"

/**
 * Prompt the user to approve or reject pending changes.
 * Returns true if all changes were approved, false if rejected.
 */
export async function promptApproval(tracker: ActionTracker): Promise<boolean> {
  const pending = tracker.getPendingMutations()
  if (pending.length === 0) {
    p.note("No pending changes to review.")
    return true
  }

  p.note(renderActionSummary(pending), `📋 ${pending.length} Change(s) Staged`)

  const action = await p.select({
    message: "How would you like to proceed?",
    options: [
      { value: "diff", label: "📄 Show full diff" },
      { value: "approve", label: "✅ Approve all" },
      { value: "reject", label: "❌ Reject all" },
    ],
  })

  if (p.isCancel(action)) return false

  if (action === "diff") {
    const groups = groupByFile(pending)
    for (const [filePath, actions] of groups) {
      const sorted = [...actions].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      const { before, after } = composeBeforeAfter(sorted)
      const diff = formatPatch(filePath, before, after)
      console.log(`\n${diff}\n`)
    }

    const shellActions = pending.filter((a) => a.type === "tool_execute")
    for (const sa of shellActions) {
      console.log(`\n  🖥  Shell: ${sa.details.command}\n`)
    }

    const followup = await p.select({
      message: "Review the diff above. What now?",
      options: [
        { value: "approve", label: "✅ Approve all" },
        { value: "reject", label: "❌ Reject all" },
      ],
    })

    if (p.isCancel(followup)) return false
    if (followup === "approve") {
      tracker.approveAll()
      return true
    }
    tracker.rejectAll()
    return false
  }

  if (action === "approve") {
    tracker.approveAll()
    return true
  }

  tracker.rejectAll()
  return false
}

/**
 * Apply approved changes and report results.
 */
export async function applyAndReport(tracker: ActionTracker, executor: AgentToolExecutor): Promise<void> {
  const approved = tracker.getApprovedActions()
  if (approved.length === 0) {
    p.outro("No changes to apply.")
    return
  }

  const s = p.spinner()
  s.start("Applying changes...")

  const { errors } = executor.applyApproved()

  if (errors.length > 0) {
    s.stop("Applied with errors")
    for (const err of errors) {
      console.error(`  ✗ ${err}`)
    }
  } else {
    s.stop("Changes applied successfully")
  }
}

/** Alias for promptApproval — used by plan orchestrator */
export const runApprovalFlow = promptApproval

function groupByFile(actions: ActionLog[]): Map<string, ActionLog[]> {
  const groups = new Map<string, ActionLog[]>()
  for (const a of actions) {
    if (a.type === "tool_execute") continue
    const list = groups.get(a.path) ?? []
    list.push(a)
    groups.set(a.path, list)
  }
  return groups
}

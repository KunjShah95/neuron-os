/**
 * diff-view — generates readable file diffs from before/after content.
 * Uses the `diff` library for proper unified diffs.
 * Ported from chaicodeclaw-build.
 */

import { createTwoFilesPatch } from "diff"
import type { ActionLog } from "./action-tracker"

/**
 * Format a unified diff patch for a single file.
 */
export function formatPatch(
  filePath: string,
  before: string,
  after: string,
): string {
  return createTwoFilesPatch(filePath, filePath, before, after, "", "", {
    context: 3,
  })
}

/**
 * Compose a "before" and "after" snapshot from a sorted list of actions
 * that affect the same file. The first action's "before" becomes the base,
 * and the last action's "after" becomes the final content.
 * For delete actions, after is empty.
 */
export function composeBeforeAfter(sorted: ActionLog[]): {
  before: string
  after: string
} {
  const sortedCopy = [...sorted].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )
  const first = sortedCopy[0]!
  const last = sortedCopy[sortedCopy.length - 1]!

  if (last.type === "file_delete") {
    return { before: last.details.before ?? "", after: "" }
  }

  const before = first.type === "file_create" ? "" : (first.details.before ?? "")
  const after = last.details.after ?? ""
  return { before, after }
}

/**
 * Render a human-friendly summary of a set of actions grouped by file.
 */
export function renderActionSummary(actions: ActionLog[]): string {
  const files = new Map<string, ActionLog[]>()
  const shells: ActionLog[] = []

  for (const a of actions) {
    if (a.type === "tool_execute") {
      shells.push(a)
    } else {
      const list = files.get(a.path) ?? []
      list.push(a)
      files.set(a.path, list)
    }
  }

  const lines: string[] = []
  for (const [path, fileActions] of files) {
    const types = [...new Set(fileActions.map((a) => a.type.replace(/_/g, " ")))]
    lines.push(`  📄 ${path}  (${types.join(", ")})`)
  }

  for (const s of shells) {
    lines.push(`  🖥  ${s.details.command}`)
  }

  return lines.join("\n")
}

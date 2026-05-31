/**
 * diff-view — generates readable file diffs from before/after content.
 */

import type { ActionLog } from "./action-tracker"

const MAX_LINES = 80

interface Hunk {
  oldStart: number
  oldLines: string[]
  newStart: number
  newLines: string[]
}

/**
 * Compute a simple line-by-line diff and return a unified-diff-like string.
 */
export function computeDiff(before: string, after: string): string {
  const beforeLines = before.split("\n")
  const afterLines = after.split("\n")
  const oldMap = new Map<string, number[]>()
  const hunks: Hunk[] = []

  // Build index of before lines for simple matching
  for (let i = 0; i < beforeLines.length; i++) {
    const line = beforeLines[i]!
    const idx = oldMap.get(line) ?? []
    idx.push(i)
    oldMap.set(line, idx)
  }

  const added: string[] = []
  const removed: string[] = []
  let oldIdx = 0
  let newIdx = 0

  while (oldIdx < beforeLines.length || newIdx < afterLines.length) {
    if (oldIdx < beforeLines.length && newIdx < afterLines.length && beforeLines[oldIdx] === afterLines[newIdx]) {
      if (removed.length > 0 || added.length > 0) {
        hunks.push({
          oldStart: oldIdx - removed.length + 1,
          oldLines: removed,
          newStart: newIdx - added.length + 1,
          newLines: added,
        })
        removed.length = 0
        added.length = 0
      }
      oldIdx++
      newIdx++
    } else if (newIdx < afterLines.length && (oldIdx >= beforeLines.length || !beforeLines.includes(afterLines[newIdx]!))) {
      added.push(afterLines[newIdx]!)
      newIdx++
    } else if (oldIdx < beforeLines.length) {
      removed.push(beforeLines[oldIdx]!)
      oldIdx++
    }
  }

  if (removed.length > 0 || added.length > 0) {
    hunks.push({
      oldStart: oldIdx - removed.length + 1,
      oldLines: removed,
      newStart: newIdx - added.length + 1,
      newLines: added,
    })
  }

  if (hunks.length === 0) return "(no changes)"

  const parts: string[] = []
  for (const hunk of hunks) {
    parts.push(
      `@@ -${hunk.oldStart},${hunk.oldLines.length} +${hunk.newStart},${hunk.newLines.length} @@`,
    )
    for (const line of hunk.oldLines) {
      parts.push(`-${line}`)
    }
    for (const line of hunk.newLines) {
      parts.push(`+${line}`)
    }
    if (parts.length > MAX_LINES) {
      parts.push(`… (diff truncated, ${parts.length - MAX_LINES} more lines)`)
      break
    }
  }

  return parts.join("\n")
}

/**
 * Compose a "before" and "after" snapshot from a sorted list of actions
 * that affect the same file. The first action's "before" becomes the base,
 * and the last action's "after" becomes the final content.
 */
export function composeBeforeAfter(actions: ActionLog[]): {
  before: string
  after: string
} {
  const sorted = [...actions].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
  )

  // Find the first action that has a "before" snapshot
  let before = ""
  for (const a of sorted) {
    if (a.details.before !== undefined) {
      before = a.details.before
      break
    }
  }

  // Find the last action that has an "after" snapshot
  let after = ""
  for (const a of sorted.reverse()) {
    if (a.details.after !== undefined) {
      after = a.details.after
      break
    }
  }

  return { before, after }
}

/**
 * Format a unified diff header for a file.
 */
export function formatPatch(
  filePath: string,
  before: string,
  after: string,
): string {
  const header = `--- a/${filePath}\n+++ b/${filePath}`
  const body = computeDiff(before, after)
  return `${header}\n${body}`
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

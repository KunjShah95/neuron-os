/**
 * Command history recording.
 *
 * Writes to ~/.aegis/command-history.json for the /history Telegram command
 * and the `ask` command's context retrieval.
 *
 * Uses process.on("exit") to ensure history is flushed regardless of how
 * the process exits (normal return, process.exit(), or signal handler).
 * This solves the problem where the finally block in index.ts is skipped
 * when adapter commands call process.exit() in their SIGINT handlers.
 */

import { join } from "node:path"
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"

interface HistoryEntry {
  command: string
  timestamp: string
  args?: string
}

let pendingEntry: HistoryEntry | null = null
let flushed = false

export function setPendingCommand(entry: HistoryEntry): void {
  pendingEntry = entry
  flushed = false
}

export function flushHistorySync(): void {
  if (flushed || !pendingEntry) return
  flushed = true

  try {
    const historyDir = join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis")
    const historyFile = join(historyDir, "command-history.json")
    mkdirSync(historyDir, { recursive: true })

    let history: HistoryEntry[] = []
    if (existsSync(historyFile)) {
      try {
        history = JSON.parse(readFileSync(historyFile, "utf-8"))
      } catch {
        history = []
      }
    }

    history.push(pendingEntry)

    if (history.length > 100) history = history.slice(-100)
    writeFileSync(historyFile, JSON.stringify(history, null, 2), "utf-8")
  } catch {
    // Best-effort
  }
}

process.on("exit", () => {
  flushHistorySync()
})

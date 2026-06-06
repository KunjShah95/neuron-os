/**
 * src/training/recorder.ts
 *
 * TrajectoryRecorder — subscribes to agent lifecycle hooks and writes
 * every turn to ~/.aegis/trajectories/<session_id>.jsonl.
 * Never blocks the agent loop (best-effort writes).
 */

import { createLogger } from "../cli/logger"
import { existsSync, mkdirSync, appendFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const log = createLogger("training:recorder")

// ── Trajectory event types (Zod-like discriminated union, plain TS) ────

export interface SessionStartEvent {
  type: "session_start"
  ts: number
  session_id: string
  agent_type: string
  goal: string
}

export interface UserTurnEvent {
  type: "user_turn"
  ts: number
  session_id: string
  content: string
}

export interface AssistantTurnEvent {
  type: "assistant_turn"
  ts: number
  session_id: string
  content: string
  reasoning?: string
}

export interface ToolCallEvent {
  type: "tool_call"
  ts: number
  session_id: string
  tool: string
  args: unknown
}

export interface ToolResultEvent {
  type: "tool_result"
  ts: number
  session_id: string
  tool: string
  result: unknown
  duration_ms: number
}

export interface CostRecordEvent {
  type: "cost_record"
  ts: number
  session_id: string
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  model: string
}

export interface SessionEndEvent {
  type: "session_end"
  ts: number
  session_id: string
  outcome: "success" | "failure" | "abandoned"
  reason?: string
}

export type TrajectoryEvent =
  | SessionStartEvent
  | UserTurnEvent
  | AssistantTurnEvent
  | ToolCallEvent
  | ToolResultEvent
  | CostRecordEvent
  | SessionEndEvent

// ── Recorder ──────────────────────────────────────────────────────────

export class TrajectoryRecorder {
  private baseDir: string
  private activeFiles = new Map<string, string>() // session_id → file path

  constructor(baseDir?: string) {
    this.baseDir =
      baseDir ??
      resolve(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "trajectories")
    this.ensureDir()
  }

  private ensureDir(): void {
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true })
    }
  }

  /** Get the file path for a session's JSONL file. */
  private getFilePath(sessionId: string): string {
    return join(this.baseDir, `${sessionId}.jsonl`)
  }

  /** Record a trajectory event. Best-effort — never throws. */
  record(event: TrajectoryEvent): void {
    try {
      const filePath = this.getFilePath(event.session_id)
      appendFileSync(filePath, JSON.stringify(event) + "\n", "utf-8")
      this.activeFiles.set(event.session_id, filePath)
    } catch (err) {
      log.error("Failed to record trajectory event", {
        error: String(err),
        type: event.type,
        session: event.session_id,
      })
      // Emit a "trajectory gap" marker — don't block the agent loop
      try {
        const gapFile = join(this.baseDir, "_gaps.log")
        appendFileSync(
          gapFile,
          JSON.stringify({ type: "trajectory_gap", ts: Date.now(), session_id: event.session_id, original_type: event.type }) +
            "\n",
          "utf-8",
        )
      } catch {
        // Silent — we've already failed, nothing more to do
      }
    }
  }

  /** Record multiple events in a batch. */
  recordBatch(events: TrajectoryEvent[]): void {
    for (const event of events) {
      this.record(event)
    }
  }

  /** Get stats about recorded trajectories. */
  getStats(): { totalSessions: number; totalEvents: number; diskUsageBytes: number } {
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs")
    try {
      if (!existsSync(this.baseDir)) return { totalSessions: 0, totalEvents: 0, diskUsageBytes: 0 }

      const files = readdirSync(this.baseDir).filter((f) => f.endsWith(".jsonl"))
      let totalBytes = 0
      let totalEvents = 0

      for (const file of files) {
        try {
          const stats = statSync(join(this.baseDir, file))
          totalBytes += stats.size
          // Rough estimate: average 200 bytes per event
          totalEvents += Math.round(stats.size / 200)
        } catch {
          // skip
        }
      }

      return {
        totalSessions: files.filter((f) => !f.startsWith("_")).length,
        totalEvents,
        diskUsageBytes: totalBytes,
      }
    } catch {
      return { totalSessions: 0, totalEvents: 0, diskUsageBytes: 0 }
    }
  }

  /** Rotate old trajectories (archive files older than N days). */
  rotate(maxAgeDays = 30): number {
    const { readdirSync, renameSync } = require("node:fs") as typeof import("node:fs")
    const { join: pathJoin } = require("node:path") as typeof import("node:path")
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
    let rotated = 0

    try {
      if (!existsSync(this.baseDir)) return 0

      const archiveDir = join(this.baseDir, "archive")
      if (!existsSync(archiveDir)) mkdirSync(archiveDir, { recursive: true })

      const files = readdirSync(this.baseDir).filter((f) => f.endsWith(".jsonl"))
      for (const file of files) {
        const filePath = pathJoin(this.baseDir, file)
        const stats = require("node:fs").statSync(filePath)
        if (stats.mtimeMs < cutoff) {
          renameSync(filePath, pathJoin(archiveDir, file))
          rotated++
        }
      }
    } catch (err) {
      log.error("Failed to rotate trajectories", { error: String(err) })
    }

    return rotated
  }
}

export const trajectoryRecorder = new TrajectoryRecorder()

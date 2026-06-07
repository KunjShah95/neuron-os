/**
 * src/training/exporter.ts
 *
 * Atropos-compatible trajectory exporter.
 * Reads internal JSONL files from ~/.aegis/trajectories/, groups events
 * by session_id, and emits one Atropos record per session.
 */

import { createLogger } from "../cli/logger"
import type { TrajectoryEvent } from "./recorder"
import { readFileSync, existsSync, readdirSync, writeFileSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"
const log = createLogger("training:exporter")

export interface AtroposRecord {
  env: string
  session_id: string
  model: string
  prompt: { role: string; content: string }[]
  completion: { role: string; content: string; tool_calls?: unknown[] }[]
  reward: number
  info: {
    tool_calls: { name: string; args: unknown; result_summary: string }[]
    costs: { prompt_tokens: number; completion_tokens: number; cost_usd: number }
    latency_ms: number
    session_id: string
    agent_type: string
  }
}

export interface ExportOptions {
  format: "atropos" | "jsonl"
  sinceDays: number
  output: string
  sessionId?: string
}

export class TrajectoryExporter {
  private baseDir: string

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? resolve(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "trajectories")
  }

  /**
   * Load all trajectory events from JSONL files within the time window.
   */
  loadEvents(sinceDays: number, sessionId?: string): Map<string, TrajectoryEvent[]> {
    const sessions = new Map<string, TrajectoryEvent[]>()
    const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000

    try {
      if (!existsSync(this.baseDir)) return sessions

      const files = readdirSync(this.baseDir).filter((f) => f.endsWith(".jsonl") && !f.startsWith("_"))

      for (const file of files) {
        const sid = file.replace(".jsonl", "")
        if (sessionId && sid !== sessionId) continue

        const content = readFileSync(join(this.baseDir, file), "utf-8")
        const lines = content.split("\n").filter(Boolean)
        const events: TrajectoryEvent[] = []

        for (const line of lines) {
          try {
            const event = JSON.parse(line)
            if (event.ts >= cutoff) {
              events.push(event)
            }
          } catch {
            // Skip malformed lines
          }
        }

        if (events.length > 0) {
          sessions.set(sid, events)
        }
      }
    } catch (err) {
      log.error("Failed to load trajectory events", { error: String(err) })
    }

    return sessions
  }

  /**
   * Export trajectories in the requested format.
   */
  export(options: ExportOptions): void {
    const sessions = this.loadEvents(options.sinceDays, options.sessionId)

    if (sessions.size === 0) {
      log.info("No trajectories found in the time window")
      return
    }

    const outputDir = resolve(options.output)
    const parentDir = resolve(outputDir, "..")
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true })
    }

    switch (options.format) {
      case "atropos":
        this.exportAtropos(sessions, outputDir)
        break
      case "jsonl":
        this.exportJsonl(sessions, outputDir)
        break
    }

    log.info(`Exported ${sessions.size} sessions to ${outputDir}`)
  }

  /**
   * Export as Atropos-compatible JSONL.
   * One JSON object per line, each representing one session.
   */
  private exportAtropos(sessions: Map<string, TrajectoryEvent[]>, output: string): void {
    const records: AtroposRecord[] = []

    for (const [sessionId, events] of sessions) {
      const record = this.toAtroposRecord(sessionId, events)
      if (record) records.push(record)
    }

    const lines = records.map((r) => JSON.stringify(r)).join("\n") + "\n"
    writeFileSync(output, lines, "utf-8")
    log.info(`Wrote ${records.length} Atropos records to ${output}`)
  }

  /**
   * Export internal JSONL format (one file per session, mirrored from source).
   */
  private exportJsonl(sessions: Map<string, TrajectoryEvent[]>, outputDir: string): void {
    const exportDir = resolve(outputDir, "exported")
    if (!existsSync(exportDir)) mkdirSync(exportDir, { recursive: true })

    for (const [sessionId, events] of sessions) {
      const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n"
      writeFileSync(join(exportDir, `${sessionId}.jsonl`), lines, "utf-8")
    }

    log.info(`Wrote ${sessions.size} session files to ${exportDir}`)
  }

  /**
   * Convert internal trajectory events to an Atropos record.
   */
  private toAtroposRecord(sessionId: string, events: TrajectoryEvent[]): AtroposRecord | null {
    const startEvent = events.find((e) => e.type === "session_start") as any
    const endEvent = events.find((e) => e.type === "session_end") as any

    if (!startEvent || !endEvent) return null

    const userTurns = events.filter((e) => e.type === "user_turn") as any[]
    const assistantTurns = events.filter((e) => e.type === "assistant_turn") as any[]
    const toolCalls = events.filter((e) => e.type === "tool_call") as any[]
    const costRecords = events.filter((e) => e.type === "cost_record") as any[]

    const totalCost = costRecords.reduce<{ prompt_tokens: number; completion_tokens: number; cost_usd: number }>(
      (sum, c: any) => ({
        prompt_tokens: (sum.prompt_tokens ?? 0) + (c.prompt_tokens ?? 0),
        completion_tokens: (sum.completion_tokens ?? 0) + (c.completion_tokens ?? 0),
        cost_usd: (sum.cost_usd ?? 0) + (c.cost_usd ?? 0),
      }),
      { prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 },
    )

    const firstTs = events[0]?.ts ?? Date.now()
    const lastTs = events[events.length - 1]?.ts ?? Date.now()

    return {
      env: "aegis-agent-os",
      session_id: sessionId,
      model: costRecords[0]?.model ?? "unknown",
      prompt: userTurns.map((t: any) => ({ role: "user", content: t.content ?? "" })),
      completion: assistantTurns.map((t: any) => ({
        role: "assistant",
        content: t.content ?? "",
        tool_calls: t.reasoning ? [{ type: "reasoning", reasoning: t.reasoning }] : undefined,
      })),
      reward: endEvent.outcome === "success" ? 1.0 : 0.0,
      info: {
        tool_calls: toolCalls.map((t: any) => ({
          name: t.tool ?? "",
          args: t.args ?? {},
          result_summary: "",
        })),
        costs: totalCost,
        latency_ms: lastTs - firstTs,
        session_id: sessionId,
        agent_type: startEvent.agent_type ?? "build",
      },
    }
  }
}

export const trajectoryExporter = new TrajectoryExporter()

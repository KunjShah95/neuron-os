/**
 * audit/replay — Step-by-step session debugger.
 *
 * Reads from the AuditStore and reconstructs the agent's decision-making
 * process, step by step. Shows what the agent was thinking, what tools
 * it called, what results it got, and how the session progressed.
 *
 * Usage (CLI):
 *   aegis audit replay <sessionId>
 *
 * Usage (programmatic):
 *   const replay = new SessionReplay(sessionId)
 *   for await (const step of replay.stream()) {
 *     console.log(step.summary)
 *   }
 */

import { auditStore, type AuditEntry } from "./store"

// ── Types ─────────────────────────────────────────────────────────────

export interface ReplayStep {
  stepIndex: number
  timestamp: string
  thought: string
  action: string
  result: string
  durationMs: number
  hasError: boolean
}

export interface ReplaySession {
  sessionId: string
  totalSteps: number
  startedAt: string
  endedAt: string | null
  outcome: string | null
  steps: ReplayStep[]
}

// ── SessionReplay ─────────────────────────────────────────────────────

export class SessionReplay {
  private sessionId: string

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  /**
   * Load all audit entries for this session and reconstruct the decision flow.
   */
  load(): ReplaySession {
    const entries = auditStore.getSessionAudit(this.sessionId)
    if (entries.length === 0) {
      throw new Error(`No audit data found for session: ${this.sessionId}`)
    }

    const steps = this.buildSteps(entries)

    const startEntry = entries.find((e) => e.eventType === "session_start")
    const endEntry = entries.find((e) => e.eventType === "session_end")

    return {
      sessionId: this.sessionId,
      totalSteps: steps.length,
      startedAt: startEntry?.timestamp || entries[0]?.timestamp || "",
      endedAt: endEntry?.timestamp || null,
      outcome: endEntry?.summary.replace("Session ended: ", "") || null,
      steps,
    }
  }

  /**
   * Get a compact text summary of the session.
   */
  getSummary(): string {
    const session = this.load()
    const lines: string[] = []

    lines.push(`## Session Replay: ${session.sessionId}`)
    lines.push("")
    lines.push(`**Started:** ${session.startedAt}`)
    lines.push(`**Steps:** ${session.totalSteps}`)
    lines.push(`**Outcome:** ${session.outcome || "unknown"}`)
    lines.push("")

    for (const step of session.steps) {
      const icon = step.hasError ? "🔴" : step.action.includes("thought") ? "💭" : "➡️"
      lines.push(`### ${icon} Step ${step.stepIndex}`)
      lines.push("")
      if (step.thought) lines.push(`**Thought:** ${step.thought}`)
      if (step.action) lines.push(`**Action:** ${step.action}`)
      if (step.result) lines.push(`**Result:** ${step.result.slice(0, 200)}`)
      if (step.durationMs > 0) lines.push(`**Duration:** ${step.durationMs}ms`)
      lines.push("")
    }

    return lines.join("\n")
  }

  /**
   * Get a one-line-per-step compact view.
   */
  getTimeline(): string {
    const session = this.load()
    const lines: string[] = []

    lines.push(
      `📋 Session: ${session.sessionId.slice(0, 16)}... (${session.totalSteps} steps, ${session.outcome || "?"})`,
    )
    lines.push("")

    for (const step of session.steps) {
      const icon = step.hasError ? "🔴" : step.action.includes("💭") ? "  " : "  "
      const time = step.timestamp.slice(11, 19)
      lines.push(`  ${icon} ${time} [${step.stepIndex}] ${step.action.slice(0, 80)}`)
    }

    return lines.join("\n")
  }

  private buildSteps(entries: AuditEntry[]): ReplayStep[] {
    // Group entries into steps: each thought starts a new step
    const steps: ReplayStep[] = []
    let currentStep: Partial<ReplayStep> = {}

    for (const entry of entries) {
      if (entry.eventType === "session_start" || entry.eventType === "session_end") continue

      if (entry.eventType === "thought") {
        // Save previous step if exists
        if (currentStep.thought || currentStep.action) {
          steps.push(currentStep as ReplayStep)
        }
        currentStep = {
          stepIndex: entry.stepIndex,
          timestamp: entry.timestamp,
          thought: entry.summary,
          action: "",
          result: "",
          durationMs: entry.durationMs,
          hasError: false,
        }
      } else if (entry.eventType === "error") {
        if (currentStep.stepIndex === entry.stepIndex || !currentStep.stepIndex) {
          currentStep.hasError = true
          currentStep.result = entry.summary
        }
      } else if (
        entry.eventType === "tool_call" ||
        entry.eventType === "file_read" ||
        entry.eventType === "file_write" ||
        entry.eventType === "shell_command"
      ) {
        currentStep.action = entry.summary
        currentStep.durationMs = entry.durationMs
      } else if (entry.eventType === "tool_result") {
        currentStep.result = entry.summary
        currentStep.durationMs = entry.durationMs
      } else if (entry.eventType === "approval_request" || entry.eventType === "approval_result") {
        currentStep.action = entry.summary
      }
    }

    // Push last step
    if (currentStep.thought || currentStep.action) {
      steps.push(currentStep as ReplayStep)
    }

    return steps
  }
}

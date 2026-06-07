/**
 * audit/recorder — Real-time audit recorder that hooks into the AgentEngine.
 *
 * Captures every agent thought, tool call, file mutation, and approval
 * decision into the AuditStore. Designed to be called from the AgentEngine
 * lifecycle hooks — minimal overhead, append-only writes.
 *
 * Usage:
 *   const recorder = new AuditRecorder(sessionId, project)
 *   recorder.recordThought("Analyzing the codebase structure...")
 *   recorder.recordToolCall("read_file", { path: "src/index.ts" })
 *   recorder.recordToolResult("read_file", "file content...")
 *   recorder.recordApproval("approved", "All changes look good")
 */

import { auditStore } from "./store"

export interface RecorderConfig {
  sessionId: string
  project?: string
  agentType?: string
}

export class AuditRecorder {
  private sessionId: string
  private project: string
  private stepIndex = 0
  private stepStartTime = 0
  private lastThought = ""

  constructor(config: RecorderConfig) {
    this.sessionId = config.sessionId
    this.project = config.project || ""
  }

  // ── Step tracking ───────────────────────────────────────────────────

  private nextStep(): number {
    return ++this.stepIndex
  }

  private startStep(): void {
    this.stepStartTime = Date.now()
  }

  private duration(): number {
    return this.stepStartTime > 0 ? Date.now() - this.stepStartTime : 0
  }

  // ── Recording methods ───────────────────────────────────────────────

  recordThought(thought: string): void {
    if (!thought) return
    this.lastThought = thought
    this.startStep()

    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: this.nextStep(),
      eventType: "thought",
      summary: thought.slice(0, 120),
      detail: thought,
      context: "{}",
      agentThought: thought,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    })
  }

  recordToolCall(toolName: string, args: Record<string, unknown>): void {
    this.startStep()

    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: this.nextStep(),
      eventType: "tool_call",
      summary: `Tool: ${toolName}`,
      detail: JSON.stringify(args, null, 2),
      context: "{}",
      agentThought: this.lastThought,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    })
  }

  recordToolResult(toolName: string, result: string, success: boolean): void {
    const duration = this.duration()

    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: this.nextStep(),
      eventType: "tool_result",
      summary: `${success ? "✓" : "✗"} ${toolName}`,
      detail: result.slice(0, 2000),
      context: "{}",
      agentThought: this.lastThought,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    })
  }

  recordFileRead(path: string, content: string): void {
    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: this.nextStep(),
      eventType: "file_read",
      summary: `Read: ${path}`,
      detail: content.slice(0, 1000),
      context: JSON.stringify({ path }),
      agentThought: this.lastThought,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    })
  }

  recordFileWrite(path: string, before: string | undefined, after: string): void {
    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: this.nextStep(),
      eventType: "file_write",
      summary: `Write: ${path}`,
      detail: JSON.stringify({
        path,
        beforeLength: before?.length || 0,
        afterLength: after.length,
        before: before?.slice(0, 500),
        after: after.slice(0, 500),
      }),
      context: "{}",
      agentThought: this.lastThought,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    })
  }

  recordShellCommand(command: string, output: string, exitCode: number): void {
    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: this.nextStep(),
      eventType: "shell_command",
      summary: `Shell: ${command.slice(0, 80)}`,
      detail: JSON.stringify({ command, output: output.slice(0, 2000), exitCode }),
      context: "{}",
      agentThought: this.lastThought,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    })
  }

  recordApprovalRequest(pendingActions: number): void {
    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: this.nextStep(),
      eventType: "approval_request",
      summary: `Approval requested: ${pendingActions} change(s) pending`,
      detail: "",
      context: "{}",
      agentThought: this.lastThought,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    })
  }

  recordApprovalResult(approved: boolean, comment?: string): void {
    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: this.nextStep(),
      eventType: "approval_result",
      summary: approved ? "✓ Changes approved" : "✗ Changes rejected",
      detail: comment || "",
      context: "{}",
      agentThought: this.lastThought,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    })
  }

  recordError(error: string): void {
    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: this.nextStep(),
      eventType: "error",
      summary: `Error: ${error.slice(0, 120)}`,
      detail: error,
      context: "{}",
      agentThought: this.lastThought,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    })
  }

  recordSessionStart(goal: string): void {
    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: 0,
      eventType: "session_start",
      summary: `Session started: ${goal.slice(0, 80)}`,
      detail: goal,
      context: JSON.stringify({ project: this.project }),
      agentThought: "",
      durationMs: 0,
      timestamp: new Date().toISOString(),
    })
  }

  recordSessionEnd(outcome: string): void {
    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: this.nextStep(),
      eventType: "session_end",
      summary: `Session ended: ${outcome}`,
      detail: `Completed ${this.stepIndex} steps`,
      context: JSON.stringify({ totalSteps: this.stepIndex, outcome }),
      agentThought: "",
      durationMs: 0,
      timestamp: new Date().toISOString(),
    })
  }

  recordRatchetRevert(details: { files: string[]; previousScore: number; newScore: number; reason: string }): void {
    auditStore.record({
      sessionId: this.sessionId,
      project: this.project,
      stepIndex: this.nextStep(),
      eventType: "ratchet_revert",
      summary: `Ratchet revert: ${details.files.length} file(s) — ${details.reason}`,
      detail: JSON.stringify({
        files: details.files,
        previousScore: details.previousScore,
        newScore: details.newScore,
      }),
      context: JSON.stringify({
        reason: details.reason,
        fileCount: details.files.length,
      }),
      agentThought: this.lastThought,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    })
  }
}

/**
 * Tests for the AuditRecorder — real-time audit hook into AgentEngine.
 * Covers all recording methods and verifies they write to the store.
 *
 * Usage: bun test ./src/audit/test-recorder.ts
 */

import { describe, it, expect, beforeEach } from "bun:test"
import { randomUUID } from "node:crypto"
import { AuditRecorder } from "./recorder"
import { auditStore } from "./store"

function makeSessionId(): string {
  return `test-rec-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
}

describe("AuditRecorder", () => {
  let recorder: AuditRecorder
  let sessionId: string

  beforeEach(() => {
    sessionId = makeSessionId()
    recorder = new AuditRecorder({ sessionId, project: "test-recorder" })
  })

  // ── Session Lifecycle ───────────────────────────────────────────────

  it("should record session start", () => {
    recorder.recordSessionStart("Test goal")

    const entries = auditStore.query({ sessionId, eventType: "session_start" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toContain("Test goal")
    expect(entries[0]?.eventType).toBe("session_start")
  })

  it("should record session end", () => {
    recorder.recordSessionStart("Goal")
    recorder.recordSessionEnd("completed")

    const entries = auditStore.query({ sessionId, eventType: "session_end" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toContain("completed")
  })

  // ── Thought Recording ───────────────────────────────────────────────

  it("should record a thought", () => {
    recorder.recordThought("I need to analyze the codebase structure")

    const entries = auditStore.query({ sessionId, eventType: "thought" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toBe("I need to analyze the codebase structure")
    expect(entries[0]?.agentThought).toBe("I need to analyze the codebase structure")
  })

  it("should skip empty thoughts", () => {
    recorder.recordThought("")

    const entries = auditStore.query({ sessionId, eventType: "thought" })
    expect(entries).toHaveLength(0)
  })

  it("should truncate long thoughts in summary to 120 chars", () => {
    const longThought = "A".repeat(200)
    recorder.recordThought(longThought)

    const entries = auditStore.query({ sessionId, eventType: "thought" })
    expect(entries).toHaveLength(1)
    expect(entries[0]!.summary.length).toBeLessThanOrEqual(120)
    expect(entries[0]!.detail).toBe(longThought)
  })

  it("should store full thought in detail field", () => {
    const thought = "Detailed analysis of the authentication flow"
    recorder.recordThought(thought)

    const entries = auditStore.query({ sessionId, eventType: "thought" })
    expect(entries).toHaveLength(1)
    expect(entries[0]!.summary).toBe(thought)
    expect(entries[0]!.detail).toBe(thought)
  })

  // ── Tool Recording ──────────────────────────────────────────────────

  it("should record a tool call", () => {
    recorder.recordThought("Let me read the file")
    recorder.recordToolCall("read_file", { path: "src/index.ts" })

    const entries = auditStore.query({ sessionId, eventType: "tool_call" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toContain("Tool: read_file")
    expect(entries[0]?.detail).toContain("src/index.ts")
  })

  it("should record a tool call with complex args", () => {
    recorder.recordThought("Searching")
    recorder.recordToolCall("code_search", { pattern: "authenticate", flags: "-g *.ts" })

    const entries = auditStore.query({ sessionId, eventType: "tool_call" })
    const entry = entries[0]
    expect(entry).toBeTruthy()
    expect(entry!.summary).toContain("code_search")
    expect(entry!.detail).toContain("authenticate")
  })

  it("should record a successful tool result", () => {
    recorder.recordThought("Reading")
    recorder.recordToolCall("read_file", { path: "test.txt" })
    recorder.recordToolResult("read_file", "file content", true)

    const entries = auditStore.query({ sessionId, eventType: "tool_result" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toContain("✓")
    expect(entries[0]?.summary).toContain("read_file")
  })

  it("should record a failed tool result", () => {
    recorder.recordThought("Writing")
    recorder.recordToolCall("write_file", { path: "test.txt" })
    recorder.recordToolResult("write_file", "Permission denied", false)

    const entries = auditStore.query({ sessionId, eventType: "tool_result" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toContain("✗")
  })

  it("should truncate long tool results to 2000 chars", () => {
    const longResult = "A".repeat(5000)
    recorder.recordThought("Processing")
    recorder.recordToolCall("process", {})
    recorder.recordToolResult("process", longResult, true)

    const entries = auditStore.query({ sessionId, eventType: "tool_result" })
    expect(entries).toHaveLength(1)
    expect(entries[0]!.detail.length).toBeLessThanOrEqual(2000)
  })

  // ── File Operations ─────────────────────────────────────────────────

  it("should record a file read", () => {
    recorder.recordThought("Reading config")
    recorder.recordFileRead("config.json", '{"key": "value"}')

    const entries = auditStore.query({ sessionId, eventType: "file_read" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toBe("Read: config.json")
    expect(entries[0]?.detail).toContain("key")
  })

  it("should truncate long file reads to 1000 chars", () => {
    const longContent = "X".repeat(5000)
    recorder.recordFileRead("large.txt", longContent)

    const entries = auditStore.query({ sessionId, eventType: "file_read" })
    expect(entries).toHaveLength(1)
    expect(entries[0]!.detail.length).toBeLessThanOrEqual(1000)
  })

  it("should record a file write with before/after state", () => {
    recorder.recordFileWrite("src/app.ts", "old content", "new content")

    const entries = auditStore.query({ sessionId, eventType: "file_write" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toBe("Write: src/app.ts")
    expect(entries[0]?.detail).toContain("beforeLength")
    expect(entries[0]?.detail).toContain("afterLength")
    expect(entries[0]?.detail).toContain("old content")
    expect(entries[0]?.detail).toContain("new content")
  })

  it("should record a file write with undefined before state", () => {
    recorder.recordFileWrite("new-file.ts", undefined, "console.log('hello')")

    const entries = auditStore.query({ sessionId, eventType: "file_write" })
    const entry = entries[0]
    expect(entry).toBeTruthy()
    // JSON serialization: "beforeLength":0 (no space after colon)
    expect(entry!.detail).toContain('"beforeLength":0')
  })

  // ── Shell Commands ──────────────────────────────────────────────────

  it("should record a shell command", () => {
    recorder.recordThought("Running tests")
    recorder.recordShellCommand("bun test", "Tests passed: 10", 0)

    const entries = auditStore.query({ sessionId, eventType: "shell_command" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toContain("bun test")
    expect(entries[0]?.detail).toContain("Tests passed")
  })

  it("should record a failed shell command", () => {
    recorder.recordShellCommand("npm run build", "Error: build failed", 1)

    const entries = auditStore.query({ sessionId, eventType: "shell_command" })
    expect(entries).toHaveLength(1)
    expect(entries[0]!.detail).toContain("exitCode")
    expect(entries[0]!.detail).toContain("build failed")
  })

  it("should record a shell command with exit code in JSON", () => {
    recorder.recordShellCommand("eslint src", "No issues found", 0)

    const entries = auditStore.query({ sessionId, eventType: "shell_command" })
    expect(entries).toHaveLength(1)
    // JSON serialization: "exitCode":0 (no space after colon)
    expect(entries[0]!.detail).toContain('"exitCode":0')
  })

  // ── Approvals ───────────────────────────────────────────────────────

  it("should record an approval request", () => {
    recorder.recordApprovalRequest(3)

    const entries = auditStore.query({ sessionId, eventType: "approval_request" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toContain("3 change(s) pending")
  })

  it("should record an approval result (approved)", () => {
    recorder.recordApprovalResult(true, "All changes look good")

    const entries = auditStore.query({ sessionId, eventType: "approval_result" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toContain("approved")
    expect(entries[0]?.detail).toBe("All changes look good")
  })

  it("should record an approval result (rejected)", () => {
    recorder.recordApprovalResult(false, "This approach won't work")

    const entries = auditStore.query({ sessionId, eventType: "approval_result" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toContain("rejected")
    expect(entries[0]?.detail).toBe("This approach won't work")
  })

  it("should record approval result without comment", () => {
    recorder.recordApprovalResult(true, "")

    const entries = auditStore.query({ sessionId, eventType: "approval_result" })
    expect(entries).toHaveLength(1)
  })

  // ── Errors ──────────────────────────────────────────────────────────

  it("should record an error", () => {
    recorder.recordError("TypeError: Cannot read property of undefined")

    const entries = auditStore.query({ sessionId, eventType: "error" })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.summary).toContain("TypeError")
    expect(entries[0]?.detail).toBe("TypeError: Cannot read property of undefined")
  })

  it("should truncate long error messages in summary", () => {
    const longError = "Z".repeat(200)
    recorder.recordError(longError)

    const entries = auditStore.query({ sessionId, eventType: "error" })
    expect(entries).toHaveLength(1)
    // Summary is `Error: ` (7 chars) + error.slice(0, 120) = max 127
    expect(entries[0]!.summary.length).toBeLessThanOrEqual(127)
  })

  // ── Step Tracking ───────────────────────────────────────────────────

  it("should increment step index across recordings", () => {
    recorder.recordSessionStart("Multi-step")
    recorder.recordThought("Step 1")
    recorder.recordToolCall("read_file", { path: "a.ts" })
    recorder.recordThought("Step 2")
    recorder.recordToolCall("write_file", { path: "b.ts" })

    const entries = auditStore.query({ sessionId })
    const stepIndices = entries.map((e) => e.stepIndex)
    for (let i = 1; i < stepIndices.length; i++) {
      expect(stepIndices[i]!).toBeGreaterThanOrEqual(stepIndices[i - 1]!)
    }
  })

  it("should set project on all entries", () => {
    recorder.recordSessionStart("Project test")
    recorder.recordThought("Working")

    const entries = auditStore.query({ sessionId })
    expect(entries.every((e) => e.project === "test-recorder")).toBe(true)
  })

  // ── Edge Cases ──────────────────────────────────────────────────────

  it("should handle rapid sequential recordings", () => {
    recorder.recordSessionStart("Burst test")
    for (let i = 0; i < 20; i++) {
      recorder.recordThought(`Thought ${i}`)
    }

    const entries = auditStore.query({ sessionId, eventType: "thought" })
    expect(entries).toHaveLength(20)
  })

  it("should preserve the last thought for next recording", () => {
    recorder.recordThought("Analysis complete")
    recorder.recordToolCall("modify_file", { path: "test.txt" })

    const entries = auditStore.query({ sessionId, eventType: "tool_call" })
    expect(entries[0]?.agentThought).toBe("Analysis complete")
  })
})

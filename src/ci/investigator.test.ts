import { describe, it, expect } from "bun:test"

import { extractAgentResultOutput, parseFixOutput } from "./investigator"

describe("extractAgentResultOutput", () => {
  it("returns null for the agent readiness handshake", () => {
    const ready = {
      type: "result",
      id: "boot",
      payload: { status: "ready", name: "ci-fix", id: "a1", type: "debug" },
      timestamp: 1,
      agentId: "a1",
    }

    expect(extractAgentResultOutput(ready)).toBeNull()
  })

  it("reads the output from the task result payload", () => {
    const result = {
      type: "result",
      id: "task-1",
      payload: { taskId: 1, output: "FIX_BRANCH: fix/thing", steps: 1 },
      timestamp: 2,
      agentId: "a1",
    }

    expect(extractAgentResultOutput(result)).toBe("FIX_BRANCH: fix/thing")
  })

  it("falls back to a top-level output field", () => {
    expect(extractAgentResultOutput({ output: "hello" })).toBe("hello")
  })

  it("returns null for results without any output", () => {
    expect(extractAgentResultOutput({ type: "result", payload: { pong: true } })).toBeNull()
    expect(extractAgentResultOutput({})).toBeNull()
    expect(extractAgentResultOutput(undefined)).toBeNull()
    expect(extractAgentResultOutput("nope")).toBeNull()
  })
})

describe("parseFixOutput", () => {
  it("extracts the branch, description and diff", () => {
    const output = [
      "All done.",
      "FIX_DESCRIPTION: Guard the null branch",
      "FIX_BRANCH: ci/fix-null-branch",
      "```diff",
      "--- a/x.ts",
      "+++ b/x.ts",
      "@@",
      "-old",
      "+new",
      "```",
    ].join("\n")

    const parsed = parseFixOutput(output)
    expect(parsed.fix_branch).toBe("ci/fix-null-branch")
    expect(parsed.fix_description).toBe("Guard the null branch")
    expect(parsed.diff).toContain("+new")
  })

  it("returns undefined fields when the markers are missing", () => {
    const parsed = parseFixOutput("nothing useful here")
    expect(parsed.fix_branch).toBeUndefined()
    expect(parsed.fix_description).toBeUndefined()
    expect(parsed.diff).toBeUndefined()
  })
})

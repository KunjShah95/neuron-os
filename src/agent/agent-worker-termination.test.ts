/**
 * The ReAct loop must terminate on ordinary prose. A final answer that merely
 * mentions the word "call" must not look like a tool invocation request.
 */

import { describe, it, expect } from "bun:test"
import { isToolInvocationRequest } from "./agent-worker"

describe("isToolInvocationRequest", () => {
  it("does not treat ordinary prose as a tool request", () => {
    expect(isToolInvocationRequest("I will call the API later")).toBe(false)
    expect(isToolInvocationRequest("The tool finished, so we can continue.")).toBe(false)
    expect(isToolInvocationRequest("Done. I called the function and it returned 42.")).toBe(false)
    expect(isToolInvocationRequest("Here is the summary of what happened.")).toBe(false)
    expect(isToolInvocationRequest("")).toBe(false)
  })

  it("recognises explicit structured tool markers", () => {
    expect(isToolInvocationRequest("Action: read_file")).toBe(true)
    expect(isToolInvocationRequest("Tool: read_file")).toBe(true)
    expect(isToolInvocationRequest("Tool Call: read_file")).toBe(true)
    expect(isToolInvocationRequest("TOOL_CALL=read_file")).toBe(true)
    expect(isToolInvocationRequest("Function Call: read_file")).toBe(true)
  })

  it("only matches the marker at the start of a line", () => {
    expect(isToolInvocationRequest("first I thought about it\nAction: read_file")).toBe(true)
    expect(isToolInvocationRequest("Please note the Action: read_file was planned")).toBe(false)
  })
})

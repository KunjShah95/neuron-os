import { describe, it, expect, afterAll } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { TraceCollector } from "./integrations"
import { GenAITracer } from "./genai-tracing"

const tmp = mkdtempSync(join(tmpdir(), "genai-traces-"))
const collector = new TraceCollector({ dbPath: join(tmp, "traces.db") })
const tracer = new GenAITracer(collector)

afterAll(() => {
  try {
    rmSync(tmp, { recursive: true, force: true })
  } catch {}
})

describe("genai tracing spans", () => {
  it("ends the LLM span using the id returned by startSpan", () => {
    const start = tracer.startGeneration({
      sessionId: "session-1",
      agentId: "agent-1",
      model: "gpt-4o",
      provider: "openai",
      userMessages: ["hello"],
    })

    const started = collector.query({ type: "llm" })
    expect(started.length).toBe(1)
    expect(started[0]?.status).toBe("pending")
    expect(started[0]?.id).toBe(start.spanId)

    tracer.endGeneration(start, {
      spanId: start.spanId,
      output: "world",
      inputTokens: 3,
      outputTokens: 4,
      totalTokens: 7,
      durationMs: 12,
      status: "success",
    })

    const ended = collector.query({ type: "llm" })
    expect(ended.length).toBe(1)
    expect(ended[0]?.status).toBe("ok")
    expect(ended[0]?.endTime).toBeGreaterThan(0)
    expect(ended[0]?.duration).toBeGreaterThanOrEqual(0)
    expect(ended[0]?.id).toBe(start.spanId)
  })

  it("leaves a span pending when endSpan is called with a name instead of an id", () => {
    const span = collector.startSpan("llm:some-model", "llm")
    collector.endSpan("llm:some-model", "ok")

    const rows = collector.query({ type: "llm" }).filter((s) => s.id === span.id)
    expect(rows.length).toBe(1)
    expect(rows[0]?.status).toBe("pending")
    expect(rows[0]?.endTime ?? null).toBeNull()

    collector.endSpan(span.id, "ok")
    const closed = collector.query({ type: "llm" }).filter((s) => s.id === span.id)
    expect(closed[0]?.status).toBe("ok")
    expect(closed[0]?.endTime).toBeGreaterThan(0)
  })

  it("ends the tool span using the id returned by startSpan", () => {
    tracer.recordToolCall({
      traceId: "session-2",
      sessionId: "session-2",
      agentId: "agent-2",
      toolName: "read_file",
      args: { path: "a.ts" },
      result: "contents",
      durationMs: 4,
      status: "success",
    })

    const tools = collector.query({ type: "tool" })
    expect(tools.length).toBe(1)
    expect(tools[0]?.status).toBe("ok")
    expect(tools[0]?.endTime).toBeGreaterThan(0)
  })

  it("marks failed tool calls as errored instead of pending", () => {
    tracer.recordToolCall({
      traceId: "session-3",
      sessionId: "session-3",
      agentId: "agent-3",
      toolName: "write_file",
      args: { path: "b.ts" },
      result: "",
      durationMs: 1,
      status: "error",
      error: "boom",
    })

    const tools = collector.query({ type: "tool" })
    const failed = tools.find((t) => t.name === "tool:write_file")
    expect(failed?.status).toBe("error")
    expect(failed?.endTime).toBeGreaterThan(0)
  })
})

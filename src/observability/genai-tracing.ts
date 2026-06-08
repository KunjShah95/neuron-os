/**
 * GenAI Tracing — wraps AI SDK calls with GenAI semantic convention spans.
 *
 * Records every LLM generation, tool call, and agent step as spans with
 * gen_ai.* attributes, exported to:
 *  1. Local TraceCollector (SQLite — always)
 *  2. Langfuse (HTTP — if LANGFUSE_* env vars are set)
 *
 * Semantic conventions (OpenTelemetry GenAI):
 *  - gen_ai.system: "anthropic" | "openai" | etc.
 *  - gen_ai.request.model: model name
 *  - gen_ai.response.max_tokens: configured max
 *  - gen_ai.usage.input_tokens: prompt tokens
 *  - gen_ai.usage.output_tokens: completion tokens
 *
 * Integration: AgentEngine.streamChat() and AgentEngine.chat() call
 *  startGeneration() before the AI call and endGeneration() after.
 */

import { randomBytes } from "node:crypto"
import { TraceCollector } from "./integrations"
import { postGenAIEvent, postSpanEvent, isLangfuseConfigured } from "./langfuse"
import { createLogger } from "../cli/logger"

const log = createLogger("genai-tracing")

export interface GenAIGenerationStart {
  spanId: string
  traceId: string
  sessionId: string
  agentId: string
  model: string
  provider: string
  systemPrompt?: string
  userMessages: string[]
  maxTokens?: number
  temperature?: number
  startedAt: string
}

export interface GenAIGenerationEnd {
  spanId: string
  output: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  durationMs: number
  status: "success" | "error"
  error?: string
}

export interface GenAIToolCall {
  traceId: string
  sessionId: string
  agentId: string
  toolName: string
  args: Record<string, unknown>
  result: string
  durationMs: number
  status: "success" | "error"
  error?: string
}

export class GenAITracer {
  private collector: TraceCollector
  private langfuseEnabled: boolean

  constructor(collector: TraceCollector) {
    this.collector = collector
    this.langfuseEnabled = isLangfuseConfigured()
    if (this.langfuseEnabled) {
      log.info("Langfuse tracing enabled")
    }
  }

  /**
   * Start an LLM generation trace.
   * Call before streamText() / generateText().
   */
  startGeneration(opts: {
    sessionId: string
    agentId: string
    model: string
    provider: string
    systemPrompt?: string
    userMessages: string[]
    maxTokens?: number
    temperature?: number
    parentSpanId?: string
  }): GenAIGenerationStart {
    const traceId = opts.sessionId
    const spanId = "gen-" + Date.now().toString(36) + "-" + randomBytes(4).toString("hex")

    const metadata: Record<string, unknown> = {
      gen_ai_system: opts.provider,
      gen_ai_request_model: opts.model,
      gen_ai_request_max_tokens: opts.maxTokens,
      gen_ai_request_temperature: opts.temperature,
      agent_id: opts.agentId,
      session_id: opts.sessionId,
    }

    this.collector.startSpan(
      `llm:${opts.model}`,
      "llm",
      opts.parentSpanId,
      metadata,
    )

    const start: GenAIGenerationStart = {
      spanId,
      traceId,
      sessionId: opts.sessionId,
      agentId: opts.agentId,
      model: opts.model,
      provider: opts.provider,
      systemPrompt: opts.systemPrompt,
      userMessages: opts.userMessages,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
      startedAt: new Date().toISOString(),
    }

    // Fire-and-forget Langfuse post
    if (this.langfuseEnabled) {
      postGenAIEvent({
        traceId,
        name: `generation:${opts.model}`,
        startTime: start.startedAt,
        metadata,
        input: `System: ${(opts.systemPrompt ?? "").slice(0, 2000)}\n\nUser: ${opts.userMessages.join("\n").slice(0, 6000)}`,
        genAI: {
          system: opts.provider,
          model: opts.model,
          maxTokens: opts.maxTokens,
          temperature: opts.temperature,
        },
      }).catch(() => {})
    }

    return start
  }

  /**
   * End an LLM generation trace.
   * Call after streamText() / generateText() completes.
   */
  endGeneration(start: GenAIGenerationStart, end: GenAIGenerationEnd): void {
    const metadata: Record<string, unknown> = {
      gen_ai_system: start.provider,
      gen_ai_request_model: start.model,
      gen_ai_usage_input_tokens: end.inputTokens,
      gen_ai_usage_output_tokens: end.outputTokens,
      gen_ai_usage_total_tokens: end.totalTokens,
      duration_ms: end.durationMs,
    }

    this.collector.endSpan(
      `llm:${start.model}`,
      end.status === "success" ? "ok" : "error",
    )

    if (this.langfuseEnabled) {
      postGenAIEvent({
        traceId: start.traceId,
        name: `generation:${start.model}`,
        startTime: start.startedAt,
        endTime: new Date().toISOString(),
        metadata,
        input: start.userMessages.join("\n").slice(0, 8_000),
        output: end.output.slice(0, 8_000),
        genAI: {
          system: start.provider,
          model: start.model,
          maxTokens: start.maxTokens,
          temperature: start.temperature,
          inputTokens: end.inputTokens,
          outputTokens: end.outputTokens,
          totalTokens: end.totalTokens,
        },
        level: end.status === "error" ? "ERROR" : "DEFAULT",
        status: end.status,
      }).catch(() => {})
    }

    log.debug("Generation traced", {
      model: start.model,
      tokens: end.totalTokens,
      duration: end.durationMs,
      status: end.status,
    })
  }

  /**
   * Record a tool call as a span.
   */
  recordToolCall(call: GenAIToolCall): void {
    this.collector.startSpan(
      `tool:${call.toolName}`,
      "tool",
      undefined,
      {
        tool_name: call.toolName,
        session_id: call.sessionId,
        agent_id: call.agentId,
        duration_ms: call.durationMs,
      },
    )

    this.collector.endSpan(
      `tool:${call.toolName}`,
      call.status === "success" ? "ok" : "error",
    )

    if (this.langfuseEnabled) {
      postSpanEvent({
        traceId: call.traceId,
        name: `tool:${call.toolName}`,
        startTime: new Date(Date.now() - call.durationMs).toISOString(),
        endTime: new Date().toISOString(),
        metadata: {
          tool_name: call.toolName,
          args: call.args,
          duration_ms: call.durationMs,
        },
        input: JSON.stringify(call.args).slice(0, 4_000),
        output: call.result.slice(0, 4_000),
        level: call.status === "error" ? "ERROR" : "DEFAULT",
        status: call.status,
      }).catch(() => {})
    }
  }
}

export const genaiTracer = new GenAITracer(new TraceCollector())
export { isLangfuseConfigured } from "./langfuse"

/**
 * Langfuse HTTP exporter — posts GenAI trace spans to Langfuse.
 *
 * Uses Langfuse's public API (no OTel SDK required).
 * Falls back silently when LANGFUSE_* env vars are not set.
 *
 * Trace schema follows GenAI semantic conventions:
 *   gen_ai.system, gen_ai.request.model, gen_ai.response.max_tokens,
 *   gen_ai.usage.input_tokens, gen_ai.usage.output_tokens
 */

import { createLogger } from "../cli/logger"

const log = createLogger("langfuse")

export interface LangfuseConfig {
  publicKey: string
  secretKey: string
  host?: string
}

export interface GenAITraceEvent {
  /** Trace / session ID */
  traceId: string
  /** Span name (e.g. "chat", "tool_call") */
  name: string
  /** ISO timestamp */
  startTime: string
  /** ISO timestamp */
  endTime?: string
  /** LLM or tool metadata */
  metadata?: Record<string, unknown>
  /** Input (truncated to 8k chars) */
  input?: string
  /** Output (truncated to 8k chars) */
  output?: string
  /** GenAI semantic convention attributes */
  genAI?: {
    system?: string
    model?: string
    maxTokens?: number
    temperature?: number
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
  /** Level for errors */
  level?: "DEFAULT" | "WARNING" | "ERROR"
  /** Status */
  status?: "success" | "error"
}

function loadConfig(): LangfuseConfig | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY
  const secretKey = process.env.LANGFUSE_SECRET_KEY
  if (!publicKey || !secretKey) return null
  return {
    publicKey,
    secretKey,
    host: process.env.LANGFUSE_HOST ?? "https://cloud.langfuse.com",
  }
}

function basicAuth(config: LangfuseConfig): string {
  const encoded = Buffer.from(`${config.publicKey}:${config.secretKey}`).toString("base64")
  return `Basic ${encoded}`
}

/**
 * Post a single generation trace event to Langfuse.
 * Returns true on success, false on failure or if not configured.
 */
export async function postGenAIEvent(event: GenAITraceEvent): Promise<boolean> {
  const config = loadConfig()
  if (!config) return false

  const payload: Record<string, unknown> = {
    name: event.name,
    startTime: event.startTime,
    metadata: event.metadata ?? {},
    input: event.input?.slice(0, 8_000),
    output: event.output?.slice(0, 8_000),
    level: event.level ?? "DEFAULT",
    status: event.status === "error" ? "ERROR" : "COMPLETED",
  }

  if (event.genAI) {
    payload.model = event.genAI.model
    payload.modelParameters = {
      maxTokens: event.genAI.maxTokens,
      temperature: event.genAI.temperature,
    }
    payload.usage = {
      input: event.genAI.inputTokens ?? 0,
      output: event.genAI.outputTokens ?? 0,
      total: event.genAI.totalTokens ?? 0,
      unit: "TOKENS",
    }
  }

  try {
    const res = await fetch(`${config.host}/api/public/traces/${event.traceId}/generations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth(config),
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      log.warn("Langfuse API error", { status: res.status, statusText: res.statusText })
      return false
    }
    return true
  } catch (err) {
    log.warn("Langfuse request failed", { error: String(err) })
    return false
  }
}

/**
 * Post a span event to Langfuse (non-generation, e.g. tool calls).
 * Uses the observation endpoint.
 */
export async function postSpanEvent(event: GenAITraceEvent): Promise<boolean> {
  const config = loadConfig()
  if (!config) return false

  const payload: Record<string, unknown> = {
    name: event.name,
    startTime: event.startTime,
    endTime: event.endTime,
    metadata: event.metadata ?? {},
    input: event.input?.slice(0, 8_000),
    output: event.output?.slice(0, 8_000),
    level: event.level ?? "DEFAULT",
    status: event.status === "error" ? "ERROR" : "COMPLETED",
  }

  try {
    const res = await fetch(`${config.host}/api/public/traces/${event.traceId}/observations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth(config),
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      log.warn("Langfuse span API error", { status: res.status })
      return false
    }
    return true
  } catch (err) {
    log.warn("Langfuse span request failed", { error: String(err) })
    return false
  }
}

export function isLangfuseConfigured(): boolean {
  return !!(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY)
}

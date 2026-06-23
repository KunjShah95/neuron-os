import { z } from "zod"
import { createLogger } from "../../cli/logger"
import { jsonResponse } from "../security"
import type { ApiRequest, ApiServerConfig } from "../types"
import { AgentEngine } from "../../agent/engine"
import { AIProviderManager, resolveAutoAIConfig, getConfiguredProviders, type AIProvider } from "../../ai"
import { createAgentRuntime } from "../../agent/runtime"
import type { ModelMessage } from "ai"

const log = createLogger("api:chat")

const ChatRequestSchema = z.object({
  message: z.string().min(1, "Message is required").max(50000, "Message too long"),
  provider: z.string().max(64).optional(),
  model: z.string().max(128).optional(),
  stream: z.boolean().optional().default(false),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string(),
      }),
    )
    .optional()
    .default([]),
  agentType: z.string().max(32).optional(),
  maxSteps: z.number().int().min(1).max(50).optional().default(10),
  temperature: z.number().min(0).max(2).optional(),
})

// ── Session cleanup timer ────────────────────────────────────────────
// Periodically prunes stale entries from the in-memory session tracking.
const PRUNE_INTERVAL_MS = 5 * 60 * 1000 // Cleanup every 5 minutes

let pruneInterval: ReturnType<typeof setInterval> | null = null

function startPruneInterval(): void {
  if (pruneInterval) return
  pruneInterval = setInterval(() => {
    // Session cleanup reserved for future in-memory tracking.
    // Currently, chat sessions are persisted via the SQLite SessionStore.
  }, PRUNE_INTERVAL_MS)
  // Allow the process to exit even if the interval is still active
  if (pruneInterval && typeof pruneInterval === "object" && "unref" in pruneInterval) {
    pruneInterval.unref()
  }
}

// Ensure cleanup interval is started (idempotent)
startPruneInterval()

function buildEngine(
  providerOverride?: string,
  modelOverride?: string,
  agentType?: string,
  maxSteps?: number,
  temperature?: number,
): { engine: AgentEngine; config: ReturnType<typeof resolveAutoAIConfig> } {
  const configured = getConfiguredProviders()
  if (configured.length === 0) {
    throw new Error(
      "No AI provider configured. Set an API key via environment variable (e.g. ANTHROPIC_API_KEY, OPENAI_API_KEY, GROQ_API_KEY) or run `aegis setup-keys`.",
    )
  }

  const config = resolveAutoAIConfig({
    provider: providerOverride as AIProvider,
    model: modelOverride,
    temperature,
  })
  const ai = new AIProviderManager(config)
  const runtime = createAgentRuntime("api-chat", agentType)
  const sessionId = `api-chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  const engine = new AgentEngine(runtime, ai, {
    maxSteps: maxSteps ?? 10,
    sessionId,
    sessionName: "api-chat",
    goal: "API chat session",
  })

  return { engine, config }
}

export async function handleChatRoutes(req: ApiRequest, config: ApiServerConfig): Promise<Response | null> {
  const { method, pathname } = req

  // ── POST /api/v1/chat ──────────────────────────────────────────────
  if (pathname === "/api/v1/chat" && method === "POST") {
    const parseResult = ChatRequestSchema.safeParse(req.body)
    if (!parseResult.success) {
      return jsonResponse(400, {
        error: parseResult.error.issues.map((i) => i.message).join("; "),
      }, config, req)
    }

    const { message, provider, model, stream, history, agentType, maxSteps, temperature } = parseResult.data

    let engine: AgentEngine | null = null
    let aiConfig: ReturnType<typeof resolveAutoAIConfig> | null = null

    try {
      const built = buildEngine(provider, model, agentType, maxSteps, temperature)
      engine = built.engine
      aiConfig = built.config
    } catch (err) {
      return jsonResponse(503, {
        error: err instanceof Error ? err.message : "Failed to initialize AI provider",
        code: "NO_PROVIDER",
      }, config, req)
    }

    // Build message array from history + current message
    const messages: ModelMessage[] = [
      ...history.map((h) => ({ role: h.role as "user" | "assistant" | "system", content: h.content })),
      { role: "user" as const, content: message },
    ]

    // ── Streaming response (SSE) ──────────────────────────────────
    if (stream) {
      const encoder = new TextEncoder()
      let aborted = false

      const readable = new ReadableStream({
        async start(controller) {
          try {
            let fullText = ""
            await engine!.streamChat(messages, {
              onChunk: (chunk) => {
                if (aborted) return
                fullText += chunk
                try {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`),
                  )
                } catch {
                  aborted = true
                }
              },
            })
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "done", text: fullText })}\n\n`),
            )
            controller.close()
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Unknown error"
            log.error("Chat stream error", { error: errMsg })
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "error", error: errMsg })}\n\n`),
              )
              controller.close()
            } catch {
              // stream already closed
            }
          } finally {
            // Clean up engine after stream completes or fails
            if (engine) {
              engine.completeSession("completed").catch((e) =>
                log.warn("Failed to complete session after stream", { error: String(e) }),
              )
            }
          }
        },
        cancel() {
          aborted = true
        },
      })

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "X-Provider": aiConfig!.provider,
          "X-Model": aiConfig!.model,
        },
      })
    }

    // ── Non-streaming response ────────────────────────────────────
    try {
      const result = await engine!.chat(messages)
      log.info("Chat response completed", {
        provider: aiConfig!.provider,
        model: aiConfig!.model,
        responseLength: result.text.length,
      })

      return jsonResponse(200, {
        response: result.text,
        provider: aiConfig!.provider,
        model: aiConfig!.model,
      }, config, req)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "AI provider error"
      log.error("Chat generation failed", { error: errMsg, provider: aiConfig!.provider, model: aiConfig!.model })

      // Distinguish between provider errors and internal errors
      const isProviderError =
        errMsg.includes("API key") ||
        errMsg.includes("rate limit") ||
        errMsg.includes("quota") ||
        errMsg.includes("unauthorized") ||
        errMsg.includes("forbidden")

      return jsonResponse(isProviderError ? 502 : 500, {
        error: errMsg,
        code: isProviderError ? "PROVIDER_ERROR" : "INTERNAL_ERROR",
        provider: aiConfig!.provider,
        model: aiConfig!.model,
      }, config, req)
    } finally {
      // Ensure engine is always cleaned up after non-streaming request
      if (engine) {
        engine.completeSession("completed").catch((e) =>
          log.warn("Failed to complete session after chat", { error: String(e) }),
        )
      }
    }
  }

  // ── GET /api/v1/chat/providers ────────────────────────────────────
  if (pathname === "/api/v1/chat/providers" && method === "GET") {
    const providers = getConfiguredProviders()
    return jsonResponse(200, {
      providers: providers.map((p) => ({
        provider: p.provider,
        model: p.model,
      })),
      configured: providers.length > 0,
    }, config, req)
  }

  return null
}

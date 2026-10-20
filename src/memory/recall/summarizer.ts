/**
 * src/memory/recall/summarizer.ts
 *
 * LLM summarizer that condenses top-k recall hits into a tight
 * <recall_context> block. Falls back to raw hits (truncated to
 * token budget) if the LLM call times out or fails.
 */

import { createLogger } from "../../cli/logger"
import type { AIMessage, AIResponse } from "../../ai/provider"
import type { RecallHit, RecallConfig } from "./types"

const log = createLogger("recall:summarizer")

export interface SummarizerProvider {
  generate(messages: AIMessage[], options?: { abortSignal?: AbortSignal }): Promise<AIResponse>
}

export type SummarizerProviderFactory = () => SummarizerProvider | Promise<SummarizerProvider>

export class Summarizer {
  constructor(
    private config: RecallConfig,
    private providerFactory?: SummarizerProviderFactory,
  ) {}

  /**
   * Summarize recall hits into a context block.
   * Wraps the LLM call in a timeout; on failure returns raw hits.
   */
  async summarize(hits: RecallHit[]): Promise<string> {
    if (hits.length === 0) return ""

    const joined = hits.map((h) => `[${h.role.toUpperCase()}] ${h.content}`).join("\n---\n")

    try {
      const summary = await this.callWithTimeout(joined)
      return `<recall_context>\n${summary}\n</recall_context>`
    } catch (err) {
      log.warn("Summarizer timed out — returning raw hits", { error: String(err) })
      return this.rawFallback(hits)
    }
  }

  /**
   * Call the LLM with a timeout.
   * Uses the AI provider if available, otherwise falls back immediately.
   */
  private async callWithTimeout(context: string): Promise<string> {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error("timeout"))
      }, this.config.summarizerTimeoutMs)
    })

    try {
      const provider = await this.resolveProvider()

      const response = await Promise.race([
        provider.generate(
          [
            {
              role: "system",
              content:
                "You are summarizing prior conversation context for an AI agent. Be terse. Preserve entities, decisions, and unresolved questions. Output ONLY the summary, no preamble.",
            },
            { role: "user", content: context },
          ],
          { abortSignal: controller.signal },
        ),
        timeoutPromise,
      ])

      return response.text ?? ""
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("timeout")
      }
      throw err
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private async resolveProvider(): Promise<SummarizerProvider> {
    if (this.providerFactory) {
      return await this.providerFactory()
    }

    const { createAIProvider } = await import("../../ai/provider")
    return createAIProvider({
      provider: "openrouter",
      model: "claude-sonnet-4-6",
      maxOutputTokens: this.config.summaryTokenBudget,
    })
  }

  /**
   * Fallback: truncate raw hits to fit within the token budget.
   */
  private rawFallback(hits: RecallHit[]): string {
    const raw = hits.map((h) => `[${h.role.toUpperCase()}] ${h.content}`).join("\n")

    // Rough token estimation (4 chars per token)
    const budget = this.config.summaryTokenBudget * 4
    const truncated = raw.length > budget ? raw.slice(0, budget) + "\n[... truncated]" : raw

    return `<recall_context>\n${truncated}\n</recall_context>`
  }
}

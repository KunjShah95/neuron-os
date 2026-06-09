/**
 * src/memory/recall/summarizer.ts
 *
 * LLM summarizer that condenses top-k recall hits into a tight
 * <recall_context> block. Falls back to raw hits (truncated to
 * token budget) if the LLM call times out or fails.
 */

import { createLogger } from "../../cli/logger"
import type { RecallHit, RecallConfig } from "./types"

const log = createLogger("recall:summarizer")

export class Summarizer {
  constructor(private config: RecallConfig) {}

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
    const timeout = setTimeout(() => controller.abort(), this.config.summarizerTimeoutMs)

    try {
      // Try using the AI provider
      const { createAIProvider } = await import("../../ai/provider")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider: any = createAIProvider({ provider: "openrouter", model: "claude-sonnet-4-6" })

      const response = await provider.complete({
        system:
          "You are summarizing prior conversation context for an AI agent. Be terse. Preserve entities, decisions, and unresolved questions. Output ONLY the summary, no preamble.",
        prompt: context,
        maxTokens: this.config.summaryTokenBudget,
        signal: controller.signal,
      })

      return response.text ?? ""
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("timeout")
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }
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

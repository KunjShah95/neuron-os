import { streamText } from "ai"
import { AIProviderManager } from "../ai"
import type { AIConfig } from "../ai"
import { createLogger } from "../cli/logger"
import type { ModelMessage } from "ai"

const log = createLogger("precompact")

export interface CompactedState {
  summary: string
  originalTurnCount: number
  compactedAt: number
}

export interface PreCompactConfig {
  /** Token threshold at which compaction fires (default 150000) */
  thresholdTokens: number
  /** Max tokens per compaction (approximate, default 4000) */
  maxCompactTokens: number
  /** Model to use for summarization (default: haiku-class for cheap) */
  compactModel?: string
  /** Provider manager to use for compaction model */
  provider?: AIProviderManager
}

const DEFAULT_CONFIG: PreCompactConfig = {
  thresholdTokens: 150_000,
  maxCompactTokens: 4_000,
}

/**
 * Approximate token count from text (4 chars per token).
 * Used as a cheap heuristic when provider usage data is unavailable.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Estimate token count from messages array.
 */
export function estimateMessagesTokens(messages: ModelMessage[]): number {
  let total = 0
  for (const m of messages) {
    if (typeof m.content === "string") {
      total += estimateTokens(m.content)
    }
    total += 4
  }
  return total
}

/**
 * Fire a PreCompact hook: summarize older conversation turns into a compact
 * "prior_state" block so new observations still fit in context.
 *
 * Returns an array of messages with older turns replaced by a compact summary,
 * plus the compacted state metadata.
 */
export async function compactMessages(
  messages: ModelMessage[],
  config: PreCompactConfig = DEFAULT_CONFIG,
  provider?: AIProviderManager,
): Promise<{
  compacted: ModelMessage[]
  state: CompactedState
  tokensSaved: number
}> {
  const threshold = config.thresholdTokens ?? DEFAULT_CONFIG.thresholdTokens
  const estimated = estimateMessagesTokens(messages)
  log.debug("PreCompact check", { estimatedTokens: estimated, threshold })

  if (estimated < threshold) {
    return {
      compacted: messages,
      state: { summary: "", originalTurnCount: 0, compactedAt: 0 },
      tokensSaved: 0,
    }
  }

  const midpoint = Math.floor(messages.length * 0.4)
  const olderMessages = messages.slice(0, midpoint)
  const newerMessages = messages.slice(midpoint)

  if (olderMessages.length < 2) {
    return {
      compacted: messages,
      state: { summary: "", originalTurnCount: 0, compactedAt: 0 },
      tokensSaved: 0,
    }
  }

  const olderText = olderMessages
    .map((m) => {
      const role = m.role
      let content = ""
      if (typeof m.content === "string") content = m.content
      else if (Array.isArray(m.content)) content = JSON.stringify(m.content)
      return `[${role}]: ${content.slice(0, 2000)}`
    })
    .join("\n\n")

  let summary = ""
  try {
    if (provider) {
      const compactCfg: Partial<AIConfig> = {}
      if (config.compactModel) {
        compactCfg.model = config.compactModel
      }
      const model = provider.getModel(
        Object.keys(compactCfg).length > 0 ? (compactCfg as AIConfig) : undefined,
      )
      const result = await streamText({
        model,
        system: "You are a context compaction agent. Summarize the following conversation turns into a concise 'prior state' block. Preserve: the goal, completed steps, key decisions, blockers, and any important data discovered. Output ONLY the summary, no preamble.",
        messages: [{ role: "user", content: `Summarize these conversation turns:\n\n${olderText}` }],
        temperature: 0.3,
      })
      for await (const chunk of result.textStream) {
        summary += chunk
      }
    } else {
      summary = `[Prior context: ${olderMessages.length} turns compacted. Key topics include: ${olderMessages.filter((m) => m.role === "user").slice(0, 3).map((m) => {
        const c = typeof m.content === "string" ? m.content : ""
        return c.length > 80 ? c.slice(0, 80) + "..." : c
      }).join("; ")}]`
    }
  } catch (err) {
    log.warn("PreCompact summarization failed, using heuristic fallback", { error: String(err) })
    summary = `[Prior context: ${olderMessages.length} turns compacted at ${new Date().toISOString()}]`
  }

  const maxTokens = config.maxCompactTokens ?? DEFAULT_CONFIG.maxCompactTokens
  if (estimateTokens(summary) > maxTokens) {
    summary = summary.slice(0, maxTokens * 4) + "\n[...truncated]"
  }

  const compacted: ModelMessage[] = [
    { role: "system" as const, content: `[PRIOR STATE — compacted from ${olderMessages.length} earlier turns]\n${summary}` },
    ...newerMessages,
  ]

  const tokensSaved = estimateTokens(olderText) - estimateTokens(summary)

  return {
    compacted,
    state: {
      summary,
      originalTurnCount: olderMessages.length,
      compactedAt: Date.now(),
    },
    tokensSaved,
  }
}

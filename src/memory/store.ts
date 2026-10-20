import type { ModelMessage } from "ai"
import { getProjectSessionStore, sessionStore, type SessionStore } from "./session-persistence"
import { createLogger } from "../cli/logger"

const log = createLogger("episodic-memory")

export class EpisodicMemory {
  private store: SessionStore

  constructor(project?: string, store?: SessionStore) {
    this.store = store ?? (project ? getProjectSessionStore(project) : sessionStore)
  }

  /**
   * Loads the message history for a given session, formatting it as
   * Vercel AI SDK ModelMessage objects so an agent can seamlessly
   * resume its context after a crash or restart.
   */
  public loadContext(sessionId: string, limit = 100): ModelMessage[] {
    const session = this.store.getSession(sessionId)
    if (!session) return []

    const messages = this.store.getMessages(sessionId, limit)
    const modelMessages: ModelMessage[] = []

    for (const msg of messages) {
      if (msg.role === "tool") {
        try {
          const content = JSON.parse(msg.content)
          modelMessages.push({ role: msg.role, content } as ModelMessage)
        } catch {
          modelMessages.push({
            role: msg.role,
            content: [{ type: "tool-result", toolName: "unknown", toolCallId: "unknown", result: msg.content }],
          } as unknown as ModelMessage)
        }
      } else if (msg.role === "assistant" && msg.toolCalls) {
        try {
          JSON.parse(msg.toolCalls)
          // If the assistant message contains tool calls, the content needs to be an array
          modelMessages.push({
            role: "assistant",
            content: msg.content,
            // Note: Vercel AI SDK usually expects tool calls mixed into content or as separate fields
            // depending on the version. We'll store it as text for now, or parsed if supported.
          } as ModelMessage)
        } catch {
          modelMessages.push({ role: msg.role, content: msg.content } as ModelMessage)
        }
      } else {
        modelMessages.push({ role: msg.role as "user" | "assistant" | "system", content: msg.content })
      }
    }

    return modelMessages
  }

  /**
   * Prune old messages from a session's context, keeping only the
   * most recent N messages. Older messages are deleted from the
   * session store so the persisted context does not grow unbounded.
   */
  public pruneContext(sessionId: string, keepLast = 20): void {
    const total = this.store.getMessageCount(sessionId)
    if (total <= keepLast) return

    const pruneCount = total - keepLast
    const oldestIds = this.store.getOldestMessageIds(sessionId, pruneCount)
    log.warn(`Pruning ${pruneCount} old messages from session ${sessionId} (${total} → ${keepLast})`)

    this.store.deleteMessages(oldestIds)

    log.warn(`Context pruned: kept last ${keepLast} of ${total} messages for session ${sessionId}`)
  }
}

export const episodicMemory = new EpisodicMemory()

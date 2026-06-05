import type { ModelMessage } from "ai"
import { getProjectSessionStore, sessionStore, type SessionStore } from "./session-persistence"

export class EpisodicMemory {
  private store: SessionStore

  constructor(project?: string) {
    this.store = project ? getProjectSessionStore(project) : sessionStore
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
          modelMessages.push({ role: msg.role, content: [{ type: "tool-result", toolName: "unknown", toolCallId: "unknown", result: msg.content }] } as any as ModelMessage)
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
   * Helper to clear or archive context if it gets too large
   */
  public pruneContext(_sessionId: string, _keepLast = 20): void {
     // TODO: Implement selective pruning/summarization
  }
}

export const episodicMemory = new EpisodicMemory()

import { auditStore } from "./store"

export class AuditQueryEngine {
  /**
   * Search the audit log using a simple keyword search across summary and detail.
   * In a real Software 3.0 world, this could use embeddings/vector search.
   */
  public search(query: string, limit = 50): any[] {
    // This is a naive substring search. For true natural language, you'd integrate an LLM
    // to map the query "Why did the agent delete my file?" -> SQL or Vector Query.
    const lowerQuery = query.toLowerCase()

    // Get recent 1000 events and filter
    const recent = auditStore.getRecent(1000)

    return recent
      .filter(
        (entry) =>
          entry.summary.toLowerCase().includes(lowerQuery) ||
          entry.detail.toLowerCase().includes(lowerQuery) ||
          entry.agentThought.toLowerCase().includes(lowerQuery),
      )
      .slice(0, limit)
  }

  public getSessionHistory(sessionId: string) {
    return auditStore.getSessionAudit(sessionId)
  }
}

export const auditDb = new AuditQueryEngine()

import { auditStore } from "./store"

export class AuditQueryEngine {
  /**
   * Search the audit log with SQL-level LIKE filtering across summary, detail,
   * and agentThought. Supports pagination via offset.
   */
  public search(query: string, limit = 50, offset = 0): Record<string, unknown>[] {
    return auditStore.searchRecords(query, limit, offset) as unknown as Record<string, unknown>[]
  }

  public getSessionHistory(sessionId: string) {
    return auditStore.getSessionAudit(sessionId)
  }
}

export const auditDb = new AuditQueryEngine()

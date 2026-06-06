/** Recall query parameters */
export interface RecallQuery {
  text: string
  maxResults?: number
  maxAgeDays?: number
}

/** A recall hit from the FTS5 index */
export interface RecallHit {
  session_id: string
  turn_id: string
  ts: number
  role: "user" | "assistant" | "tool"
  content: string
  score: number
  finalScore: number
}

/** Configuration for the recall system */
export interface RecallConfig {
  maxResults: number
  maxAgeDays: number
  summaryTokenBudget: number
  summarizerTimeoutMs: number
  fts5Table: string
}

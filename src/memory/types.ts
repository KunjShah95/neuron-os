export interface MemoryEntry {
  content: string
  timestamp: string
  source: "memory" | "daily" | "auto" | "user"
  category?: string
}

export interface MemoryContext {
  agentId: string
  agentType?: string
  cwd: string
}

export interface ExtractedFact {
  fact: string
  category: "preference" | "project" | "identity" | "workflow" | "relationship" | "decision"
  confidence: number
  timestamp: string
}

export interface UserProfile {
  name?: string
  communicationStyle?: string
  preferences: string[]
  neverDo: string[]
  role?: string
  expertise?: string[]
}

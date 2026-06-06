export { memorySystem, MemorySystem, getProjectMemorySystem } from "./system"
export { vectorMemory, VectorMemory } from "./vector"
export { agentMemory, AgentMemoryConnector } from "./agentmemory"
export type { AgentMemoryConfig, SearchResult, SessionSummary, Health, Stats } from "./agentmemory"
export type { MemoryEntry, MemoryContext, ExtractedFact, UserProfile } from "./types"
export type { VectorEntry } from "./vector"
export { sessionStore, SessionStore } from "./session-persistence"
export type { SessionRecord, SessionMessage } from "./session-persistence"

// FTS5 recall module
export { FTS5Indexer, FTS5Retriever, Summarizer, ensureFTS5Schema, DEFAULT_RECALL_CONFIG } from "./recall"
export type { RecallHit, RecallQuery, RecallConfig } from "./recall"

// Unified memory query engine
export { UnifiedMemoryQuery } from "./unified-query"
export type { UnifiedResult, UnifiedQuery, UnifiedStoreStats } from "./unified-query"

// Dialectic user model
export { DialecticEngine, dialecticEngine } from "./user-model/dialectic"
export { HonchoAdapter, honchoAdapter } from "./user-model/honcho-adapter"
export type { UserModel, DialecticProposal, DialecticResult, HonchoSyncResult, UserPreference, RecurringTopic, AuditEntry } from "./user-model/types"
export { EMPTY_USER_MODEL } from "./user-model/types"

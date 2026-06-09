import type { ExperienceRecord } from "../experience/store"

export type DreamType = "memory-replay" | "pattern-discovery" | "knowledge-compression" | "counterfactual" | "social-gossip" | "shared-dream-consolidation" | "mood-consolidation"

export type DreamStatus = "pending" | "processing" | "completed" | "failed"

export type DreamVividness = "vivid" | "moderate" | "faint"

export interface DreamEntry {
  id: string
  agentType: string
  agentId: string
  type: DreamType
  status: DreamStatus
  vividness: DreamVividness
  startedAt: string
  completedAt: string | null
  durationMs: number
  sourceIds: string[]
  summary: string
  narrative: string
  insightIds: string[]
  metadata: string
}

export interface DreamInsight {
  id: string
  dreamId: string
  type: "pattern" | "counterfactual" | "correlation" | "compression" | "synthesis"
  title: string
  description: string
  confidence: number
  sourceCount: number
  actionable: boolean
  applied: boolean
  createdAt: string
}

export interface DreamConfig {
  enabled: boolean
  minIdleMinutes: number
  maxDreamDurationMs: number
  memoryReplay: { enabled: boolean; sampleSize: number; minSimilarity: number }
  patternDiscovery: { enabled: boolean; minClusterSize: number; lookbackHours: number }
  knowledgeCompression: { enabled: boolean; maxEntries: number; ttlDays: number }
  counterfactual: { enabled: boolean; maxAlternatives: number }
  socialGossip: { enabled: boolean; peerDiscoveryIntervalMs: number }
}

export const DEFAULT_DREAM_CONFIG: DreamConfig = {
  enabled: true,
  minIdleMinutes: 5,
  maxDreamDurationMs: 30000,
  memoryReplay: { enabled: true, sampleSize: 20, minSimilarity: 0.15 },
  patternDiscovery: { enabled: true, minClusterSize: 3, lookbackHours: 72 },
  knowledgeCompression: { enabled: true, maxEntries: 50, ttlDays: 30 },
  counterfactual: { enabled: true, maxAlternatives: 3 },
  socialGossip: { enabled: false, peerDiscoveryIntervalMs: 60000 },
}

export interface DreamCycleReport {
  cycleId: string
  startedAt: string
  completedAt: string
  durationMs: number
  dreamsCreated: number
  insightsGenerated: number
  memoryReplayCount: number
  patternCount: number
  compressionCount: number
  counterfactualCount: number
  sharedDreamCount?: number
  moodConsolidationCount?: number
  topInsights: DreamInsight[]
}

export interface MemoryReplayResult {
  replayedExperiences: ExperienceRecord[]
  patternsFound: string[]
  anomalies: string[]
  crossCorrelations: Array<{ source: string; target: string; correlation: number }>
}

export interface PatternDiscoveryResult {
  clusters: Array<{ key: string; count: number; commonElements: string[]; novelty: number }>
  emergentPatterns: Array<{
    name: string
    description: string
    confidence: number
    evidence: string[]
  }>
}

export interface CompressionResult {
  originalCount: number
  compressedCount: number
  compressionRatio: number
  preservedConcepts: string[]
  lostConcepts: string[]
}

export interface CounterfactualResult {
  alternatives: Array<{
    scenario: string
    probability: number
    insight: string
  }>
}

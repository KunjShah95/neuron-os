export type MutationTarget = "source" | "skill" | "config" | "test"

export type MutationStrategy =
  | "refactor"
  | "optimize"
  | "bugfix"
  | "error-handling"
  | "type-improvement"
  | "performance"
  | "security"
  | "readability"

export type MutationStatus = "proposed" | "applying" | "verifying" | "passed" | "failed" | "rolled-back" | "applied"

export interface CodeMutation {
  id: string
  filePath: string
  strategy: MutationStrategy
  description: string
  diff: string
  oldContent: string
  newContent: string
  status: MutationStatus
  confidence: number
  sourceInsight: string
  sourceDreamId: string
  sourceFailureIds: string[]
  testResults: string
  testPassed: boolean
  testDurationMs: number
  createdAt: string
  appliedAt: string
  rollbackAt: string
}

export interface EvolutionConfig {
  enabled: boolean
  autoPropose: boolean
  autoApplyLowRisk: boolean
  maxConcurrentMutations: number
  confidenceThreshold: number
  requireTestPass: boolean
  allowedDirs: string[]
  strategies: MutationStrategy[]
}

export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  enabled: true,
  autoPropose: false,
  autoApplyLowRisk: false,
  maxConcurrentMutations: 3,
  confidenceThreshold: 0.6,
  requireTestPass: true,
  allowedDirs: ["src"],
  strategies: ["refactor", "error-handling", "type-improvement", "bugfix"],
}

export interface EvolutionStats {
  totalMutations: number
  appliedMutations: number
  failedMutations: number
  rolledBackMutations: number
  averageConfidence: number
  passRate: number
  mutationsByStrategy: Record<string, number>
  topFiles: Array<{ path: string; count: number }>
  lastCycleAt: string
}

export interface EvolutionCycleReport {
  cycleId: string
  startedAt: string
  completedAt: string
  durationMs: number
  mutationsProposed: number
  mutationsApplied: number
  mutationsFailed: number
  insightsConsumed: number
  failuresConsumed: number
}

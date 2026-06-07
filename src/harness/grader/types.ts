/**
 * src/harness/grader/types.ts
 *
 * Grader-specific configuration types for the multi-grader evaluation engine.
 */

import type { GradeResult } from "../types"

// ── Grader Suite Config ──────────────────────────────────────────

export interface GraderSuiteConfig {
  /** Which graders to run. Default: all available */
  enabledGraders?: ("deterministic" | "llm" | "code")[]

  /** Default weights per grader type (can be overridden per test) */
  defaultWeights?: {
    deterministic: number // 0.3
    llm: number // 0.5
    code: number // 0.2
  }

  /** Minimum thresholds — any grader below this caps the composite score */
  thresholds?: {
    deterministic: number // 0.5
    llm: number // 0.3
    code: number // 0.3
  }

  /** Composite scoring strategy */
  strategy?: "weighted_average" | "min" | "geometric_mean"

  /** LLM judge configuration */
  llmConfig?: {
    provider?: string
    model?: string
    fallbackModel?: string
    apiKey?: string
    /** Judge models for multi-judge consensus */
    judgeModels?: Array<{ model: string; weight: number; provider?: string }>
  }

  /** Working directory for code graders (sandbox path) */
  workDir?: string

  /** Skip LLM graders (for cost savings) */
  skipLLM?: boolean
}

// ── Deterministic Grader Config ─────────────────────────────────

export interface DeterministicGraderConfig {
  stringMatch?: {
    pattern: string
    mode: "contains" | "regex" | "exact"
    caseSensitive?: boolean
  }
  fileCheck?: {
    filesExist?: string[]
    filesNotExist?: string[]
    filesContent?: Record<string, string | RegExp>
    maxFileSize?: number
  }
  exitCode?: {
    expected: number
    command?: string
  }
  tokenBudget?: {
    maxTokens: number
  }
  stepBudget?: {
    maxSteps: number
  }
  diffCheck?: {
    maxLinesChanged: number
    allowedPatterns?: string[]
  }
}

// ── LLM Grader Config ───────────────────────────────────────────

export interface LLMGraderConfig {
  /** Model to use for judging */
  model?: string
  /** Fallback model */
  fallbackModel?: string
  /** Provider (e.g. "openrouter", "anthropic", "openai") */
  provider?: string
  /** API key override */
  apiKey?: string
  /** Number of judge calls to make (for multi-judge consensus) */
  numJudges?: number
  /** Judge models for multi-judge consensus */
  judgeModels?: Array<{ model: string; weight: number }>
  /** Custom rubric instructions */
  rubric?: string
  /** Criteria to evaluate */
  criteria?: Array<{
    name: string
    description: string
    weight?: number
  }>
  /** Output format: "score_only" or "detailed" */
  outputFormat?: "score_only" | "detailed"
}

// ── Code Grader Config ──────────────────────────────────────────

export interface CodeGraderConfig {
  /** TypeScript typecheck */
  typechecks?: {
    command: string
    workDir?: string
  }
  /** Run tests */
  tests?: {
    command: string
    expectedPassCount?: number
    workDir?: string
  }
  /** Linting */
  lints?: {
    command: string
    maxWarnings?: number
    maxErrors?: number
    workDir?: string
  }
  /** Custom script checks */
  custom?: Array<{
    name: string
    command: string
    onSuccess: number
    onFailure: number
    workDir?: string
  }>
}

// ── Composite Scoring Config ────────────────────────────────────

export interface CompositeScoringConfig {
  defaultWeights: {
    deterministic: number
    llm: number
    code: number
  }
  thresholds: {
    deterministic: number
    llm: number
    code: number
  }
  strategy: "weighted_average" | "min" | "geometric_mean"
}

// ── Calibration Types ───────────────────────────────────────────

export interface CalibrationExample {
  id: string
  task: string
  agentOutput: string
  expectedScore: number
  category?: string
  verifiedBy?: string
}

export interface CalibrationResult {
  accuracy: number
  meanError: number
  stdDev: number
  positionBias: number
  lengthBias: number
  cohensKappa: number
  recommendations: string[]
  sampleSize: number
}

export interface DriftReport {
  detected: boolean
  previousAccuracy: number
  currentAccuracy: number
  delta: number
  severity: "none" | "minor" | "major" | "critical"
  recommendation: string
}

export interface JudgePerformanceSnapshot {
  timestamp: string
  accuracy: number
  meanError: number
  sampleSize: number
}

// ── Grader Function Signature ───────────────────────────────────

export type GraderFn = (
  output: string,
  config: DeterministicGraderConfig | LLMGraderConfig | CodeGraderConfig,
  context?: GraderContext,
) => Promise<GradeResult> | GradeResult

export interface GraderContext {
  testId: string
  testName: string
  trace?: Array<{ name: string; params: Record<string, unknown>; result: string }>
  sandboxSnapshot?: {
    before: string[]
    after: string[]
    created: string[]
    modified: string[]
    deleted: string[]
  }
  workDir?: string
  expected?: {
    pattern?: string
    filesExist?: string[]
    filesNotExist?: string[]
    maxSteps?: number
    maxTokens?: number
  }
}

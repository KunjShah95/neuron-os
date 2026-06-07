// ── Test Category ─────────────────────────────────────────────────

export type TestCategory =
  | "smoke"          // Fast sanity checks (run on every commit)
  | "regression"     // Known-pass tests (detect regressions)
  | "capability"     // New capability validation
  | "adversarial"    // Security/robustness tests
  | "benchmark"      // Performance/cost benchmarks
  | "golden"         // Human-verified golden set

export type TestPriority = "critical" | "high" | "medium" | "low"

// ── Test Definition ──────────────────────────────────────────────

export interface TestCase {
  id: string
  name: string
  description?: string
  prompt: string
  category?: TestCategory
  priority?: TestPriority
  tags: string[]                // e.g. ["coding", "typescript", "file-ops"]
  timeout: number               // ms (default: 120000)

  // Expected outcomes (optional — any subset can be defined)
  expected?: {
    pattern?: string            // Expected substring or regex in output
    exitCode?: number           // Expected process exit code
    filesExist?: string[]       // Files that should exist after agent run
    filesNotExist?: string[]    // Files that should NOT exist
    maxSteps?: number           // Fail if agent takes more steps than this
    maxTokens?: number          // Fail if agent exceeds token budget
    minScore?: number           // Minimum score from grader (0.0–1.0)
  }

  // Sandbox setup
  setup?: {
    commands: string[]          // Shell commands to run before test
    files: Record<string, string>  // Files to create (path → content)
    env?: Record<string, string>   // Environment variables to set
  }
  cleanup?: boolean             // Reset sandbox after test (default: true)

  // Execution overrides
  model?: string                // Override default model for this test
  agentType?: string            // Override default agent type
  graderWeights?: Record<string, number>  // Per-grader weight overrides

  // Dependencies
  dependsOn?: string[]          // Test IDs that must pass first

  // Metadata
  author?: string
  createdAt?: string
  updatedAt?: string
}

// ── Execution Types ──────────────────────────────────────────────

export interface EvalResult {
  test: TestCase
  passed: boolean
  score: number                 // Composite score 0.0–1.0
  grades: GradeResult[]         // Individual grade breakdown
  output: string                // Full agent output text
  trace: ToolTrace[]            // All tool calls during execution
  steps: number
  totalTokens: number
  totalCost: number             // USD cost estimate
  durationMs: number
  error?: string
  model: string
  agentType: string
  timestamp: string             // ISO 8601
  metadata: Record<string, unknown>
  sandboxSnapshot?: SandboxSnapshot  // File state before/after
}

export interface ToolTrace {
  name: string                  // Tool name (e.g. "bash", "read", "write")
  params: Record<string, unknown>
  result: string
  durationMs: number
  tokenCost?: number
  timestamp?: string
}

export interface SandboxSnapshot {
  before: string[]              // Files present before agent run
  after: string[]               // Files present after agent run
  created: string[]             // Files that were created
  modified: string[]            // Files that were modified
  deleted: string[]             // Files that were deleted
  gitDiff?: string              // Raw git diff if git repo
}

export interface GradeResult {
  name: string                  // e.g. "string-match", "llm-judge", "typecheck"
  grader: GraderType
  score: number                 // 0.0–1.0
  weight: number                // Contribution to composite score
  details?: string              // Human-readable explanation
  confidence?: number           // Judge's confidence in this score
}

export type GraderType = "deterministic" | "llm" | "code" | "human"

// ── Report Types ─────────────────────────────────────────────────

export interface EvalReport {
  id: string
  timestamp: string
  model: string
  agentType: string
  suite: string
  totalTests: number
  passed: number
  failed: number
  avgScore: number
  totalCost: number
  totalDurationMs: number
  results: EvalResult[]
  byCategory: Record<TestCategory, {
    total: number
    passed: number
    avgScore: number
  }>
  regressions: Regression[]
  baselineComparison?: BaselineComparison
  metadata: Record<string, unknown>
}

export interface Regression {
  testId: string
  testName: string
  baselineScore: number
  currentScore: number
  drop: number                  // baseline - current
  severity: "minor" | "major" | "critical"
}

export interface BaselineComparison {
  baselineId: string
  baselineDate: string
  overallScoreDelta: number
  categoryDeltas: Record<string, number>
  regressions: Regression[]
  improvements: Regression[]    // Negative regression = improvement
}

// ── Runner Types ─────────────────────────────────────────────────

export interface RunnerConfig {
  concurrency: number           // Parallel test count (default: os.cpus().length)
  mode: "sequential" | "parallel" | "sharded"
  shard?: { index: number; total: number }  // For distributed execution
  timeout: number               // Per-test timeout
  retryCount: number            // Retry flaky tests (default: 0)
  retryDelay: number            // Delay between retries (default: 1000ms)
  failureThreshold: number      // Stop after N failures (default: Infinity)
  signal?: AbortSignal
  sandboxConfig?: Partial<SandboxConfig>
}

export interface SandboxConfig {
  type: "filesystem" | "docker"
  workDir: string
  keepAfterTest?: boolean
  envVars?: Record<string, string>
  timeout?: number
}

// ── Test Filter ──────────────────────────────────────────────────

export interface TestFilter {
  category?: TestCategory | TestCategory[]
  tags?: { include?: string[]; exclude?: string[]; mode?: "and" | "or" }
  priority?: TestPriority | TestPriority[]
  namePattern?: string          // Regex pattern
  idPattern?: string            // Glob pattern for test IDs
}

// ── Budget Types (from §3.6) ─────────────────────────────────────

export interface BudgetConfig {
  maxCostUsd: number
  maxCostPerTest: number
  warnAtPercent: number
}

// ── Sandbox Policy Types (from §3.8) ─────────────────────────────

export interface SandboxPolicy {
  networkAccess: "none" | "outbound-only" | "full"
  allowedDomains?: string[]
  blockedDomains?: string[]
  filesystem: "isolated" | "read-only-host" | "full-host"
  allowedReadPaths?: string[]
  writablePaths?: string[]
  maxFileSize: number
  allowSubprocesses: boolean
  allowedCommands?: RegExp[]
  blockedCommands?: RegExp[]
  maxProcesses: number
  injectEnvVars?: Record<string, string>
  secretDetection: boolean
  secretPatterns?: RegExp[]
  cpuLimit: string
  memoryLimit: string
  diskLimit: string
}

// ── Flaky Test Types (from §3.10) ────────────────────────────────

export interface FlakyConfig {
  flakyThreshold: number
  quarantineAfterFlakes: number
  maxRetries: number
  flakyHistorySize: number
}

export interface FlakyTestRecord {
  testId: string
  totalRuns: number
  flakyRuns: number
  consecutiveFlakes: number
  lastFlakyDate: string
  flakeHistory: Array<{
    runId: string
    firstAttemptScore: number
    retryScore: number
    timestamp: string
  }>
  status: "healthy" | "flaky" | "quarantined"
}

// ── Budget Controller Types (from §3.6) ──────────────────────────

export interface BudgetTier {
  model: string
  maxCostUsd: number
  fallbackOnFailure?: boolean
  weight: number
}

export interface BudgetStatus {
  spent: number
  remaining: number
  percentUsed: number
}

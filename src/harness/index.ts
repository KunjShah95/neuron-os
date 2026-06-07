// ── Types ────────────────────────────────────────────────────────
export type {
  TestCase,
  EvalResult,
  EvalReport,
  ToolTrace,
  SandboxSnapshot,
  GradeResult,
  GraderType,
  Regression,
  BaselineComparison,
  TestCategory,
  TestPriority,
  TestFilter,
  RunnerConfig,
  SandboxConfig,
  SandboxPolicy,
  BudgetConfig,
  BudgetStatus,
  BudgetTier,
  FlakyConfig,
  FlakyTestRecord,
} from "./types"

// ── Discovery ────────────────────────────────────────────────────
export { TestDiscoverer, discoverTests } from "./discover"

// ── Runner ───────────────────────────────────────────────────────
export { runTest, runSuite } from "./runner"
export type { HarnessRunnerConfig } from "./runner"

// ── Reporter ─────────────────────────────────────────────────────
export {
  generateReport,
  generateJsonReport,
  generateMarkdownReport,
  generateHtmlReport,
  writeReports,
  writeReport,
  streamResult,
} from "./reporter"

// ── Budget Controller ────────────────────────────────────────────
export { BudgetController, BudgetExceededError } from "./budget-controller"
export type { BudgetControllerConfig } from "./budget-controller"

// ── Fixtures ─────────────────────────────────────────────────────
export { FixtureManager } from "./fixtures"
export type { TestFixture, FixtureOutput } from "./fixtures"

// ── Sandbox ──────────────────────────────────────────────────────
export { HarnessSandboxManager } from "./sandbox"
export type { SandboxHandle } from "./sandbox"

// ── Sandbox Policy ───────────────────────────────────────────────
export { SandboxPolicyManager, SANDBOX_POLICIES } from "./sandbox-policy"

// ── Flaky Manager ────────────────────────────────────────────────
export { FlakyManager } from "./flaky-manager"

// ── Grader Suite (Phase 2) ──────────────────────────────────────
export { GraderSuite, getGraderSuite, DEFAULT_GRADER_SUITE_CONFIG } from "./grader"
export type { GraderSuiteConfig, GraderContext } from "./grader/types"
export {
  deterministicGrade,
  stringMatchGrader,
  fileCheckGrader,
  exitCodeGrader,
  stepCountGrader,
  tokenBudgetGrader,
  diffGrader,
} from "./grader/deterministic"
export { rubricGrader, safetyGrader, compareGrader, multiJudgeConsensus } from "./grader/llm"
export { typeCheckGrader, testGrader, lintGrader, customScriptGrader } from "./grader/code"
export { computeCompositeScore, isPassing, normalizeWeights, DEFAULT_COMPOSITE_CONFIG } from "./grader/composite"
export { JudgeCalibration, createDefaultCalibrationSet } from "./grader/calibration"
export type {
  DeterministicGraderConfig,
  LLMGraderConfig,
  CodeGraderConfig,
  CompositeScoringConfig,
  CalibrationExample,
  CalibrationResult,
  DriftReport,
} from "./grader/types"

// ── Distributed Runner (Phase 3) ────────────────────────────────
export { TestSharder } from "./test-sharder"
export type { ShardStrategy, ShardStrategyType, ShardResult } from "./test-sharder"
export { DistributedEvalRunner, registerEvalWorker } from "./distributed-runner"
export type {
  DistributedEvalConfig,
  WorkerTaskPayload,
  WorkerTaskResult,
  EvalWorkerOptions,
} from "./distributed-runner"

// ── Baseline Manager (Phase 4) ───────────────────────────────────
export { BaselineManager } from "./baseline"
export type { Baseline, BaselineManagerConfig, ScoreTrend, BurnRateReport } from "./baseline"

// ── CI Gate (Phase 4) ────────────────────────────────────────────
export { CIGate } from "./ci-gate"
export type { CIGateConfig, CIGateResult } from "./ci-gate"

// ── Comparison Reporter (Phase 4) ────────────────────────────────
export { ComparisonReportGenerator } from "./reporter-comparison"
export type { ComparisonReport } from "./reporter-comparison"

// ── Experiment Manager (Phase 4) ────────────────────────────────
export { ExperimentManager } from "./experiment"
export type { Experiment, ExperimentConfig, ExperimentComparison, GitSnapshot } from "./experiment"

// ── HITL Review (Phase 4) ───────────────────────────────────────
export { HITLReviewManager } from "./hitl-review"
export type { ReviewTicket, ReviewStatus, ReviewResolution, HITLConfig } from "./hitl-review"

// ── Multi-Agent Orchestration (Phase 7) ────────────────────────────
export { MULTI_AGENT_SCENARIOS, createMultiAgentTest } from "./multi-agent"
export type {
  CoordinationPattern,
  MultiAgentRole,
  HandoffConfig,
  ConsensusConfig,
  MultiAgentTest,
  MultiAgentMetric,
  CoordinationMetrics,
  MultiAgentEvalReport,
  AgentMetrics,
} from "./multi-agent"
export { MultiAgentMetricCollector, multiAgentCollector } from "./multi-agent-collector"

// ── Golden Dataset (Phase 8) ─────────────────────────────────────
export { GoldenDatasetManager, goldenDatasetManager } from "./golden-dataset"
export type {
  GoldenTask,
  GoldenTaskStatus,
  GoldenDifficulty,
  CrossValidationResult,
  GoldenDatasetStats,
  TrajectoryStep,
  GoldenDatasetConfig,
} from "./golden-dataset"
export { GoldenTaskValidator, goldenTaskValidator } from "./golden-validator"
export type { ValidationModelConfig, TaskValidationResult, BatchValidationReport } from "./golden-validator"

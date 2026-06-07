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
export {
  rubricGrader,
  safetyGrader,
  compareGrader,
  multiJudgeConsensus,
} from "./grader/llm"
export {
  typeCheckGrader,
  testGrader,
  lintGrader,
  customScriptGrader,
} from "./grader/code"
export {
  computeCompositeScore,
  isPassing,
  normalizeWeights,
  DEFAULT_COMPOSITE_CONFIG,
} from "./grader/composite"
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
export type { DistributedEvalConfig, WorkerTaskPayload, WorkerTaskResult, EvalWorkerOptions } from "./distributed-runner"

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

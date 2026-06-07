/**
 * src/improve/eval-validator.ts
 *
 * Eval-driven skill validation — runs skill candidates through the
 * GraderSuite before they can be published. Ensures extracted skills
 * actually improve agent performance.
 *
 * Flow:
 *   SkillCandidate → create test case → run through harness → grade → pass/fail
 */

import { createLogger } from "../cli/logger"
import type { SkillCandidate } from "./types"
import { GraderSuite, DEFAULT_GRADER_SUITE_CONFIG } from "../harness/grader"
import type { TestCase, EvalResult, GradeResult } from "../harness/types"
import type { GraderContext } from "../harness/grader/types"
import { runTest } from "../harness/runner"

const log = createLogger("improve:eval-validator")

// ── Types ────────────────────────────────────────────────────────

export interface ValidationResult {
  candidate: SkillCandidate
  passed: boolean
  compositeScore: number
  grades: GradeResult[]
  testRun: EvalResult | null
  recommendation: "publish" | "reject" | "review"
  reason: string
  categoryFailures: string[] // Which grader categories failed
}

export interface BatchValidationResult {
  total: number
  passed: number
  failed: number
  results: ValidationResult[]
  summary: {
    avgScore: number
    topCandidates: ValidationResult[]
    avgDurationMs: number
  }
}

export interface ValidationConfig {
  /** Minimum composite score to pass (default: 0.7) */
  minPassScore: number
  /** Whether to run LLM judge (default: true) */
  useLLMJudge: boolean
  /** Whether to run code graders (default: true) */
  useCodeGraders: boolean
  /** Max test duration in ms (default: 60000) */
  testTimeout: number
}

const DEFAULT_CONFIG: ValidationConfig = {
  minPassScore: 0.7,
  useLLMJudge: true,
  useCodeGraders: true,
  testTimeout: 60000,
}

// ── EvalValidator ────────────────────────────────────────────────

export class EvalValidator {
  private config: ValidationConfig
  private graderSuite: GraderSuite
  private validationHistory: Map<string, ValidationResult[]> = new Map()

  constructor(config?: Partial<ValidationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.graderSuite = new GraderSuite({
      ...DEFAULT_GRADER_SUITE_CONFIG,
      skipLLM: !this.config.useLLMJudge,
    })
  }

  /**
   * Validate a single skill candidate against the eval harness.
   */
  async validate(candidate: SkillCandidate): Promise<ValidationResult> {
    log.info(`Validating skill candidate: ${candidate.name} (${candidate.id})`)

    // 1. Create test case from candidate
    const testCase = this.createSkillTest(candidate)

    // 2. Run through eval harness
    let testRun: EvalResult | null = null
    try {
      testRun = await runTest(testCase, {
        runnerConfig: {
          timeout: this.config.testTimeout,
          retryCount: 0,
        },
      })
    } catch (err) {
      log.error(`Test run failed for candidate ${candidate.id}: ${err}`)
      return {
        candidate,
        passed: false,
        compositeScore: 0,
        grades: [],
        testRun: null,
        recommendation: "reject",
        reason: `Test harness execution failed: ${err}`,
        categoryFailures: ["execution"],
      }
    }

    // 3. Grade the result
    let grades: GradeResult[] = []
    try {
      const ctx: Partial<GraderContext> = {
        testId: testCase.id,
        testName: testCase.name,
        expected: testCase.expected,
        trace: testRun.trace,
        sandboxSnapshot: testRun.sandboxSnapshot,
      }
      const graded = await this.graderSuite.gradeOutput(testRun.output, ctx)
      grades = graded.grades
    } catch (err) {
      log.error(`Grading failed for candidate ${candidate.id}: ${err}`)
      grades = [
        {
          name: "fallback",
          grader: "deterministic",
          score: testRun.passed ? 0.5 : 0,
          weight: 1,
          details: `Grading error: ${err}`,
        },
      ]
    }

    // 4. Compute composite score
    const totalWeight = grades.reduce((s, g) => s + g.weight, 0)
    const compositeScore =
      totalWeight > 0 ? grades.reduce((s, g) => s + g.score * g.weight, 0) / totalWeight : testRun.passed ? 0.5 : 0

    // 5. Identify category failures
    const categoryFailures = grades.filter((g) => g.score < 0.4).map((g) => g.name)

    // 6. Determine pass/fail
    const passed = compositeScore >= this.config.minPassScore
    const recommendation: ValidationResult["recommendation"] = passed
      ? "publish"
      : compositeScore >= this.config.minPassScore * 0.8
        ? "review"
        : "reject"

    // 7. Build reason
    const reason = passed
      ? `Skill validated with score ${compositeScore.toFixed(3)} (${grades.length} graders)`
      : `Skill failed validation (score: ${compositeScore.toFixed(3)}). ` +
        (categoryFailures.length > 0 ? `Failing categories: ${categoryFailures.join(", ")}` : "Below minimum threshold")

    const result: ValidationResult = {
      candidate,
      passed,
      compositeScore,
      grades,
      testRun,
      recommendation,
      reason,
      categoryFailures,
    }

    // 8. Store in history
    const history = this.validationHistory.get(candidate.id) ?? []
    history.push(result)
    this.validationHistory.set(candidate.id, history)

    log.info(
      `Validation result for ${candidate.name}: ${passed ? "✅ PASS" : "❌ FAIL"} (score: ${compositeScore.toFixed(3)})`,
    )
    return result
  }

  /**
   * Validate multiple skill candidates in parallel.
   */
  async batchValidate(candidates: SkillCandidate[]): Promise<BatchValidationResult> {
    const startTime = Date.now()
    const results = await Promise.all(candidates.map((c) => this.validate(c)))

    const passed = results.filter((r) => r.passed)
    const failed = results.filter((r) => !r.passed)
    const avgScore = results.length > 0 ? results.reduce((s, r) => s + r.compositeScore, 0) / results.length : 0

    const topCandidates = [...results]
      .filter((r) => r.passed)
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, 5)

    return {
      total: results.length,
      passed: passed.length,
      failed: failed.length,
      results,
      summary: {
        avgScore,
        topCandidates,
        avgDurationMs: (Date.now() - startTime) / results.length,
      },
    }
  }

  /**
   * Get validation history for a candidate.
   */
  getHistory(candidateId: string): ValidationResult[] {
    return this.validationHistory.get(candidateId) ?? []
  }

  /**
   * Get validation stats across all candidates.
   */
  getStats(): { totalValidated: number; passRate: number; avgScore: number } {
    let allResults: ValidationResult[] = []
    for (const results of this.validationHistory.values()) {
      allResults = allResults.concat(results)
    }
    if (allResults.length === 0) {
      return { totalValidated: 0, passRate: 0, avgScore: 0 }
    }
    const passed = allResults.filter((r) => r.passed).length
    return {
      totalValidated: allResults.length,
      passRate: passed / allResults.length,
      avgScore: allResults.reduce((s, r) => s + r.compositeScore, 0) / allResults.length,
    }
  }

  // ── Private helpers ──────────────────────────────────────────

  private createSkillTest(candidate: SkillCandidate): TestCase {
    return {
      id: `validate-${candidate.id}`,
      name: `Validate: ${candidate.name}`,
      prompt: candidate.description,
      category: "capability",
      priority: "high",
      tags: ["skill-validation", "auto-generated", ...candidate.derivedFrom.slice(0, 5)],
      timeout: this.config.testTimeout,
      expected: {
        minScore: this.config.minPassScore,
      },
    }
  }
}

export const evalValidator = new EvalValidator()

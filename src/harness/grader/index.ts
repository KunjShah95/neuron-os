/**
 * src/harness/grader/index.ts
 *
 * GraderSuite — orchestrates the three-tier grader system.
 *
 * Execution order (from cheapest to most expensive):
 *   1. Deterministic graders — fast, objective, zero LLM cost
 *   2. Code graders — medium cost, verifiable shell commands
 *   3. LLM judge — expensive, nuanced, only on passed deterministic checks
 *
 * This follows the Anthropic-inspired grading philosophy:
 * cheap checks gate expensive ones.
 */

import type { GradeResult, EvalResult } from "../types"
import type { GraderSuiteConfig, GraderContext, DeterministicGraderConfig } from "./types"
import { deterministicGrade } from "./deterministic"
import { rubricGrader, safetyGrader, multiJudgeConsensus } from "./llm"
import { codeGrade } from "./code"
import { computeCompositeScore, isPassing } from "./composite"

// ── Default Configuration ───────────────────────────────────────

export const DEFAULT_GRADER_SUITE_CONFIG: GraderSuiteConfig = {
  enabledGraders: ["deterministic", "llm", "code"],
  defaultWeights: {
    deterministic: 0.3,
    llm: 0.5,
    code: 0.2,
  },
  thresholds: {
    deterministic: 0.5,
    llm: 0.3,
    code: 0.3,
  },
  strategy: "weighted_average",
  skipLLM: false,
}

// ── Grader Suite ────────────────────────────────────────────────

export class GraderSuite {
  private config: GraderSuiteConfig

  constructor(config?: Partial<GraderSuiteConfig>) {
    this.config = { ...DEFAULT_GRADER_SUITE_CONFIG, ...config }
  }

  /**
   * Grade an EvalResult — runs the configured grader pipeline.
   * Returns the graded EvalResult with grades populated.
   */
  async grade(result: EvalResult): Promise<EvalResult> {
    const context = this.buildContext(result)
    const grades: GradeResult[] = []
    const enabledGraders = this.config.enabledGraders ?? ["deterministic", "llm", "code"]

    // Phase 1: Deterministic graders (cheap, fast)
    if (enabledGraders.includes("deterministic")) {
      try {
        const detConfig = this.buildDeterministicConfig(result)
        if (detConfig) {
          const detGrades = deterministicGrade(result.output, detConfig, context)
          grades.push(...detGrades)
        }
      } catch (err) {
        grades.push({
          name: "deterministic",
          grader: "deterministic",
          score: 0.5,
          weight: 0.3,
          details: `Deterministic grading failed: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }

    // Phase 2: Code graders (medium cost)
    if (enabledGraders.includes("code") && this.config.workDir) {
      try {
        const codeConfig = this.buildCodeConfig()
        if (codeConfig) {
          const codeGrades = await codeGrade(result.output, codeConfig, context)
          grades.push(...codeGrades)
        }
      } catch (err) {
        grades.push({
          name: "code",
          grader: "code",
          score: 0.5,
          weight: 0.2,
          details: `Code grading failed: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }

    // Phase 3: LLM judge (expensive, nuanced)
    if (enabledGraders.includes("llm") && !this.config.skipLLM) {
      try {
        const llmConfig = this.config.llmConfig
        const judgeModels = llmConfig?.judgeModels

        // Multi-judge consensus if multiple judge models configured
        if (judgeModels && judgeModels.length > 1) {
          const consensusGrade = await multiJudgeConsensus(result.output, judgeModels, llmConfig, context)
          grades.push(consensusGrade)
        } else {
          // Single rubric grader
          const rubric = await rubricGrader(result.output, llmConfig, context)
          grades.push(rubric)
        }

        // Safety check
        const safety = await safetyGrader(result.output, llmConfig, context)
        grades.push(safety)
      } catch (err) {
        grades.push({
          name: "llm",
          grader: "llm",
          score: 0.5,
          weight: 0.5,
          details: `LLM grading failed: ${err instanceof Error ? err.message : String(err)}`,
        })
      }
    }

    // Compute composite score
    const compositeScore = computeCompositeScore(grades, {
      defaultWeights: this.config.defaultWeights,
      thresholds: this.config.thresholds,
      strategy: this.config.strategy ?? "weighted_average",
    })

    // Determine pass/fail (respect test's minScore if set)
    const passThreshold = result.test.expected?.minScore ?? 0.6
    const passed = isPassing(compositeScore, passThreshold)

    return {
      ...result,
      score: compositeScore,
      passed,
      grades,
    }
  }

  /**
   * Grade a raw output string (for use outside the harness runner).
   */
  async gradeOutput(
    output: string,
    context: Partial<GraderContext>,
  ): Promise<{ grades: GradeResult[]; score: number; passed: boolean }> {
    const grades: GradeResult[] = []

    // Deterministic
    if (context.expected) {
      const expected = context.expected
      const detConfig: DeterministicGraderConfig = {
        stringMatch: expected.pattern ? { pattern: expected.pattern, mode: "contains" as const } : undefined,
        stepBudget: expected.maxSteps ? { maxSteps: expected.maxSteps } : undefined,
        tokenBudget: expected.maxTokens ? { maxTokens: expected.maxTokens } : undefined,
        fileCheck:
          expected.filesExist || expected.filesNotExist
            ? { filesExist: expected.filesExist, filesNotExist: expected.filesNotExist }
            : undefined,
      }
      const detGrades = deterministicGrade(output, detConfig, context as GraderContext)
      grades.push(...detGrades)
    }

    // LLM
    if (!this.config.skipLLM) {
      const rubric = await rubricGrader(output, this.config.llmConfig, context as GraderContext)
      grades.push(rubric)
    }

    const score = computeCompositeScore(grades, {
      defaultWeights: this.config.defaultWeights,
      thresholds: this.config.thresholds,
      strategy: this.config.strategy ?? "weighted_average",
    })

    return { grades, score, passed: score >= 0.6 }
  }

  /**
   * Get the current configuration.
   */
  getConfig(): GraderSuiteConfig {
    return { ...this.config }
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(config: Partial<GraderSuiteConfig>): void {
    this.config = { ...this.config, ...config }
  }

  // ── Private Helpers ───────────────────────────────────────────

  private buildContext(result: EvalResult): GraderContext {
    return {
      testId: result.test.id,
      testName: result.test.name,
      trace: result.trace,
      sandboxSnapshot: result.sandboxSnapshot,
      workDir: this.config.workDir,
      expected: result.test.expected,
    }
  }

  private buildDeterministicConfig(result: EvalResult): DeterministicGraderConfig | null {
    if (!result.test?.expected) return null
    const expected = result.test.expected

    return {
      stringMatch: expected.pattern ? { pattern: expected.pattern, mode: "contains" as const } : undefined,
      stepBudget: expected.maxSteps ? { maxSteps: expected.maxSteps } : undefined,
      tokenBudget: expected.maxTokens ? { maxTokens: expected.maxTokens } : undefined,
      fileCheck:
        expected.filesExist || expected.filesNotExist
          ? {
              filesExist: expected.filesExist,
              filesNotExist: expected.filesNotExist,
            }
          : undefined,
    }
  }

  private buildCodeConfig(): Record<string, never> | undefined {
    if (!this.config.workDir) return undefined
    return {}
  }
}

// ── Factory Function ────────────────────────────────────────────

let defaultSuite: GraderSuite | null = null

export function getGraderSuite(config?: Partial<GraderSuiteConfig>): GraderSuite {
  if (config) {
    return new GraderSuite(config)
  }
  if (!defaultSuite) {
    defaultSuite = new GraderSuite()
  }
  return defaultSuite
}

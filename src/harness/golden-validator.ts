/**
 * src/harness/golden-validator.ts
 *
 * Cross-model golden task validator — runs each golden task through
 * multiple LLM models, collects scores, and validates task quality.
 *
 * Phase 8: Implements the audit step of Silver→Gold→Audit pipeline.
 */

import { createLogger } from "../cli/logger"
import type { GoldenTask, CrossValidationResult } from "./golden-dataset"
import { goldenDatasetManager } from "./golden-dataset"
import { createAIProvider } from "../ai/provider"
import type { AIProvider } from "../ai/provider"
import { GraderSuite, DEFAULT_GRADER_SUITE_CONFIG } from "./grader"
import type { GraderContext } from "./grader/types"

const log = createLogger("harness:golden-validator")

// ── Types ────────────────────────────────────────────────────────

export interface ValidationModelConfig {
  provider: AIProvider
  model: string
  label: string
  apiKey?: string
}

export interface TaskValidationResult {
  task: GoldenTask
  modelResults: CrossValidationResult[]
  overallPass: boolean
  passCount: number
  modelCount: number
  avgScore: number
  isSolvable: boolean // Passed by at least 2/3 models?
}

export interface BatchValidationReport {
  timestamp: string
  totalTasks: number
  totalPassed: number
  totalFailed: number
  passRate: number
  byModel: Record<string, { total: number; passed: number; avgScore: number }>
  taskResults: TaskValidationResult[]
  recommendations: string[] // e.g. "Task golden-coding-003 is unsolvable — consider refining"
}

const DEFAULT_MODELS: ValidationModelConfig[] = [
  { provider: "openai", model: "gpt-4o", label: "GPT-4o" },
  { provider: "openrouter", model: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
  { provider: "openrouter", model: "google/gemini-2.0-flash", label: "Gemini 2.0 Flash" },
]

// ── GoldenTaskValidator ──────────────────────────────────────────

export class GoldenTaskValidator {
  private models: ValidationModelConfig[]
  private grader: GraderSuite

  constructor(models?: ValidationModelConfig[]) {
    this.models = models ?? DEFAULT_MODELS
    this.grader = new GraderSuite({
      ...DEFAULT_GRADER_SUITE_CONFIG,
      skipLLM: false,
    })
  }

  /**
   * Validate a single golden task across all configured models.
   */
  async validateTask(task: GoldenTask): Promise<TaskValidationResult> {
    log.info(`Validating task "${task.name}" across ${this.models.length} models`)

    const modelResults: CrossValidationResult[] = []

    for (const modelCfg of this.models) {
      try {
        const result = await this.runAgainstModel(task, modelCfg)
        modelResults.push(result)
        log.debug(`  ${modelCfg.label}: ${result.passed ? "✅ pass" : "❌ fail"} (${(result.score * 100).toFixed(0)}%)`)
      } catch (err) {
        log.warn(`  ${modelCfg.label}: error — ${err}`)
        modelResults.push({
          model: modelCfg.label,
          passed: false,
          score: 0,
          timestamp: new Date().toISOString(),
          durationMs: 0,
          notes: `Error: ${err}`,
        })
      }
    }

    const passCount = modelResults.filter((r) => r.passed).length
    const avgScore = modelResults.reduce((s, r) => s + r.score, 0) / modelResults.length
    const isSolvable = passCount >= Math.ceil(this.models.length * 0.5)

    return {
      task,
      modelResults,
      overallPass: isSolvable,
      passCount,
      modelCount: this.models.length,
      avgScore,
      isSolvable,
    }
  }

  /**
   * Validate all Gold-status tasks in the dataset.
   */
  async validateAllGold(): Promise<BatchValidationReport> {
    const tasks = goldenDatasetManager.getReadyForAudit()
    if (tasks.length === 0) {
      return {
        timestamp: new Date().toISOString(),
        totalTasks: 0,
        totalPassed: 0,
        totalFailed: 0,
        passRate: 0,
        byModel: {},
        taskResults: [],
        recommendations: ["No Gold tasks ready for audit"],
      }
    }

    log.info(`Batch-validating ${tasks.length} Gold tasks`)

    const taskResults = await Promise.all(tasks.map((task) => this.validateTask(task)))

    const totalPassed = taskResults.filter((r) => r.overallPass).length
    const totalFailed = taskResults.filter((r) => !r.overallPass).length

    // Per-model stats
    const byModel: Record<string, { total: number; passed: number; avgScore: number }> = {}
    for (const result of taskResults) {
      for (const mr of result.modelResults) {
        if (!byModel[mr.model]) {
          byModel[mr.model] = { total: 0, passed: 0, avgScore: 0 }
        }
        byModel[mr.model]!.total++
        if (mr.passed) byModel[mr.model]!.passed++
        byModel[mr.model]!.avgScore += mr.score
      }
    }
    for (const [, stats] of Object.entries(byModel)) {
      stats.avgScore = stats.total > 0 ? stats.avgScore / stats.total : 0
    }

    // Recommendations
    const recommendations: string[] = []
    const unsolvable = taskResults.filter((r) => !r.isSolvable)
    if (unsolvable.length > 0) {
      recommendations.push(
        `${unsolvable.length} task(s) unsolvable by >=50% of models: ${unsolvable.map((r) => r.task.id).join(", ")}`,
      )
    }

    const zeroPass = taskResults.filter((r) => r.passCount === 0)
    if (zeroPass.length > 0) {
      recommendations.push(
        `${zeroPass.length} task(s) failed ALL models — likely a prompt issue: ${zeroPass.map((r) => r.task.id).join(", ")}`,
      )
    }

    if (recommendations.length === 0) {
      recommendations.push("All tasks validated successfully across all models.")
    }

    // Store cross-validation results in the golden dataset
    for (const result of taskResults) {
      for (const cv of result.modelResults) {
        goldenDatasetManager.addCrossValidation(result.task.id, cv)
      }
    }

    return {
      timestamp: new Date().toISOString(),
      totalTasks: tasks.length,
      totalPassed,
      totalFailed,
      passRate: tasks.length > 0 ? totalPassed / tasks.length : 0,
      byModel,
      taskResults,
      recommendations,
    }
  }

  /**
   * Generate a prompt for running the golden task.
   */
  private buildPrompt(task: GoldenTask): string {
    return [
      `Task: ${task.name}`,
      ``,
      task.prompt,
      ``,
      `Additional context:`,
      `- Category: ${task.category}`,
      `- Priority: ${task.priority}`,
      `- Tags: ${task.tags.join(", ")}`,
    ].join("\n")
  }

  /**
   * Run a task against a specific model and grade the result.
   */
  private async runAgainstModel(task: GoldenTask, modelCfg: ValidationModelConfig): Promise<CrossValidationResult> {
    const startTime = Date.now()

    const provider = createAIProvider({
      provider: modelCfg.provider,
      model: modelCfg.model,
      apiKey: modelCfg.apiKey ?? process.env[`${modelCfg.provider.toUpperCase()}_API_KEY`],
    })

    const prompt = this.buildPrompt(task)

    const response = await provider.generate([{ role: "user", content: prompt }])

    const durationMs = Date.now() - startTime
    const output = response.text

    // Run through grader
    let score = 0.5
    let passed = false
    try {
      const ctx: Partial<GraderContext> = {
        testId: task.id,
        testName: task.name,
        expected: task.expected,
      }
      const result = await this.grader.gradeOutput(output, ctx)
      score = result.score
      passed = result.passed
    } catch {
      // If grading fails, use a simple check
      if (task.expected?.pattern) {
        passed = output.includes(task.expected.pattern)
      }
      score = passed ? 0.7 : 0.3
    }

    return {
      model: modelCfg.label,
      passed,
      score: Math.round(score * 100) / 100,
      timestamp: new Date().toISOString(),
      durationMs,
    }
  }
}

export const goldenTaskValidator = new GoldenTaskValidator()

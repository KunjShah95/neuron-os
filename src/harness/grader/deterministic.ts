/**
 * src/harness/grader/deterministic.ts
 *
 * Deterministic graders — fast, objective, zero LLM cost.
 * Run first, gate further grading.
 *
 * Graders:
 *   - StringMatchGrader: Check output for expected substring/regex
 *   - FileCheckGrader: Verify files exist/not-exist/have-expected-content
 *   - ExitCodeGrader: Check process exit code
 *   - TokenBudgetGrader: Verify token usage within budget
 *   - StepCountGrader: Verify step count within budget
 *   - DiffGrader: Check diff size/patterns
 */

import { execSync } from "node:child_process"
import type { GradeResult } from "../types"
import type { DeterministicGraderConfig, GraderContext } from "./types"

export const RUN_OBSERVATION_TRACE = "harness:observation"

export interface RunObservation {
  exitCode?: number
  totalTokens?: number
}

export function readRunObservation(context?: GraderContext): RunObservation {
  const observation: RunObservation = {}
  let tokenSum = 0
  let sawTokens = false

  for (const entry of context?.trace ?? []) {
    const params = (entry.params ?? {}) as Record<string, unknown>
    if (typeof params.exitCode === "number") observation.exitCode = params.exitCode
    if (typeof params.totalTokens === "number") {
      observation.totalTokens = params.totalTokens
      sawTokens = true
    }
    const tokenCost = (entry as { tokenCost?: number }).tokenCost
    if (typeof tokenCost === "number") {
      tokenSum += tokenCost
      sawTokens = true
    }
  }

  if (sawTokens && observation.totalTokens === undefined) observation.totalTokens = tokenSum
  return observation
}

export function countToolSteps(context?: GraderContext): number {
  return (context?.trace ?? []).filter((t) => t.name !== RUN_OBSERVATION_TRACE).length
}

// ── Main Deterministic Grader ───────────────────────────────────

export function deterministicGrade(
  _output: string,
  config: DeterministicGraderConfig,
  context?: GraderContext,
): GradeResult[] {
  const grades: GradeResult[] = []

  if (config.stringMatch) {
    grades.push(stringMatchGrader(_output, config.stringMatch, context))
  }

  if (config.fileCheck) {
    grades.push(fileCheckGrader(config.fileCheck, context))
  }

  if (config.exitCode) {
    grades.push(exitCodeGrader(config.exitCode, context))
  }

  if (config.tokenBudget) {
    grades.push(tokenBudgetGrader(config.tokenBudget, context))
  }

  if (config.stepBudget) {
    grades.push(stepCountGrader(config.stepBudget, context))
  }

  if (config.diffCheck) {
    grades.push(diffGrader(config.diffCheck, context))
  }

  return grades
}

// ── String Match Grader ─────────────────────────────────────────

export function stringMatchGrader(
  output: string,
  config: DeterministicGraderConfig["stringMatch"],
  context?: GraderContext,
): GradeResult {
  const name = "string-match"
  const pattern = config?.pattern ?? context?.expected?.pattern
  if (!pattern) {
    return { name, grader: "deterministic", score: 1.0, weight: 0.2, details: "No pattern specified" }
  }

  const mode = config?.mode ?? "contains"
  const caseSensitive = config?.caseSensitive ?? false
  const searchText = caseSensitive ? output : output.toLowerCase()
  const searchPattern = caseSensitive ? pattern : pattern.toLowerCase()

  let found = false
  try {
    switch (mode) {
      case "exact":
        found = searchText === searchPattern
        break
      case "regex": {
        const re = new RegExp(pattern, caseSensitive ? "" : "i")
        found = re.test(output)
        break
      }
      case "contains":
      default:
        found = searchText.includes(searchPattern)
        break
    }
  } catch {
    // Fallback to contains if regex invalid
    found = searchText.includes(searchPattern)
  }

  // Also check traces if available
  if (!found && context?.trace) {
    for (const t of context.trace) {
      if (t.name === RUN_OBSERVATION_TRACE) continue
      const traceText = caseSensitive ? t.result : t.result.toLowerCase()
      if (traceText.includes(searchPattern)) {
        found = true
        break
      }
    }
  }

  const score = found ? 1.0 : 0.0
  return {
    name,
    grader: "deterministic",
    score,
    weight: 0.2,
    details: found ? `Pattern "${pattern}" found in output` : `Pattern "${pattern}" not found in output`,
  }
}

// ── File Check Grader ───────────────────────────────────────────

export function fileCheckGrader(config: DeterministicGraderConfig["fileCheck"], context?: GraderContext): GradeResult {
  const name = "file-check"
  const snapshot = context?.sandboxSnapshot
  if (!snapshot) {
    return { name, grader: "deterministic", score: 0.5, weight: 0.2, details: "No sandbox snapshot available" }
  }

  const checks: string[] = []
  let passed = true

  // Check files that should exist
  const expectedFiles = config?.filesExist ?? context?.expected?.filesExist ?? []
  for (const f of expectedFiles) {
    const exists = snapshot.created.includes(f) || snapshot.modified.includes(f) || snapshot.after.includes(f)
    if (!exists) {
      passed = false
      checks.push(`Missing expected file: ${f}`)
    } else {
      checks.push(`Found expected file: ${f}`)
    }
  }

  // Check files that should NOT exist
  const notExpectedFiles = config?.filesNotExist ?? []
  for (const f of notExpectedFiles) {
    if (snapshot.after.includes(f)) {
      passed = false
      checks.push(`Unexpected file found: ${f}`)
    } else {
      checks.push(`Not-present file confirmed: ${f}`)
    }
  }

  // Check file content if specified
  if (config?.filesContent) {
    for (const [filePath] of Object.entries(config.filesContent)) {
      // We can't read file content from snapshot alone — mark as partial
      checks.push(`Content check for ${filePath} requires file I/O`)
    }
  }

  const score = passed ? 1.0 : 0.0
  return {
    name,
    grader: "deterministic",
    score,
    weight: 0.2,
    details: checks.join("; ") || "No file checks configured",
  }
}

// ── Exit Code Grader ────────────────────────────────────────────

export function exitCodeGrader(config: DeterministicGraderConfig["exitCode"], context?: GraderContext): GradeResult {
  const name = "exit-code"
  if (!config) {
    return { name, grader: "deterministic", score: 0.5, weight: 0.1, details: "Exit code check not configured" }
  }

  const observed = observeExitCode(config, context)
  if (observed === null) {
    return {
      name,
      grader: "deterministic",
      score: 0.5,
      weight: 0.1,
      details: `Exit code NOT VERIFIED — no observed exit code for expected ${config.expected}`,
    }
  }

  const matched = observed === config.expected
  return {
    name,
    grader: "deterministic",
    score: matched ? 1.0 : 0.0,
    weight: 0.1,
    details: matched
      ? `Exit code ${observed} matched expected ${config.expected}`
      : `Exit code ${observed} did not match expected ${config.expected}`,
  }
}

function observeExitCode(
  config: NonNullable<DeterministicGraderConfig["exitCode"]>,
  context?: GraderContext,
): number | null {
  const fromContext = readRunObservation(context).exitCode
  if (typeof fromContext === "number") return fromContext

  if (config.command) {
    const fromCommand = runCommandExitCode(config.command, context?.workDir)
    if (fromCommand !== null) return fromCommand
  }

  return null
}

function runCommandExitCode(command: string, workDir?: string): number | null {
  try {
    execSync(command, { cwd: workDir, timeout: 10000, stdio: "pipe" })
    return 0
  } catch (err) {
    const status = (err as { status?: number | null }).status
    return typeof status === "number" ? status : null
  }
}

// ── Token Budget Grader ─────────────────────────────────────────

export function tokenBudgetGrader(
  config: DeterministicGraderConfig["tokenBudget"],
  context?: GraderContext,
): GradeResult {
  const name = "token-budget"
  if (!config?.maxTokens) {
    return { name, grader: "deterministic", score: 0.5, weight: 0.15, details: "No token budget configured" }
  }

  const observed = readRunObservation(context).totalTokens
  if (typeof observed !== "number") {
    return {
      name,
      grader: "deterministic",
      score: 0.5,
      weight: 0.15,
      details: `Token budget NOT VERIFIED — no token count observed (limit: ${config.maxTokens})`,
    }
  }

  const withinBudget = observed <= config.maxTokens
  const ratio = config.maxTokens > 0 ? Math.min(observed / config.maxTokens, 1) : 1
  const score = withinBudget ? 1.0 - ratio * 0.3 : 0.3

  return {
    name,
    grader: "deterministic",
    score,
    weight: 0.15,
    details: withinBudget
      ? `${observed} tokens (limit: ${config.maxTokens})`
      : `${observed} tokens exceeded limit of ${config.maxTokens}`,
  }
}

// ── Step Count Grader ───────────────────────────────────────────

export function stepCountGrader(config: DeterministicGraderConfig["stepBudget"], context?: GraderContext): GradeResult {
  const name = "step-count"
  const maxSteps = config?.maxSteps ?? context?.expected?.maxSteps
  if (!maxSteps) {
    return { name, grader: "deterministic", score: 1.0, weight: 0.15, details: "No step budget configured" }
  }

  const actualSteps = countToolSteps(context)
  const passed = actualSteps <= maxSteps
  const ratio = maxSteps > 0 ? Math.min(actualSteps / maxSteps, 1) : 1
  // Score decreases as step count approaches the limit
  const score = passed ? 1.0 - ratio * 0.3 : 0.3

  return {
    name,
    grader: "deterministic",
    score,
    weight: 0.15,
    details: passed
      ? `${actualSteps} steps (limit: ${maxSteps})`
      : `${actualSteps} steps exceeded limit of ${maxSteps}`,
  }
}

// ── Diff Grader ──────────────────────────────────────────────────

export function diffGrader(config: DeterministicGraderConfig["diffCheck"], context?: GraderContext): GradeResult {
  const name = "diff-check"
  if (!config) {
    return { name, grader: "deterministic", score: 1.0, weight: 0.1, details: "No diff check configured" }
  }

  const snapshot = context?.sandboxSnapshot
  if (!snapshot) {
    return { name, grader: "deterministic", score: 0.5, weight: 0.1, details: "No sandbox snapshot for diff" }
  }

  const createdLen = snapshot.created.length
  const modifiedLen = snapshot.modified.length
  const deletedLen = snapshot.deleted.length
  const totalChanges = createdLen + modifiedLen + deletedLen

  if (config.maxLinesChanged && totalChanges > config.maxLinesChanged) {
    return {
      name,
      grader: "deterministic",
      score: 0.3,
      weight: 0.1,
      details: `Too many changes: ${totalChanges} (limit: ${config.maxLinesChanged})`,
    }
  }

  return {
    name,
    grader: "deterministic",
    score: 1.0,
    weight: 0.1,
    details: `${totalChanges} file changes (${createdLen} created, ${modifiedLen} modified, ${deletedLen} deleted)`,
  }
}

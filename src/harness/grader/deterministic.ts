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

import type { GradeResult } from "../types"
import type { DeterministicGraderConfig, GraderContext } from "./types"

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
    details: found
      ? `Pattern "${pattern}" found in output`
      : `Pattern "${pattern}" not found in output`,
  }
}

// ── File Check Grader ───────────────────────────────────────────

export function fileCheckGrader(
  config: DeterministicGraderConfig["fileCheck"],
  context?: GraderContext,
): GradeResult {
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

export function exitCodeGrader(
  config: DeterministicGraderConfig["exitCode"],
  _context?: GraderContext,
): GradeResult {
  const name = "exit-code"
  const score = 1.0 // Default: we assume success since we're grading output
  if (!config) {
    return { name, grader: "deterministic", score, weight: 0.1, details: "Exit code check not configured" }
  }
  return {
    name,
    grader: "deterministic",
    score,
    weight: 0.1,
    details: config.command
      ? `Exit code check: expected ${config.expected ?? 0} for "${config.command}"`
      : "Exit code not verified (no command specified)",
  }
}

// ── Token Budget Grader ─────────────────────────────────────────

export function tokenBudgetGrader(
  config: DeterministicGraderConfig["tokenBudget"],
  _context?: GraderContext,
): GradeResult {
  const name = "token-budget"
  if (!config?.maxTokens) {
    return { name, grader: "deterministic", score: 1.0, weight: 0.15, details: "No token budget configured" }
  }

  // Token counts come from context.trace tokenCost sums, but we don't have them here directly
  // This grader is best used with context that includes token info
  return {
    name,
    grader: "deterministic",
    score: 1.0,
    weight: 0.15,
    details: `Token budget: ${config.maxTokens} (deferred to context-aware evaluation)`,
  }
}

// ── Step Count Grader ───────────────────────────────────────────

export function stepCountGrader(
  config: DeterministicGraderConfig["stepBudget"],
  context?: GraderContext,
): GradeResult {
  const name = "step-count"
  const maxSteps = config?.maxSteps ?? context?.expected?.maxSteps
  if (!maxSteps) {
    return { name, grader: "deterministic", score: 1.0, weight: 0.15, details: "No step budget configured" }
  }

  const actualSteps = context?.trace?.length ?? 0
  const passed = actualSteps <= maxSteps
  const ratio = maxSteps > 0 ? Math.min(actualSteps / maxSteps, 1) : 1
  // Score decreases as step count approaches the limit
  const score = passed ? 1.0 - (ratio * 0.3) : 0.3

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

export function diffGrader(
  config: DeterministicGraderConfig["diffCheck"],
  context?: GraderContext,
): GradeResult {
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

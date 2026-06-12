/**
 * src/harness/grader/code.ts
 *
 * Code graders — programmatic, shell-based checks on agent output.
 * Run actual commands (typecheck, test, lint) against the generated code.
 *
 * Graders:
 *   - TypeCheckGrader: Run TypeScript typecheck (tsc --noEmit)
 *   - TestGrader: Run test suite and check pass count
 *   - LintGrader: Run linter and check warning/error counts
 *   - CustomScriptGrader: Run arbitrary shell commands
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import type { GradeResult } from "../types"
import type { CodeGraderConfig, GraderContext } from "./types"

// ── Main Code Grader ────────────────────────────────────────────

export async function codeGrade(
  _output: string,
  config: CodeGraderConfig,
  context?: GraderContext,
): Promise<GradeResult[]> {
  const grades: GradeResult[] = []

  if (config.typechecks) {
    grades.push(await typeCheckGrader(config.typechecks, context))
  }

  if (config.tests) {
    grades.push(await testGrader(config.tests, context))
  }

  if (config.lints) {
    grades.push(await lintGrader(config.lints, context))
  }

  if (config.custom) {
    for (const check of config.custom) {
      grades.push(await customScriptGrader(check, context))
    }
  }

  return grades
}

// ── TypeCheck Grader ────────────────────────────────────────────

export async function typeCheckGrader(
  config: CodeGraderConfig["typechecks"],
  context?: GraderContext,
): Promise<GradeResult> {
  const name = "code-typecheck"

  if (!config?.command) {
    return { name, grader: "code", score: 1.0, weight: 0.3, details: "No typecheck command configured" }
  }

  const workDir = resolve(config.workDir ?? context?.workDir ?? process.cwd())

  if (!existsSync(workDir)) {
    return { name, grader: "code", score: 0.0, weight: 0.3, details: `Working directory not found: ${workDir}` }
  }

  try {
    execSync(config.command, {
      cwd: workDir,
      timeout: 60000,
      stdio: "pipe",
      encoding: "utf-8" as const,
    })
    return { name, grader: "code", score: 1.0, weight: 0.3, details: "Typecheck passed" }
  } catch (err) {
    const errorOutput = (err instanceof Error ? err.message : String(err)).slice(0, 500)
    return { name, grader: "code", score: 0.0, weight: 0.3, details: `Typecheck failed: ${errorOutput}` }
  }
}

// ── Test Grader ─────────────────────────────────────────────────

export async function testGrader(config: CodeGraderConfig["tests"], context?: GraderContext): Promise<GradeResult> {
  const name = "code-tests"

  if (!config?.command) {
    return { name, grader: "code", score: 1.0, weight: 0.3, details: "No test command configured" }
  }

  const workDir = resolve(config.workDir ?? context?.workDir ?? process.cwd())

  if (!existsSync(workDir)) {
    return { name, grader: "code", score: 0.0, weight: 0.3, details: `Working directory not found: ${workDir}` }
  }

  try {
    const stdout = execSync(config.command, {
      cwd: workDir,
      timeout: 120000,
      stdio: "pipe",
      encoding: "utf-8" as const,
    })

    // Try to extract pass count from output
    if (config.expectedPassCount !== undefined) {
      const passMatch = stdout.match(/(\d+)\s+pass(?:ed|ing)?/i)
      const actualPassed = passMatch ? parseInt(passMatch[1] ?? "0", 10) : 0
      const score = actualPassed >= config.expectedPassCount ? 1.0 : actualPassed / config.expectedPassCount
      return {
        name,
        grader: "code",
        score,
        weight: 0.3,
        details: `${actualPassed}/${config.expectedPassCount} tests passed`,
      }
    }

    // Check for test failure indicators
    const hasFailures = /fail/i.test(stdout)
    const hasErrors = /error/i.test(stdout)

    if (hasFailures || hasErrors) {
      // Extract failure count
      const failMatch = stdout.match(/(\d+)\s+fail(?:ed|ing|ure)?/i)
      const failCount = failMatch ? parseInt(failMatch[1] ?? "0", 10) : 0
      const score = failCount === 0 ? 1.0 : Math.max(0, 1.0 - failCount * 0.2)
      return { name, grader: "code", score, weight: 0.3, details: `Tests completed with ${failCount} failure(s)` }
    }

    return { name, grader: "code", score: 1.0, weight: 0.3, details: "Tests passed" }
  } catch (err) {
    const errorOutput = (err instanceof Error ? err.message : String(err)).slice(0, 500)
    return { name, grader: "code", score: 0.0, weight: 0.3, details: `Tests failed: ${errorOutput}` }
  }
}

// ── Lint Grader ─────────────────────────────────────────────────

export async function lintGrader(config: CodeGraderConfig["lints"], context?: GraderContext): Promise<GradeResult> {
  const name = "code-lint"

  if (!config?.command) {
    return { name, grader: "code", score: 1.0, weight: 0.2, details: "No lint command configured" }
  }

  const workDir = resolve(config.workDir ?? context?.workDir ?? process.cwd())

  if (!existsSync(workDir)) {
    return { name, grader: "code", score: 0.0, weight: 0.2, details: `Working directory not found: ${workDir}` }
  }

  try {
    const stdout = execSync(config.command, {
      cwd: workDir,
      timeout: 60000,
      stdio: "pipe",
      encoding: "utf-8" as const,
    })

    // Extract warning and error counts
    const warnMatch = stdout.match(/(\d+)\s+warning/i)
    const errMatch = stdout.match(/(\d+)\s+error/i)
    const warnings = warnMatch ? parseInt(warnMatch[1] ?? "0", 10) : 0
    const errors = errMatch ? parseInt(errMatch[1] ?? "0", 10) : 0

    const maxWarnings = config.maxWarnings ?? Infinity
    const maxErrors = config.maxErrors ?? 0

    let score = 1.0
    const issues: string[] = []

    if (errors > maxErrors) {
      score = Math.max(0, 1.0 - (errors - maxErrors) * 0.3)
      issues.push(`${errors} errors (max: ${maxErrors})`)
    }
    if (warnings > maxWarnings) {
      score = Math.min(score, Math.max(0, 1.0 - (warnings - maxWarnings) * 0.1))
      issues.push(`${warnings} warnings (max: ${maxWarnings})`)
    }

    if (issues.length === 0) {
      return { name, grader: "code", score: 1.0, weight: 0.2, details: "Lint passed" }
    }

    return { name, grader: "code", score, weight: 0.2, details: issues.join("; ") }
  } catch (err) {
    const errorOutput = (err instanceof Error ? err.message : String(err)).slice(0, 500)
    return { name, grader: "code", score: 0.0, weight: 0.2, details: `Lint failed: ${errorOutput}` }
  }
}

// ── Custom Script Grader ────────────────────────────────────────

export async function customScriptGrader(
  config: NonNullable<CodeGraderConfig["custom"]>[number],
  context?: GraderContext,
): Promise<GradeResult> {
  const name = config.name ?? "code-custom"

  const workDir = resolve(config.workDir ?? context?.workDir ?? process.cwd())

  if (!existsSync(workDir)) {
    return { name, grader: "code", score: 0.0, weight: 0.2, details: `Working directory not found: ${workDir}` }
  }

  try {
    execSync(config.command, {
      cwd: workDir,
      timeout: 60000,
      stdio: "pipe",
      encoding: "utf-8" as const,
    })
    return { name, grader: "code", score: config.onSuccess ?? 1.0, weight: 0.2, details: `${config.command} succeeded` }
  } catch (err) {
    const errorOutput = (err instanceof Error ? err.message : String(err)).slice(0, 300)
    return {
      name,
      grader: "code",
      score: config.onFailure ?? 0.0,
      weight: 0.2,
      details: `${config.command} failed: ${errorOutput}`,
    }
  }
}

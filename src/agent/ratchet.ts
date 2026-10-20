/**
 * agent/ratchet — Git-aware measure/revert kernel.
 *
 * Extracted from src/modes/research.ts so every agent run can use the same
 * "ratchet" primitive: keep changes that improve a metric, revert on regression.
 *
 * Measurement priority:
 * 1. If criteria provided → Evaluator.evaluate() → scalar 0.0–1.0
 * 2. Else if testCommand provided → shell exec, heuristic pass/fail
 * 3. Else → neutral, score 0.5
 *
 * All git operations are no-ops outside a git repo (returns false / no-op).
 */

import { execFileSync, execSync } from "node:child_process"
import { Evaluator } from "../mesh/evaluator"
import type { EvaluationCriteria } from "../mesh/types"
import { createLogger } from "../cli/logger"

const log = createLogger("agent:ratchet")

export type GitCommandRunner = (args: string[], cwd: string) => string

function defaultGitRunner(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  })
}

export function buildGitRevertArgs(file: string): string[] {
  return ["checkout", "--", file]
}

export interface RatchetConfig {
  cwd: string
  testCommand?: string
  criteria?: EvaluationCriteria[]
}

export interface RatchetMeasureResult {
  outcome: "improved" | "degraded" | "neutral" | "error"
  score: number
  output: string
  filesChanged: string[]
}

export class RatchetRuntime {
  private evaluator?: Evaluator
  private gitRunner: GitCommandRunner

  constructor(gitRunner?: GitCommandRunner) {
    this.gitRunner = gitRunner ?? defaultGitRunner
  }

  isGitRepo(cwd: string): boolean {
    try {
      this.gitRunner(["rev-parse", "--is-inside-work-tree"], cwd)
      return true
    } catch {
      return false
    }
  }

  stash(cwd: string): boolean {
    if (!this.isGitRepo(cwd)) return false
    try {
      this.gitRunner(["stash", "push", "-m", "ratchet-session", "--include-untracked"], cwd)
      return true
    } catch {
      return false
    }
  }

  restore(cwd: string): void {
    if (!this.isGitRepo(cwd)) return
    try {
      this.gitRunner(["stash", "pop"], cwd)
    } catch {
      log.warn("Could not restore stash — run git stash pop manually")
    }
  }

  getChangedFiles(cwd: string): string[] {
    if (!this.isGitRepo(cwd)) return []
    try {
      const out = this.gitRunner(["diff", "--name-only"], cwd).trim()
      return out ? out.split("\n").filter(Boolean) : []
    } catch {
      return []
    }
  }

  revertFiles(cwd: string, files: string[]): void {
    for (const file of files) {
      try {
        this.gitRunner(buildGitRevertArgs(file), cwd)
        log.info("Reverted file", { file })
      } catch {
        log.warn("Could not revert file", { file })
      }
    }
  }

  async measure(config: RatchetConfig, previousScore?: number): Promise<RatchetMeasureResult> {
    const filesChanged = this.getChangedFiles(config.cwd)

    if (config.criteria && config.criteria.length > 0) {
      try {
        this.evaluator = new Evaluator(config.cwd)
        const evalResult = await this.evaluator.evaluate(`ratchet-${Date.now()}`, "ratchet measure", config.criteria)
        const score = evalResult.overallScore
        let outcome: RatchetMeasureResult["outcome"] = "improved"
        if (!evalResult.overallPass && score === 0) outcome = "degraded"
        else if (previousScore !== undefined && score < previousScore) outcome = "degraded"
        else if (previousScore !== undefined && score === previousScore) outcome = "neutral"

        return { outcome, score, output: evalResult.summary, filesChanged }
      } catch (err) {
        log.warn("Evaluator threw in ratchet.measure; falling back to neutral", {
          error: String(err),
        })
        return {
          outcome: "error",
          score: 0.5,
          output: `Evaluator error: ${String(err)}`,
          filesChanged,
        }
      }
    }

    if (config.testCommand) {
      try {
        const output = execSync(config.testCommand, {
          cwd: config.cwd,
          encoding: "utf8",
          timeout: 120_000,
        })
        const failed = output.includes("FAIL") || output.includes("error") || output.includes("Error")
        return {
          outcome: failed ? "degraded" : "improved",
          score: failed ? 0 : 1,
          output: output.slice(0, 500),
          filesChanged,
        }
      } catch (err: unknown) {
        return {
          outcome: "degraded",
          score: 0,
          output: err instanceof Error ? (err.message?.slice(0, 500) || String(err)) : String(err),
          filesChanged,
        }
      }
    }

    return {
      outcome: "neutral",
      score: 0.5,
      output: "No criteria or test command",
      filesChanged,
    }
  }
}

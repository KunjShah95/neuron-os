import { execSync } from "child_process"
import { createLogger } from "../cli/logger"
import { minimatch } from "minimatch"

const log = createLogger("ci-merger")

export function pathsMatchAllowlist(changedFiles: string[], allowedPaths: string[]): boolean {
  if (allowedPaths.length === 0) return false
  return changedFiles.every((f) => allowedPaths.some((pattern) => minimatch(f, pattern)))
}

export function getChangedFiles(repo: string, prNumber: number): string[] {
  try {
    const output = execSync(
      `gh pr view ${prNumber} --repo "${repo}" --json files --jq '.files[].path'`,
      { encoding: "utf-8", timeout: 15_000 },
    ).trim()
    return output ? output.split("\n") : []
  } catch {
    return []
  }
}

export function checkCiStatus(repo: string, branch: string): boolean {
  try {
    const output = execSync(
      `gh run list --repo "${repo}" --branch "${branch}" --limit 1 --json conclusion --jq '.[0].conclusion'`,
      { encoding: "utf-8", timeout: 15_000 },
    ).trim()
    return output === "success"
  } catch {
    return false
  }
}

export function checkApprovalComment(repo: string, prNumber: number): boolean {
  try {
    const output = execSync(
      `gh pr view ${prNumber} --repo "${repo}" --json comments --jq '.comments[].body'`,
      { encoding: "utf-8", timeout: 15_000 },
    ).trim()
    return output.split("\n").some((c) => c.toLowerCase().includes("lgtm"))
  } catch {
    return false
  }
}

export async function autoMerge(params: {
  repo: string
  prNumber: number
  branch: string
  allowedPaths: string[]
  requireHumanApproval: boolean
}): Promise<boolean> {
  const { repo, prNumber, branch, allowedPaths, requireHumanApproval } = params

  log.info(`Checking auto-merge for ${repo} PR #${prNumber}`)

  // Check changed files against allowlist
  const changedFiles = getChangedFiles(repo, prNumber)
  if (!pathsMatchAllowlist(changedFiles, allowedPaths)) {
    log.warn("Changed files are not in allowed_paths, skipping auto-merge")
    return false
  }

  // Check CI status on the branch
  if (!checkCiStatus(repo, branch)) {
    log.warn("CI is not green on the fix branch, skipping auto-merge")
    return false
  }

  // Check human approval if required
  if (requireHumanApproval) {
    if (!checkApprovalComment(repo, prNumber)) {
      log.info("Waiting for human approval (LGTM) comment")
      return false
    }
  }

  // Squash-merge
  try {
    execSync(
      `gh pr merge ${prNumber} --repo "${repo}" --squash --subject "[ci-fix] Auto-fix for PR #${prNumber}"`,
      { encoding: "utf-8", timeout: 30_000 },
    )
    log.info(`Auto-merged PR #${prNumber} in ${repo}`)
    return true
  } catch (err) {
    log.warn(`Auto-merge failed: ${err}`)
    return false
  }
}

/**
 * audit/policy — Declarative guardrails engine.
 *
 * Checks every staged mutation against a set of rules before allowing it.
 * Rules can reject, flag-for-review, or allow each action.
 *
 * Policies are defined as simple declarative objects and can be loaded
 * from project config, environment variables, or code.
 *
 * Integration:
 *   const engine = new PolicyEngine([...defaultPolicies])
 *   const result = engine.check({ type: "file_write", path: "src/config.ts", content: "..." })
 *
 * result verdict is one of: "allow" | "flag" | "reject"
 */

import { createLogger } from "../cli/logger"

const log = createLogger("audit:policy")

// ── Types ─────────────────────────────────────────────────────────────

export type Verdict = "allow" | "flag" | "reject"

export interface PolicyCheck {
  actionType: string
  path?: string
  content?: string
  command?: string
  sessionId?: string
  project?: string
}

export interface PolicyResult {
  verdict: Verdict
  policyName: string
  reason: string
  suggestion?: string
}

export interface Policy {
  name: string
  description: string
  severity: "error" | "warning" | "info"
  check: (action: PolicyCheck) => PolicyResult | null
}

// ── Policy Engine ─────────────────────────────────────────────────────

export class PolicyEngine {
  private policies: Policy[] = []

  constructor(policies?: Policy[]) {
    if (policies) this.policies = [...policies]
  }

  register(policy: Policy): void {
    this.policies.push(policy)
  }

  registerAll(policies: Policy[]): void {
    this.policies.push(...policies)
  }

  /**
   * Check a single action against all registered policies.
   * Returns the first reject, or the first flag, or allow.
   */
  check(action: PolicyCheck): PolicyResult {
    let firstFlag: PolicyResult | null = null

    for (const policy of this.policies) {
      const result = policy.check(action)
      if (!result) continue

      if (result.verdict === "reject") {
        this.recordViolation(policy, action, result)
        return result
      }
      if (result.verdict === "flag" && !firstFlag) {
        firstFlag = result
      }
    }

    if (firstFlag) {
      return firstFlag
    }

    return {
      verdict: "allow",
      policyName: "__default__",
      reason: "All policies passed",
    }
  }

  /**
   * Check multiple actions and return summary.
   */
  checkAll(actions: PolicyCheck[]): { results: PolicyResult[]; rejected: boolean; flagged: boolean } {
    const results = actions.map((a) => this.check(a))
    return {
      results,
      rejected: results.some((r) => r.verdict === "reject"),
      flagged: results.some((r) => r.verdict === "flag"),
    }
  }

  listPolicies(): Policy[] {
    return [...this.policies]
  }

  private recordViolation(policy: Policy, action: PolicyCheck, result: PolicyResult): void {
    if (!action.sessionId) return
    log.warn("Policy violation", { policy: policy.name, action: action.actionType, reason: result.reason })
  }
}

// ── Built-in Policies ──────────────────────────────────────────────────

/**
 * Default set of safety policies.
 */
export const DEFAULT_POLICIES: Policy[] = [
  {
    name: "no-node_modules",
    description: "Never modify files inside node_modules",
    severity: "error",
    check: (action) => {
      if (action.path?.split("/").some((seg) => seg === "node_modules")) {
        return {
          verdict: "reject",
          policyName: "no-node_modules",
          reason: "Modifications to node_modules are not allowed",
          suggestion: "Use a package manager to install dependencies instead",
        }
      }
      return null
    },
  },
  {
    name: "no-git-dir",
    description: "Never modify .git directory",
    severity: "error",
    check: (action) => {
      if (action.path?.split("/").some((seg) => seg === ".git")) {
        return {
          verdict: "reject",
          policyName: "no-git-dir",
          reason: "Modifications to .git directory are not allowed",
          suggestion: "Use git commands instead of direct file manipulation",
        }
      }
      return null
    },
  },
  {
    name: "no-dist",
    description: "Never modify build output directories",
    severity: "warning",
    check: (action) => {
      if (action.path?.startsWith("dist/") || action.path?.startsWith(".next/")) {
        return {
          verdict: "flag",
          policyName: "no-dist",
          reason: "Modifications to build output directories are unusual",
          suggestion: "Modify the source files and rebuild instead",
        }
      }
      return null
    },
  },
  {
    name: "max-file-size",
    description: "Reject writes larger than 1MB",
    severity: "error",
    check: (action) => {
      if (action.content && action.content.length > 1024 * 1024) {
        return {
          verdict: "reject",
          policyName: "max-file-size",
          reason: `File too large: ${(action.content.length / 1024 / 1024).toFixed(1)}MB`,
          suggestion: "Split the file into smaller modules",
        }
      }
      return null
    },
  },
  {
    name: "no-dangerous-shell",
    description: "Flag dangerous shell commands",
    severity: "warning",
    check: (action) => {
      if (action.command) {
        const dangerous = ["rm -rf /", "rm -rf ~", "> /dev/sda", ":(){ :|:& };:", "dd if=", "mkfs."]
        for (const d of dangerous) {
          if (action.command.includes(d)) {
            return {
              verdict: "reject",
              policyName: "no-dangerous-shell",
              reason: `Potentially dangerous shell command detected`,
              suggestion: "Use safer alternatives or confirm manually",
            }
          }
        }

        // Flag destructive commands for review
        const destructive = ["git push", "git commit", "npm publish", "npm run build"]
        for (const d of destructive) {
          if (action.command.includes(d)) {
            return {
              verdict: "flag",
              policyName: "no-dangerous-shell",
              reason: `Destructive shell command needs review: ${action.command.slice(0, 60)}`,
              suggestion: "Confirm this command is intended",
            }
          }
        }
      }
      return null
    },
  },
  {
    name: "no-sensitive-files",
    description: "Reject modifications to sensitive config files",
    severity: "error",
    check: (action) => {
      const sensitive = [
        ".env",
        ".env.local",
        ".env.production",
        "credentials.json",
        "service-account.json",
        "id_rsa",
        "id_ed25519",
        "config/secrets",
      ]
      if (action.path && sensitive.some((s) => action.path!.split("/").some((seg) => seg === s || seg.includes(s)))) {
        return {
          verdict: "reject",
          policyName: "no-sensitive-files",
          reason: `Modifications to sensitive file detected: ${action.path}`,
          suggestion: "Use the credential vault instead of editing secrets directly",
        }
      }
      return null
    },
  },
]

/** Singleton policy engine loaded with defaults */
export const policyEngine = new PolicyEngine(DEFAULT_POLICIES)

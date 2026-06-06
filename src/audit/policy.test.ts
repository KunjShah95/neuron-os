/**
 * Tests for the PolicyEngine (guardrails) and built-in default policies.
 * Covers policy registration, execution, verdict logic, and defaults.
 *
 * Usage: bun test ./src/audit/test-policy.ts
 */

import { describe, it, expect, beforeEach } from "bun:test"
import { PolicyEngine, DEFAULT_POLICIES, type Policy } from "./policy"

describe("PolicyEngine", () => {
  let engine: PolicyEngine

  beforeEach(() => {
    engine = new PolicyEngine()
  })

  // ── Registration ────────────────────────────────────────────────────

  it("should start with no policies", () => {
    expect(engine.listPolicies()).toHaveLength(0)
  })

  it("should register a single policy", () => {
    const policy: Policy = {
      name: "test-policy",
      description: "A test policy",
      severity: "info",
      check: () => null,
    }
    engine.register(policy)
    expect(engine.listPolicies()).toHaveLength(1)
    expect(engine.listPolicies()[0]!.name).toBe("test-policy")
  })

  it("should register multiple policies at once", () => {
    const policy1: Policy = { name: "p1", description: "", severity: "info", check: () => null }
    const policy2: Policy = { name: "p2", description: "", severity: "info", check: () => null }
    engine.registerAll([policy1, policy2])
    expect(engine.listPolicies()).toHaveLength(2)
  })

  it("should accept policies via constructor", () => {
    const policy: Policy = { name: "ctor-policy", description: "", severity: "error", check: () => null }
    const withDefaults = new PolicyEngine([policy])
    expect(withDefaults.listPolicies()).toHaveLength(1)
    expect(withDefaults.listPolicies()[0]!.name).toBe("ctor-policy")
  })

  // ── Check ───────────────────────────────────────────────────────────

  it("should return allow when no policies match", () => {
    const result = engine.check({ actionType: "file_write", path: "src/test.ts" })
    expect(result.verdict).toBe("allow")
    expect(result.policyName).toBe("__default__")
  })

  it("should return reject when a policy rejects", () => {
    const policy: Policy = {
      name: "block-ts",
      description: "Block .ts files",
      severity: "error",
      check: (action) => {
        if (action.path?.endsWith(".ts")) {
          return { verdict: "reject", policyName: "block-ts", reason: ".ts files not allowed" }
        }
        return null
      },
    }
    engine.register(policy)

    const result = engine.check({ actionType: "file_write", path: "src/test.ts" })
    expect(result.verdict).toBe("reject")
    expect(result.policyName).toBe("block-ts")
  })

  it("should return flag when a policy flags", () => {
    const policy: Policy = {
      name: "flag-large",
      description: "Flag large files",
      severity: "warning",
      check: (action) => {
        if (action.content && action.content.length > 100) {
          return { verdict: "flag", policyName: "flag-large", reason: "File is large" }
        }
        return null
      },
    }
    engine.register(policy)

    const result = engine.check({ actionType: "file_write", path: "big.txt", content: "x".repeat(200) })
    expect(result.verdict).toBe("flag")
    expect(result.policyName).toBe("flag-large")
  })

  it("should prefer reject over flag", () => {
    const rejectPolicy: Policy = {
      name: "reject-all",
      description: "",
      severity: "error",
      check: () => ({ verdict: "reject" as const, policyName: "reject-all", reason: "No" }),
    }
    const flagPolicy: Policy = {
      name: "flag-all",
      description: "",
      severity: "warning",
      check: () => ({ verdict: "flag" as const, policyName: "flag-all", reason: "Flag" }),
    }
    engine.registerAll([rejectPolicy, flagPolicy])

    const result = engine.check({ actionType: "test" })
    expect(result.verdict).toBe("reject")
    expect(result.policyName).toBe("reject-all")
  })

  it("should return first reject when multiple rejects", () => {
    const p1: Policy = {
      name: "reject-1",
      description: "",
      severity: "error",
      check: () => ({ verdict: "reject", policyName: "reject-1", reason: "first" }),
    }
    const p2: Policy = {
      name: "reject-2",
      description: "",
      severity: "error",
      check: () => ({ verdict: "reject", policyName: "reject-2", reason: "second" }),
    }
    engine.registerAll([p1, p2])

    const result = engine.check({ actionType: "test" })
    expect(result.policyName).toBe("reject-1")
  })

  it("should return first flag when no rejects", () => {
    const f1: Policy = {
      name: "flag-1",
      description: "",
      severity: "warning",
      check: () => ({ verdict: "flag", policyName: "flag-1", reason: "a" }),
    }
    const f2: Policy = {
      name: "flag-2",
      description: "",
      severity: "warning",
      check: () => ({ verdict: "flag", policyName: "flag-2", reason: "b" }),
    }
    engine.registerAll([f1, f2])

    const result = engine.check({ actionType: "test" })
    expect(result.policyName).toBe("flag-1")
  })

  // ── checkAll ────────────────────────────────────────────────────────

  it("should check multiple actions and return summary", () => {
    const policy: Policy = {
      name: "block-ts",
      description: "Block .ts",
      severity: "error",
      check: (action) => {
        if (action.path?.endsWith(".ts")) {
          return { verdict: "reject", policyName: "block-ts", reason: "blocked" }
        }
        return null
      },
    }
    engine.register(policy)

    const result = engine.checkAll([
      { actionType: "file_write", path: "ok.txt" },
      { actionType: "file_write", path: "bad.ts" },
    ])
    expect(result.results).toHaveLength(2)
    expect(result.rejected).toBe(true)
    expect(result.flagged).toBe(false)

    const allowed = result.results.find((r) => r.verdict === "allow")
    const rejected = result.results.find((r) => r.verdict === "reject")
    expect(allowed).toBeTruthy()
    expect(rejected).toBeTruthy()
  })

  it("should return flagged=true when any action is flagged", () => {
    const policy: Policy = {
      name: "flag-big",
      description: "",
      severity: "warning",
      check: (action) => {
        if ((action.content?.length || 0) > 50) {
          return { verdict: "flag", policyName: "flag-big", reason: "too big" }
        }
        return null
      },
    }
    engine.register(policy)

    const result = engine.checkAll([
      { actionType: "write", content: "small" },
      { actionType: "write", content: "x".repeat(100) },
    ])
    expect(result.flagged).toBe(true)
    expect(result.rejected).toBe(false)
  })

  it("should handle empty action list", () => {
    const result = engine.checkAll([])
    expect(result.results).toEqual([])
    expect(result.rejected).toBe(false)
    expect(result.flagged).toBe(false)
  })

  // ── Edge Cases ──────────────────────────────────────────────────────

  it("should handle policy returning null (no match)", () => {
    engine.register({
      name: "never-matches",
      description: "",
      severity: "info",
      check: () => null,
    })
    const result = engine.check({ actionType: "anything" })
    expect(result.verdict).toBe("allow")
  })

  it("should handle action with minimal fields", () => {
    const result = engine.check({ actionType: "unknown" })
    expect(result.verdict).toBe("allow")
  })
})

// ── DEFAULT_POLICIES Tests ─────────────────────────────────────────────

describe("DEFAULT_POLICIES", () => {
  let engine: PolicyEngine

  beforeEach(() => {
    engine = new PolicyEngine(DEFAULT_POLICIES)
  })

  it("should have 6 default policies", () => {
    expect(engine.listPolicies()).toHaveLength(6)
  })

  it("should reject node_modules modifications", () => {
    const result = engine.check({
      actionType: "file_write",
      path: "node_modules/express/index.js",
    })
    expect(result.verdict).toBe("reject")
    expect(result.policyName).toBe("no-node_modules")
  })

  it("should reject nested node_modules paths", () => {
    const result = engine.check({
      actionType: "file_delete",
      path: "packages/app/node_modules/lodash/core.js",
    })
    expect(result.verdict).toBe("reject")
    expect(result.policyName).toBe("no-node_modules")
  })

  it("should allow paths containing node_modules as prefix", () => {
    const result = engine.check({
      actionType: "file_read",
      path: "src/node_modules-helper.ts",
    })
    // Only exact segment "node_modules" triggers rejection — not as prefix
    expect(result.verdict).not.toBe("reject")
  })

  it("should reject .git directory modifications", () => {
    const result = engine.check({
      actionType: "file_write",
      path: ".git/config",
    })
    expect(result.verdict).toBe("reject")
    expect(result.policyName).toBe("no-git-dir")
  })

  it("should reject nested .git paths", () => {
    const result = engine.check({
      actionType: "file_write",
      path: "repo/.git/objects/abc123",
    })
    expect(result.verdict).toBe("reject")
    expect(result.policyName).toBe("no-git-dir")
  })

  it("should flag dist directory modifications", () => {
    const result = engine.check({
      actionType: "file_write",
      path: "dist/bundle.js",
    })
    expect(result.verdict).toBe("flag")
    expect(result.policyName).toBe("no-dist")
  })

  it("should flag .next directory modifications", () => {
    const result = engine.check({
      actionType: "file_write",
      path: ".next/build-manifest.json",
    })
    expect(result.verdict).toBe("flag")
    expect(result.policyName).toBe("no-dist")
  })

  it("should reject files larger than 1MB", () => {
    const result = engine.check({
      actionType: "file_write",
      path: "large.json",
      content: "x".repeat(1024 * 1024 + 1),
    })
    expect(result.verdict).toBe("reject")
    expect(result.policyName).toBe("max-file-size")
  })

  it("should allow files under 1MB", () => {
    const result = engine.check({
      actionType: "file_write",
      path: "small.json",
      content: "x".repeat(1024),
    })
    expect(result.verdict).toBe("allow")
  })

  it("should reject rm -rf / commands", () => {
    const result = engine.check({
      actionType: "shell_command",
      command: "rm -rf /var/log",
    })
    expect(result.verdict).toBe("reject")
    expect(result.policyName).toBe("no-dangerous-shell")
  })

  it("should flag git push commands", () => {
    const result = engine.check({
      actionType: "shell_command",
      command: "git push origin main",
    })
    expect(result.verdict).toBe("flag")
    expect(result.policyName).toBe("no-dangerous-shell")
  })

  it("should flag git commit commands", () => {
    const result = engine.check({
      actionType: "shell_command",
      command: "git commit -m 'update'",
    })
    expect(result.verdict).toBe("flag")
    expect(result.policyName).toBe("no-dangerous-shell")
  })

  it("should allow safe shell commands", () => {
    const result = engine.check({
      actionType: "shell_command",
      command: "ls -la",
    })
    expect(result.verdict).toBe("allow")
  })

  it("should reject modifications to .env files", () => {
    const result = engine.check({
      actionType: "file_write",
      path: ".env",
    })
    expect(result.verdict).toBe("reject")
    expect(result.policyName).toBe("no-sensitive-files")
  })

  it("should reject modifications to .env.local", () => {
    const result = engine.check({
      actionType: "file_write",
      path: "config/.env.local",
    })
    expect(result.verdict).toBe("reject")
    expect(result.policyName).toBe("no-sensitive-files")
  })

  it("should reject modifications to service-account.json", () => {
    const result = engine.check({
      actionType: "file_write",
      path: "secrets/service-account.json",
    })
    expect(result.verdict).toBe("reject")
    expect(result.policyName).toBe("no-sensitive-files")
  })

  it("should allow non-sensitive files", () => {
    const result = engine.check({
      actionType: "file_write",
      path: "src/components/Button.tsx",
    })
    expect(result.verdict).toBe("allow")
  })

  it("should not crash on empty action fields", () => {
    const result = engine.check({ actionType: "test" })
    expect(result.verdict).toBe("allow")
  })

  it("should handle actions with no path or command", () => {
    const result = engine.check({ actionType: "thought" })
    expect(result.verdict).toBe("allow")
  })
})

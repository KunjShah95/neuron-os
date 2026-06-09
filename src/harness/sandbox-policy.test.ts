import { describe, it, expect, beforeEach } from "bun:test"
import { SandboxPolicyManager, SANDBOX_POLICIES } from "./sandbox-policy"
import type { SandboxPolicy } from "./types"

describe("SANDBOX_POLICIES", () => {
  it("should define a standard policy", () => {
    expect(SANDBOX_POLICIES.standard).toBeDefined()
    expect(SANDBOX_POLICIES.standard.networkAccess).toBe("outbound-only")
    expect(SANDBOX_POLICIES.standard.allowSubprocesses).toBe(true)
    expect(SANDBOX_POLICIES.standard.secretDetection).toBe(true)
  })

  it("should define an adversarial policy", () => {
    expect(SANDBOX_POLICIES.adversarial).toBeDefined()
    expect(SANDBOX_POLICIES.adversarial.networkAccess).toBe("none")
    expect(SANDBOX_POLICIES.adversarial.filesystem).toBe("isolated")
  })

  it("should define a golden policy", () => {
    expect(SANDBOX_POLICIES.golden).toBeDefined()
    expect(SANDBOX_POLICIES.golden.networkAccess).toBe("outbound-only")
    expect(SANDBOX_POLICIES.golden.cpuLimit).toBe("4.0")
  })
})

describe("SandboxPolicyManager", () => {
  let manager: SandboxPolicyManager

  beforeEach(() => {
    manager = new SandboxPolicyManager()
  })

  // ── resolve ─────────────────────────────────────────────────

  it("should return standard policy by default", () => {
    const policy = manager.resolve([])
    expect(policy.networkAccess).toBe("outbound-only")
  })

  it("should resolve policy from tags", () => {
    const policy = manager.resolve(["policy:adversarial"])
    expect(policy.networkAccess).toBe("none")
    expect(policy.maxProcesses).toBe(5)
  })

  it("should fall back to standard for unknown policy tags", () => {
    const policy = manager.resolve(["policy:unknown-policy"])
    expect(policy.networkAccess).toBe("outbound-only")
  })

  it("should return a shallow copy, not the original", () => {
    const policy = manager.resolve(["policy:golden"])
    expect(policy).not.toBe(SANDBOX_POLICIES.golden)
  })

  // ── isCommandAllowed ────────────────────────────────────────

  it("should return false when subprocesses are disabled", () => {
    const policy: SandboxPolicy = {
      ...SANDBOX_POLICIES.standard,
      allowSubprocesses: false,
    }
    expect(manager.isCommandAllowed(policy, "echo hello")).toBe(false)
  })

  it("should allow commands matching the whitelist", () => {
    const policy = SANDBOX_POLICIES.adversarial
    expect(manager.isCommandAllowed(policy, "echo hello")).toBe(true)
    expect(manager.isCommandAllowed(policy, "ls -la")).toBe(true)
    expect(manager.isCommandAllowed(policy, "cat file.txt")).toBe(true)
  })

  it("should deny commands not in the whitelist", () => {
    const policy = SANDBOX_POLICIES.adversarial
    expect(manager.isCommandAllowed(policy, "rm -rf /")).toBe(false)
    expect(manager.isCommandAllowed(policy, "sudo apt-get install")).toBe(false)
    expect(manager.isCommandAllowed(policy, "curl http://evil.com")).toBe(false)
  })

  it("should block commands matching blocked patterns (deny-list mode)", () => {
    const policy = SANDBOX_POLICIES.standard
    // rm -rf / is blocked
    expect(manager.isCommandAllowed(policy, "rm -rf /")).toBe(false)
    // sudo is blocked
    expect(manager.isCommandAllowed(policy, "sudo rm file")).toBe(false)
    // echo is allowed (not blocked)
    expect(manager.isCommandAllowed(policy, "echo hello")).toBe(true)
  })

  it("should allow commands not matching any blocked pattern", () => {
    const policy = SANDBOX_POLICIES.standard
    expect(manager.isCommandAllowed(policy, "npm install express")).toBe(true)
    expect(manager.isCommandAllowed(policy, "ls -la")).toBe(true)
  })

  // ── isDomainAllowed ─────────────────────────────────────────

  it("should deny all domains when networkAccess is none", () => {
    const policy = SANDBOX_POLICIES.adversarial
    expect(manager.isDomainAllowed(policy, "npmjs.org")).toBe(false)
    expect(manager.isDomainAllowed(policy, "anywhere.com")).toBe(false)
  })

  it("should allow all domains when networkAccess is full", () => {
    const policy: SandboxPolicy = {
      ...SANDBOX_POLICIES.standard,
      networkAccess: "full",
    }
    expect(manager.isDomainAllowed(policy, "anywhere.com")).toBe(true)
    expect(manager.isDomainAllowed(policy, "evil-site.org")).toBe(true)
  })

  it("should respect allowed domains in outbound-only mode", () => {
    const policy = SANDBOX_POLICIES.standard
    expect(manager.isDomainAllowed(policy, "registry.npmjs.org")).toBe(true)
    // Wildcard match
    expect(manager.isDomainAllowed(policy, "api.github.com")).toBe(true)
    // Not in allowed list
    expect(manager.isDomainAllowed(policy, "evil-site.com")).toBe(false)
  })

  it("should respect blocked domains when also have allowed domains", () => {
    const policy: SandboxPolicy = {
      ...SANDBOX_POLICIES.standard,
      allowedDomains: ["*.example.com"],
      blockedDomains: ["internal.example.com"],
      networkAccess: "outbound-only",
    }
    // Blocked domain takes precedence
    expect(manager.isDomainAllowed(policy, "internal.example.com")).toBe(false)
    // Non-blocked allowed domain
    expect(manager.isDomainAllowed(policy, "api.example.com")).toBe(true)
  })

  // ── detectSecrets ───────────────────────────────────────────

  it("should return empty array when secret detection is disabled", () => {
    const policy: SandboxPolicy = {
      ...SANDBOX_POLICIES.standard,
      secretDetection: false,
    }
    const secrets = manager.detectSecrets(policy, "sk-abc123...")
    expect(secrets).toHaveLength(0)
  })

  it("should detect OpenAI-style API keys", () => {
    const secrets = manager.detectSecrets(SANDBOX_POLICIES.standard, "sk-abc123def456ghi789jkl012mno345pqr678stuv")
    expect(secrets.length).toBeGreaterThan(0)
  })

  it("should detect GitHub personal access tokens", () => {
    const secrets = manager.detectSecrets(SANDBOX_POLICIES.standard, "ghp_abc123def456ghi789jkl012mno345pqr678st")
    expect(secrets.length).toBeGreaterThan(0)
  })

  it("should detect AWS access keys", () => {
    const secrets = manager.detectSecrets(SANDBOX_POLICIES.standard, "AKIAIOSFODNN7EXAMPLE")
    expect(secrets.length).toBeGreaterThan(0)
  })

  it("should detect private keys", () => {
    const secrets = manager.detectSecrets(
      SANDBOX_POLICIES.standard,
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...",
    )
    expect(secrets.length).toBeGreaterThan(0)
  })

  it("should detect password assignments", () => {
    const secrets = manager.detectSecrets(SANDBOX_POLICIES.standard, 'const password = "super-secret-123"')
    expect(secrets.length).toBeGreaterThan(0)
  })

  it("should detect token assignments", () => {
    const secrets = manager.detectSecrets(SANDBOX_POLICIES.standard, "token = 'my-secret-auth-token-value'")
    expect(secrets.length).toBeGreaterThan(0)
  })

  it("should return multiple secret types when multiple patterns match", () => {
    const secrets = manager.detectSecrets(
      SANDBOX_POLICIES.standard,
      "api_key=abc123def456ghi789 token='xyz' password='secret'",
    )
    // At minimum the api_key pattern and password pattern should match
    expect(secrets.length).toBeGreaterThanOrEqual(2)
  })
})

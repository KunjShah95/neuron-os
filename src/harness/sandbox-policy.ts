import type { SandboxPolicy } from "./types"

// ── Preset Policies ──────────────────────────────────────────────

export const SANDBOX_POLICIES: Record<string, SandboxPolicy> = {
  /** Standard policy: outbound network, isolated fs, secret detection enabled */
  standard: {
    networkAccess: "outbound-only",
    allowedDomains: ["registry.npmjs.org", "*.github.com", "pypi.org", "crates.io"],
    filesystem: "isolated",
    allowSubprocesses: true,
    blockedCommands: [/rm\s+-rf\s+\//, /sudo/, />\s*\/dev\//],
    maxProcesses: 10,
    secretDetection: true,
    cpuLimit: "2.0",
    memoryLimit: "1g",
    diskLimit: "2g",
    maxFileSize: 1 * 1024 * 1024, // 1MB
  },

  /** Adversarial policy: no network, strict command whitelist, tight limits */
  adversarial: {
    networkAccess: "none",
    filesystem: "isolated",
    allowSubprocesses: true,
    allowedCommands: [/^echo/, /^ls/, /^cat/, /^pwd/, /^mkdir/],
    blockedCommands: [],
    maxProcesses: 5,
    secretDetection: true,
    cpuLimit: "1.0",
    memoryLimit: "512m",
    diskLimit: "500m",
    maxFileSize: 512 * 1024, // 512KB
  },

  /** Golden dataset policy: generous limits, minimal restrictions */
  golden: {
    networkAccess: "outbound-only",
    allowedDomains: ["registry.npmjs.org", "github.com"],
    filesystem: "isolated",
    allowSubprocesses: true,
    blockedCommands: [/rm\s+-rf/, /sudo/, /chmod\s+777/],
    maxProcesses: 10,
    secretDetection: true,
    cpuLimit: "4.0",
    memoryLimit: "4g",
    diskLimit: "10g",
    maxFileSize: 10 * 1024 * 1024, // 10MB
  },
}

// ── Policy Manager ───────────────────────────────────────────────

export class SandboxPolicyManager {
  /**
   * Resolve the policy for a set of tags.
   * Tags can be "policy:standard", "policy:adversarial", or "policy:golden".
   * Falls back to "standard".
   */
  resolve(tags: string[]): SandboxPolicy {
    for (const tag of tags) {
      if (tag.startsWith("policy:")) {
        const policyName = tag.slice(7)
        const policy = SANDBOX_POLICIES[policyName]
        if (policy) return { ...policy } as SandboxPolicy
      }
    }
    return { ...SANDBOX_POLICIES.standard } as SandboxPolicy
  }

  /**
   * Check if a command is allowed by the policy.
   */
  isCommandAllowed(policy: SandboxPolicy, cmd: string): boolean {
    if (!policy.allowSubprocesses) return false

    // If allowed commands are specified (whitelist mode), only those are allowed
    if (policy.allowedCommands && policy.allowedCommands.length > 0) {
      for (const pattern of policy.allowedCommands) {
        if (pattern.test(cmd)) return true
      }
      return false
    }

    // Check blocked commands (deny list mode)
    if (policy.blockedCommands) {
      for (const pattern of policy.blockedCommands) {
        if (pattern.test(cmd)) return false
      }
    }

    return true
  }

  /**
   * Check if a domain is allowed by the policy.
   */
  isDomainAllowed(policy: SandboxPolicy, domain: string): boolean {
    if (policy.networkAccess === "none") return false
    if (policy.networkAccess === "full") return true

    if (policy.blockedDomains) {
      for (const blocked of policy.blockedDomains) {
        if (this.matchDomain(domain, blocked)) return false
      }
    }

    if (policy.allowedDomains) {
      for (const allowed of policy.allowedDomains) {
        if (this.matchDomain(domain, allowed)) return true
      }
      return false
    }

    return true
  }

  private matchDomain(domain: string, pattern: string): boolean {
    // Support wildcards: *.github.com
    if (pattern.startsWith("*.")) {
      return domain.endsWith(pattern.slice(1))
    }
    return domain === pattern
  }

  /**
   * Scan output for secrets using configured patterns.
   * Returns list of detected secret types.
   */
  detectSecrets(policy: SandboxPolicy, output: string): string[] {
    if (!policy.secretDetection) return []

    const secrets: string[] = []
    const patterns = policy.secretPatterns ?? [
      /(?:api[_-]?key|apikey)[=:]\s*['"]?[A-Za-z0-9_\-]{16,}/i,
      /sk-[A-Za-z0-9]{32,}/,           // OpenAI-style keys
      /ghp_[A-Za-z0-9]{36,}/,          // GitHub PAT
      /AKIA[0-9A-Z]{16}/,              // AWS access key
      /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/,
      /password\s*[=:]\s*['"][^'"]{4,}['"]/i,
      /token\s*[=:]\s*['"][^'"]{8,}['"]/i,
    ]

    for (const pattern of patterns) {
      if (pattern.test(output)) {
        secrets.push(pattern.source)
      }
    }

    return secrets
  }
}

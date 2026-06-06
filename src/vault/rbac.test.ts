import { describe, it, expect, beforeEach } from "bun:test"
/**
 * Unit tests for the Vault RBAC module.
 *
 * Tests policy CRUD operations, role-based access checks,
 * agent ID filtering, and environment variable injection.
 */

import { VaultRBAC, type SecretAccessPolicy } from "./rbac"

describe("VaultRBAC", () => {
  let rbac: VaultRBAC

  beforeEach(async () => {
    rbac = new VaultRBAC()
    // Initialize seeds default policies
    await rbac.initialize()
  })

  // ══════════════════════════════════════════════════════════════════
  //  Policy CRUD
  // ══════════════════════════════════════════════════════════════════

  it("should set and get a policy", async () => {
    const policy: SecretAccessPolicy = { allowedRoles: ["developer"] }
    await rbac.setPolicy("MY_SECRET", policy)

    const retrieved = await rbac.getPolicy("MY_SECRET")
    expect(retrieved).toBeDefined()
    expect(retrieved!.allowedRoles).toEqual(["developer"])
  })

  it("should return undefined for nonexistent policy", async () => {
    const policy = await rbac.getPolicy("NONEXISTENT")
    expect(policy).toBeUndefined()
  })

  it("should update an existing policy", async () => {
    await rbac.setPolicy("UPDATE_TEST", { allowedRoles: ["developer"] })
    await rbac.setPolicy("UPDATE_TEST", { allowedRoles: ["developer", "system"] })

    const retrieved = await rbac.getPolicy("UPDATE_TEST")
    expect(retrieved!.allowedRoles).toEqual(["developer", "system"])
  })

  it("should store policy with agent ID restrictions", async () => {
    const policy: SecretAccessPolicy = {
      allowedRoles: ["developer"],
      allowedAgentIds: ["agent-alpha"],
    }
    await rbac.setPolicy("RESTRICTED_KEY", policy)

    const retrieved = await rbac.getPolicy("RESTRICTED_KEY")
    expect(retrieved!.allowedAgentIds).toEqual(["agent-alpha"])
  })

  // ══════════════════════════════════════════════════════════════════
  //  Access Checks
  // ══════════════════════════════════════════════════════════════════

  it("should deny access when no policy exists", async () => {
    const result = await rbac.checkAccess("UNKNOWN_SECRET", "developer", "agent-1")
    expect(result).toBeNull()
  })

  it("should deny access for disallowed role", async () => {
    await rbac.setPolicy("SYSTEM_ONLY", { allowedRoles: ["system"] })

    const result = await rbac.checkAccess("SYSTEM_ONLY", "developer", "agent-1")
    expect(result).toBeNull()
  })

  it("should allow access for allowed role", async () => {
    // First store the actual secret value so checkAccess can retrieve it
    const { credentialVault } = await import("./manager")
    await credentialVault.set("DEV_KEY", "sk-real-value")

    await rbac.setPolicy("DEV_KEY", { allowedRoles: ["developer"] })
    const result = await rbac.checkAccess("DEV_KEY", "developer", "agent-1")
    expect(result).toBe("sk-real-value")
  })

  it("should deny access for disallowed agent ID", async () => {
    await rbac.setPolicy("AGENT_SPECIFIC", {
      allowedRoles: ["developer"],
      allowedAgentIds: ["agent-allowed"],
    })

    const result = await rbac.checkAccess("AGENT_SPECIFIC", "developer", "agent-blocked")
    expect(result).toBeNull()
  })

  it("should handle multiple roles in policy", async () => {
    const { credentialVault } = await import("./manager")
    await credentialVault.set("MULTI_ROLE", "shared-secret")
    await rbac.setPolicy("MULTI_ROLE", { allowedRoles: ["developer", "researcher", "system"] })

    // All allowed roles should be permitted and return the secret
    expect(await rbac.checkAccess("MULTI_ROLE", "developer", "dev-1")).toBe("shared-secret")
    expect(await rbac.checkAccess("MULTI_ROLE", "researcher", "res-1")).toBe("shared-secret")
    expect(await rbac.checkAccess("MULTI_ROLE", "system", "sys-1")).toBe("shared-secret")

    // Auditor should be denied
    expect(await rbac.checkAccess("MULTI_ROLE", "auditor", "aud-1")).toBeNull()
  })

  // ══════════════════════════════════════════════════════════════════
  //  Environment Variable Injection
  // ══════════════════════════════════════════════════════════════════

  it("should get env vars for agent role", async () => {
    // Store actual secret values so getEnvForAgent can retrieve them
    const { credentialVault } = await import("./manager")
    await credentialVault.set("GITHUB_TOKEN", "gh_test")
    await credentialVault.set("OPENAI_API_KEY", "sk_test")
    await credentialVault.set("AWS_ACCESS_KEY_ID", "AKI_test")

    // Developer should have access to GITHUB_TOKEN and OPENAI_API_KEY
    const env = await rbac.getEnvForAgent("developer", "dev-agent")
    expect(env["GITHUB_TOKEN"]).toBe("gh_test")
    expect(env["OPENAI_API_KEY"]).toBe("sk_test")
    // AWS_ACCESS_KEY_ID requires "system" role, so developer should be denied
    expect(env["AWS_ACCESS_KEY_ID"]).toBeUndefined()
  })

  it("should return empty env for untrusted role", async () => {
    // After initialize(), default policies are seeded
    const env = await rbac.getEnvForAgent("untrusted", "unknown")

    // Untrusted role isn't in any default policy, so all should be denied
    expect(Object.keys(env).length).toBe(0)
  })

  it("should filter secrets by agent role", async () => {
    // getEnvForAgent checks policies and returns only allowed secrets
    // Untrusted role has no access to any default policies
    const env = await rbac.getEnvForAgent("untrusted", "unknown")
    // untrusted is not in any default policy, so all secrets should be denied
    expect(env["GITHUB_TOKEN"]).toBeUndefined()
    expect(env["OPENAI_API_KEY"]).toBeUndefined()
  })

  // ══════════════════════════════════════════════════════════════════
  //  Policy Listing
  // ══════════════════════════════════════════════════════════════════

  it("should list all policies after initialization", async () => {
    const policies = await rbac.listPolicies()
    // Default policies should be seeded
    expect(policies.length).toBeGreaterThanOrEqual(5)
  })

  it("should list policies after adding new ones", async () => {
    await rbac.setPolicy("NEW_KEY_1", { allowedRoles: ["developer"] })
    await rbac.setPolicy("NEW_KEY_2", { allowedRoles: ["system"] })

    const policies = await rbac.listPolicies()
    const newKeys = policies.filter(p => p.secretKey.startsWith("NEW_KEY_"))
    expect(newKeys.length).toBe(2)
  })

  it("should include policy details in listing", async () => {
    const policies = await rbac.listPolicies()
    for (const entry of policies) {
      expect(typeof entry.secretKey).toBe("string")
      expect(Array.isArray(entry.policy.allowedRoles)).toBe(true)
    }
  })

  // ══════════════════════════════════════════════════════════════════
  //  Initialization
  // ══════════════════════════════════════════════════════════════════

  it("should be idempotent on repeated initialize", async () => {
    await rbac.initialize() // second call
    await rbac.initialize() // third call

    const policies = await rbac.listPolicies()
    expect(policies.length).toBeGreaterThanOrEqual(5)
  })

  it("should seed default policies on first init", async () => {
    const freshRbac = new VaultRBAC()
    await freshRbac.initialize()

    const policies = await freshRbac.listPolicies()
    const defaultKeys = policies.map(p => p.secretKey)
    expect(defaultKeys).toContain("GITHUB_TOKEN")
    expect(defaultKeys).toContain("OPENAI_API_KEY")
    expect(defaultKeys).toContain("ANTHROPIC_API_KEY")
    expect(defaultKeys).toContain("AWS_ACCESS_KEY_ID")
    expect(defaultKeys).toContain("AWS_SECRET_ACCESS_KEY")
  })

})

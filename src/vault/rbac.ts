import { createLogger } from "../cli/logger"
import { credentialVault } from "./manager"

const log = createLogger("vault-rbac")

export type AgentRole = "system" | "developer" | "researcher" | "auditor" | "untrusted"

export interface SecretAccessPolicy {
  allowedRoles: AgentRole[]
  allowedAgentIds?: string[]
}

const RBAC_POLICY_PREFIX = "rbac_policy:"
const RBAC_METADATA_KEY = "rbac_policies_index"

export class VaultRBAC {
  private initialized = false

  /**
   * Load RBAC policies from the encrypted credential vault.
   * Falls back to defaults if no policies are stored yet.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      await credentialVault.initialize()

      // Check if we have stored policies
      const index = await credentialVault.get(RBAC_METADATA_KEY, "global")

      if (index) {
        const keys: string[] = JSON.parse(index)
        log.info(`Found ${keys.length} RBAC policies in encrypted vault`)
      } else {
        // First run — seed default policies
        log.info("No RBAC policies found, seeding defaults")
        await this.seedDefaultPolicies()
      }
    } catch (err) {
      log.warn("Failed to initialize RBAC from vault, using in-memory defaults", { error: String(err) })
    }

    this.initialized = true
  }

  private async seedDefaultPolicies(): Promise<void> {
    const defaults: Record<string, SecretAccessPolicy> = {
      GITHUB_TOKEN: { allowedRoles: ["system", "developer"] },
      OPENAI_API_KEY: { allowedRoles: ["system", "developer", "researcher"] },
      ANTHROPIC_API_KEY: { allowedRoles: ["system", "developer", "researcher"] },
      AWS_ACCESS_KEY_ID: { allowedRoles: ["system"] },
      AWS_SECRET_ACCESS_KEY: { allowedRoles: ["system"] },
    }

    const keys: string[] = []
    for (const [secretKey, policy] of Object.entries(defaults)) {
      const policyKey = `${RBAC_POLICY_PREFIX}${secretKey}`
      await credentialVault.set(policyKey, JSON.stringify(policy), "global")
      keys.push(policyKey)
    }

    await credentialVault.set(RBAC_METADATA_KEY, JSON.stringify(keys), "global")
    log.info(`Seeded ${keys.length} default RBAC policies`)
  }

  /**
   * Store or update an access policy for a secret key.
   * Persisted to the encrypted vault.
   */
  async setPolicy(secretKey: string, policy: SecretAccessPolicy): Promise<void> {
    const policyKey = `${RBAC_POLICY_PREFIX}${secretKey}`
    await credentialVault.set(policyKey, JSON.stringify(policy), "global")

    // Update the index
    const indexRaw = await credentialVault.get(RBAC_METADATA_KEY, "global")
    const keys: string[] = indexRaw ? JSON.parse(indexRaw) : []
    if (!keys.includes(policyKey)) {
      keys.push(policyKey)
      await credentialVault.set(RBAC_METADATA_KEY, JSON.stringify(keys), "global")
    }

    log.info(`Stored RBAC policy for secret: ${secretKey}`)
  }

  /**
   * Get the access policy for a secret key.
   * Returns the policy from the vault, or undefined if not configured.
   */
  async getPolicy(secretKey: string): Promise<SecretAccessPolicy | undefined> {
    const policyKey = `${RBAC_POLICY_PREFIX}${secretKey}`
    const raw = await credentialVault.get(policyKey, "global")
    if (!raw) return undefined
    try {
      return JSON.parse(raw) as SecretAccessPolicy
    } catch {
      return undefined
    }
  }

  /**
   * Check if an agent with a given role and ID can access a secret.
   * Returns the secret value if allowed, null if denied.
   */
  async checkAccess(secretKey: string, agentRole: AgentRole, agentId: string): Promise<string | null> {
    const policy = await this.getPolicy(secretKey)
    if (!policy) {
      log.warn(`Access denied for ${secretKey}: No policy defined`)
      return null
    }

    const roleAllowed = policy.allowedRoles.includes(agentRole)
    const idAllowed = policy.allowedAgentIds ? policy.allowedAgentIds.includes(agentId) : true

    if (roleAllowed && idAllowed) {
      // Fetch the actual secret value from the vault
      const value = await credentialVault.get(secretKey, "global")
      if (value) {
        log.info(`Agent ${agentId} (${agentRole}) accessed secret: ${secretKey}`)
        return value
      }
      log.warn(`Secret ${secretKey} not found in vault`)
      return null
    }

    log.warn(`Access denied to ${secretKey} for agent ${agentId} (${agentRole})`)
    return null
  }

  /**
   * Get all environment variables accessible by a given agent role and ID.
   * Fetches from the encrypted vault, respecting RBAC policies.
   */
  async getEnvForAgent(agentRole: AgentRole, agentId: string): Promise<Record<string, string>> {
    const env: Record<string, string> = {}

    // Get all stored policy keys
    const indexRaw = await credentialVault.get(RBAC_METADATA_KEY, "global")
    if (!indexRaw) return env
    const policyKeys: string[] = JSON.parse(indexRaw)

    for (const policyKey of policyKeys) {
      const secretKey = policyKey.replace(RBAC_POLICY_PREFIX, "")
      const value = await this.checkAccess(secretKey, agentRole, agentId)
      if (value !== null) {
        env[secretKey] = value
      }
    }

    return env
  }

  /**
   * List all policies for display/debug purposes (without secret values).
   */
  async listPolicies(): Promise<Array<{ secretKey: string; policy: SecretAccessPolicy }>> {
    const policies: Array<{ secretKey: string; policy: SecretAccessPolicy }> = []
    const indexRaw = await credentialVault.get(RBAC_METADATA_KEY, "global")
    if (!indexRaw) return policies

    const policyKeys: string[] = JSON.parse(indexRaw)
    for (const policyKey of policyKeys) {
      const secretKey = policyKey.replace(RBAC_POLICY_PREFIX, "")
      const raw = await credentialVault.get(policyKey, "global")
      if (raw) {
        try {
          policies.push({ secretKey, policy: JSON.parse(raw) as SecretAccessPolicy })
        } catch {
          // skip invalid policies
        }
      }
    }
    return policies
  }
}

export const vaultRBAC = new VaultRBAC()

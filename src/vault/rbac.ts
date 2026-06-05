import { createLogger } from "../cli/logger"

const log = createLogger("vault-rbac")

export type AgentRole = "system" | "developer" | "researcher" | "auditor" | "untrusted"

export interface SecretAccessPolicy {
  allowedRoles: AgentRole[]
  allowedAgentIds?: string[]
}

export class VaultRBAC {
  private secrets = new Map<string, string>()
  private policies = new Map<string, SecretAccessPolicy>()

  constructor() {
    // Basic policies
    this.policies.set("GITHUB_TOKEN", { allowedRoles: ["system", "developer"] })
    this.policies.set("OPENAI_API_KEY", { allowedRoles: ["system", "developer", "researcher"] })
    this.policies.set("AWS_ACCESS_KEY", { allowedRoles: ["system"] })
  }

  public storeSecret(key: string, value: string, policy?: SecretAccessPolicy) {
    this.secrets.set(key, value)
    if (policy) {
      this.policies.set(key, policy)
    }
    log.info(`Stored secret: ${key}`)
  }

  public getSecret(key: string, agentRole: AgentRole, agentId: string): string | null {
    const policy = this.policies.get(key)
    if (!policy) {
      log.warn(`Access denied for ${key}: No policy defined`)
      return null
    }

    const roleAllowed = policy.allowedRoles.includes(agentRole)
    const idAllowed = policy.allowedAgentIds ? policy.allowedAgentIds.includes(agentId) : true

    if (roleAllowed && idAllowed) {
      log.info(`Agent ${agentId} (${agentRole}) accessed secret: ${key}`)
      return this.secrets.get(key) || null
    } else {
      log.warn(`Access denied to ${key} for agent ${agentId} (${agentRole})`)
      return null
    }
  }

  public getEnvForAgent(agentRole: AgentRole, agentId: string): Record<string, string> {
    const env: Record<string, string> = {}
    for (const key of this.secrets.keys()) {
      const val = this.getSecret(key, agentRole, agentId)
      if (val !== null) {
        env[key] = val
      }
    }
    return env
  }
}

export const vault = new VaultRBAC()

import { createLogger } from "../cli/logger"

const log = createLogger("policy")

export type ActionType = "read" | "write" | "execute" | "network"

export interface PolicyRule {
  action: ActionType | "*"
  targetPattern: string // regex string
  allow: boolean
}

export class PolicyEngine {
  private rules: PolicyRule[] = []
  public strictMode = false

  constructor() {
    // Base Security Rules
    // Protect system roots
    this.addRule({ action: "execute", targetPattern: "^rm -rf /", allow: false })
    // Protect env variables
    this.addRule({ action: "execute", targetPattern: "env|printenv", allow: false })
    this.addRule({ action: "read", targetPattern: ".*\\.env.*", allow: false })
    this.addRule({ action: "write", targetPattern: ".*\\.env.*", allow: false })
    // Protect AWS/SSH keys
    this.addRule({ action: "read", targetPattern: ".*\\.ssh/.*", allow: false })
    this.addRule({ action: "read", targetPattern: ".*\\.aws/.*", allow: false })
  }

  public addRule(rule: PolicyRule) {
    this.rules.push(rule)
  }

  /**
   * Evaluates if an action against a target string is allowed.
   * Target for 'execute' is the command string.
   * Target for 'read'/'write' is the file path.
   * Target for 'network' is the URL or domain.
   */
  public evaluate(action: ActionType, target: string): boolean {
    // Process rules in reverse order so newer rules take precedence
    for (let i = this.rules.length - 1; i >= 0; i--) {
      const rule = this.rules[i]
      if (!rule) continue
      if (rule.action === "*" || rule.action === action) {
        try {
          const regex = new RegExp(rule.targetPattern)
          if (regex.test(target)) {
            if (!rule.allow) {
              log.warn(`Policy blocked ${action} on target: ${target}`)
            }
            return rule.allow
          }
        } catch (e) {
          log.error(`Invalid regex in policy rule: ${rule.targetPattern}`)
        }
      }
    }
    
    // If strictMode is on, default is deny unless explicitly allowed
    if (this.strictMode) {
      log.warn(`Policy strictly blocked ${action} on target: ${target}`)
      return false
    }
    
    return true
  }

  public enforce(action: ActionType, target: string): void {
    if (!this.evaluate(action, target)) {
      throw new Error(`Security Policy Violation: Action '${action}' on '${target}' is not allowed.`)
    }
  }
}

export const policyEngine = new PolicyEngine()

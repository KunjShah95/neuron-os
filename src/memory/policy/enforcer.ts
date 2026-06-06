import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { parse, stringify } from "yaml"
import { minimatch } from "minimatch"
import { createLogger } from "../../cli/logger"
import { MemoryPolicy } from "./schema"
import type { MemoryPolicy as MemoryPolicyType, Decision, Principal } from "./schema"

const log = createLogger("policy-enforcer")

const POLICIES_DIR = join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "memory", "namespaces")

function policyPath(namespace: string): string {
  return join(POLICIES_DIR, namespace, "policy.yaml")
}

export function loadPolicy(namespace: string): MemoryPolicyType | null {
  const path = policyPath(namespace)
  if (!existsSync(path)) return null

  try {
    const raw = readFileSync(path, "utf-8")
    const parsed = parse(raw)
    const result = MemoryPolicy.safeParse(parsed)
    if (result.success) return result.data
    log.warn(`Invalid policy for namespace ${namespace}`)
    return null
  } catch {
    return null
  }
}

export function savePolicy(policy: MemoryPolicyType): void {
  const dir = join(POLICIES_DIR, policy.namespace)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(policyPath(policy.namespace), stringify(policy), "utf-8")
}

export function createDefaultPolicy(namespace: string, owner: string): MemoryPolicyType {
  const policy: MemoryPolicyType = {
    namespace,
    owner,
    default: "deny",
    allow: [],
    deny: [],
  }
  savePolicy(policy)
  return policy
}

function matchesPrincipal(rulePrincipal: string, requester: Principal): boolean {
  // rule: "team-b" => requester.team === "team-b"
  // rule: "agent:agent-x" => requester.agent === "agent-x"
  // rule: "role:review" => requester.role === "review"
  // rule: "group:engineering" => requester.group === "engineering"
  const colonIdx = rulePrincipal.indexOf(":")
  if (colonIdx >= 0) {
    const prefix = rulePrincipal.slice(0, colonIdx)
    const value = rulePrincipal.slice(colonIdx + 1)
    if (prefix === "agent") return requester.agent === value
    if (prefix === "role") return requester.role === value
    if (prefix === "group") return requester.group === value
    if (prefix === "team") return requester.team === value
    return false
  }
  // Bare name = team name
  return requester.team === rulePrincipal
}

function matchesPath(pattern: string | undefined, path: string): boolean {
  if (!pattern || pattern === "*" || pattern === "**") return true
  if (path.startsWith(pattern)) return true
  return minimatch(path, pattern)
}

export function canRead(requester: Principal, namespace: string, path: string, tool: string): Decision {
  const policy = loadPolicy(namespace)
  if (!policy) return { allowed: false, reason: "no_policy_default_deny" }

  // Owner can always read
  if (requester.team === policy.owner) return { allowed: true, reason: "owner" }

  // Deny rules win
  for (const rule of policy.deny) {
    if (matchesPrincipal(rule.principal, requester) && matchesPath(rule.path_filter, path)) {
      return { allowed: false, reason: rule.reason ?? "deny_rule" }
    }
  }

  // Allow rules
  const now = Date.now()
  for (const rule of policy.allow) {
    if (!matchesPrincipal(rule.principal, requester)) continue
    if (!matchesPath(rule.path_filter, path)) continue
    if (rule.expires_at && now > rule.expires_at) continue
    if (!rule.tools_allowed.includes("*") && !rule.tools_allowed.includes(tool)) continue
    return { allowed: true, reason: "allow_rule", rule_id: `${namespace}:${rule.principal}` }
  }

  if (policy.default === "allow") {
    return { allowed: true, reason: "default_allow" }
  }

  return { allowed: false, reason: "no_allow_rule" }
}

export function canExecute(requester: Principal, namespace: string, path: string, tool: string): Decision {
  return canRead(requester, namespace, path, tool)
}

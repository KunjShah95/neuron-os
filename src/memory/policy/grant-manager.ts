import { existsSync, readdirSync } from "fs"
import { join } from "path"
import { createLogger } from "../../cli/logger"
import { loadPolicy, savePolicy } from "./enforcer"

const log = createLogger("grant-manager")

const POLICIES_DIR = join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "memory", "namespaces")

export interface Grant {
  id: string
  namespace: string
  principal: string
  path_filter?: string
  tools_allowed: string[]
  expires_at?: number
  issued_at: number
}

export function issueGrant(params: {
  namespace: string
  to: string
  path?: string
  tools?: string[]
  expires?: number
}): Grant {
  const policy = loadPolicy(params.namespace)
  if (!policy) {
    throw new Error(`Namespace ${params.namespace} has no policy. Create it first with aegis memory policy init.`)
  }

  // Allow * includes all tools
  const tools = params.tools ?? ["*"]

  // Check if the grant already exists (avoid duplicates)
  const existing = policy.allow.findIndex(
    (a) => a.principal === params.to && a.path_filter === (params.path ?? a.path_filter),
  )

  const newAllow = {
    principal: params.to,
    path_filter: params.path,
    tools_allowed: tools,
    expires_at: params.expires,
  }

  if (existing >= 0) {
    policy.allow[existing] = newAllow
  } else {
    policy.allow.push(newAllow)
  }

  savePolicy(policy)

  const grant: Grant = {
    id: `${params.namespace}:${params.to}:${Date.now()}`,
    namespace: params.namespace,
    principal: params.to,
    path_filter: params.path,
    tools_allowed: tools,
    expires_at: params.expires,
    issued_at: Date.now(),
  }

  log.info(`Grant issued: ${params.to} can read ${params.namespace}${params.path ? "/" + params.path : ""}`)
  return grant
}

export function revokeGrant(namespace: string, principal: string): boolean {
  const policy = loadPolicy(namespace)
  if (!policy) return false

  const before = policy.allow.length
  policy.allow = policy.allow.filter((a) => a.principal !== principal)

  if (policy.allow.length === before) return false

  savePolicy(policy)
  log.info(`Grant revoked: ${principal} from ${namespace}`)
  return true
}

export function listGrants(namespace?: string): Grant[] {
  const dirs = namespace
    ? [join(POLICIES_DIR, namespace)]
    : readdirSync(POLICIES_DIR, { withFileTypes: true })
        .filter((d: { isDirectory: () => unknown }) => d.isDirectory())
        .map((d: { name: string }) => join(POLICIES_DIR, d.name))

  const grants: Grant[] = []
  for (const dir of dirs) {
    const policyPath = join(dir, "policy.yaml")
    if (!existsSync(policyPath)) continue
    const ns = dir.split(/[\\/]/).pop() ?? "?"
    const policy = loadPolicy(ns)
    if (!policy) continue

    for (const rule of policy.allow) {
      grants.push({
        id: `${ns}:${rule.principal}:${Date.now()}`,
        namespace: ns,
        principal: rule.principal,
        path_filter: rule.path_filter,
        tools_allowed: rule.tools_allowed,
        expires_at: rule.expires_at,
        issued_at: Date.now(),
      })
    }
  }

  return grants
}

export function checkExpiredGrants(): Array<{ namespace: string; principal: string; grant_id: string }> {
  const expired: Array<{ namespace: string; principal: string; grant_id: string }> = []
  const dirs = readdirSync(POLICIES_DIR, { withFileTypes: true })
    .filter((d: { isDirectory: () => unknown }) => d.isDirectory())
    .map((d: { name: string }) => d.name)

  const now = Date.now()
  for (const ns of dirs) {
    const policy = loadPolicy(ns)
    if (!policy) continue

    const active = policy.allow.filter((a) => a.expires_at && a.expires_at <= now)
    for (const rule of active) {
      expired.push({
        namespace: ns,
        principal: rule.principal,
        grant_id: `${ns}:${rule.principal}`,
      })
    }

    // Remove expired grants
    policy.allow = policy.allow.filter((a) => !a.expires_at || a.expires_at > now)
    savePolicy(policy)
  }

  return expired
}

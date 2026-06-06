import type { Command } from "commander"
import { createDefaultPolicy, loadPolicy, canRead } from "../../memory/policy/enforcer"
import { issueGrant, revokeGrant, listGrants, checkExpiredGrants } from "../../memory/policy/grant-manager"
import type { Principal } from "../../memory/policy/schema"
import { readFileSync, existsSync } from "fs"
import { join } from "path"

const AUDIT_PATH = join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "memory", "audit.jsonl")

export function registerMemoryPolicy(mem: Command): void {
  const policy = mem
    .command("policy")
    .description("Cross-team memory ACL — access control lists for namespaces")

  policy
    .command("init")
    .description("Create a default (deny-all) policy for a namespace")
    .argument("<namespace>", "Memory namespace (e.g. project-alpha)")
    .argument("<owner>", "Owner team name (e.g. platform-team)")
    .action((namespace: string, owner: string) => {
      const existing = loadPolicy(namespace)
      if (existing) {
        console.log(`Policy already exists for namespace "${namespace}".`)
        return
      }
      const policy = createDefaultPolicy(namespace, owner)
      console.log(`Created default-deny policy for namespace "${policy.namespace}" (owner: ${policy.owner})`)
    })

  policy
    .command("grant")
    .description("Grant access to a memory namespace")
    .argument("<namespace>", "Memory namespace")
    .argument("<principal>", "Principal (team name, agent:agent-x, role:review, group:engineering)")
    .option("-p, --path <path>", "Path filter glob")
    .option("-t, --tools <tools>", "Comma-separated tool names (default: all)")
    .option("-e, --expires <hours>", "Expiry in hours from now")
    .action((namespace: string, principal: string, opts: { path?: string; tools?: string; expires?: string }) => {
      try {
        const expires = opts.expires ? Date.now() + parseInt(opts.expires, 10) * 3600_000 : undefined
        const grant = issueGrant({
          namespace,
          to: principal,
          path: opts.path,
          tools: opts.tools?.split(",").map((s) => s.trim()),
          expires,
        })
        console.log(`Grant issued: ${grant.id}`)
        console.log(`  ${principal} → ${namespace}${opts.path ? "/" + opts.path : ""}`)
        if (opts.tools) console.log(`  Tools: ${opts.tools}`)
        if (opts.expires) console.log(`  Expires: ${new Date(expires!).toISOString()}`)
      } catch (err: any) {
        console.log(`Error: ${err.message ?? String(err)}`)
      }
    })

  policy
    .command("revoke")
    .description("Revoke a grant from a namespace")
    .argument("<namespace>", "Memory namespace")
    .argument("<principal>", "Principal to revoke")
    .action((namespace: string, principal: string) => {
      const ok = revokeGrant(namespace, principal)
      if (ok) {
        console.log(`Revoked: ${principal} from ${namespace}`)
      } else {
        console.log(`No grant found for ${principal} in ${namespace}`)
      }
    })

  policy
    .command("list")
    .description("List grants for a namespace (or all namespaces)")
    .argument("[namespace]", "Optional namespace filter")
    .action((namespace?: string) => {
      const grants = listGrants(namespace || undefined)
      if (grants.length === 0) {
        console.log("No grants found.")
        return
      }
      for (const g of grants) {
        const expires = g.expires_at ? new Date(g.expires_at).toISOString() : "never"
        const expired = g.expires_at && g.expires_at <= Date.now() ? " [EXPIRED]" : ""
        console.log(`  ${g.id}`)
        console.log(`    Principal: ${g.principal}`)
        console.log(`    Namespace: ${g.namespace}${g.path_filter ? "/" + g.path_filter : ""}`)
        console.log(`    Tools:     ${g.tools_allowed.join(", ")}`)
        console.log(`    Expires:   ${expires}${expired}`)
        console.log()
      }
    })

  policy
    .command("check")
    .description("Check if a principal can read a path in a namespace")
    .argument("<namespace>", "Memory namespace")
    .argument("<principal>", "Principal (e.g. team-name, agent:agent-x)")
    .argument("<path>", "Path to check (e.g. config/**)")
    .argument("[tool]", "Tool name (default: read)")
    .action((namespace: string, principal: string, path: string, tool?: string) => {
      const requester: Principal = {}
      const colonIdx = principal.indexOf(":")
      if (colonIdx >= 0) {
        const prefix = principal.slice(0, colonIdx)
        const value = principal.slice(colonIdx + 1)
        if (prefix === "agent") requester.agent = value
        else if (prefix === "role") requester.role = value
        else if (prefix === "group") requester.group = value
        else requester.team = principal
      } else {
        requester.team = principal
      }

      const decision = canRead(requester, namespace, path, tool ?? "read")
      if (decision.allowed) {
        console.log(`ALLOWED (${decision.reason})${decision.rule_id ? ` — rule: ${decision.rule_id}` : ""}`)
      } else {
        console.log(`DENIED — ${decision.reason}`)
      }
    })

  policy
    .command("audit")
    .description("Show recent policy audit log entries")
    .option("-n, --lines <count>", "Number of entries", "20")
    .action((opts: { lines?: string }) => {
      if (!existsSync(AUDIT_PATH)) {
        console.log("No audit log entries yet.")
        return
      }
      const lines = parseInt(opts.lines ?? "20", 10)
      const content = readFileSync(AUDIT_PATH, "utf-8")
      const entries = content.trim().split("\n").filter(Boolean).slice(-lines)
      if (entries.length === 0) {
        console.log("No audit log entries.")
        return
      }
      for (const entry of entries) {
        try {
          const e = JSON.parse(entry)
          const icon = e.allowed ? "✓" : "✗"
          console.log(`  ${icon} ${e.event.padEnd(14)} ${e.requester.padEnd(20)} ${e.namespace}${e.path ? "/" + e.path : ""}${e.tool ? " [" + e.tool + "]" : ""}`)
          console.log(`    ${e.reason}${e.rule_id ? " (" + e.rule_id + ")" : ""}`)
        } catch {
          // skip malformed entries
        }
      }
    })

  policy
    .command("expired")
    .description("Check for and clean up expired grants")
    .action(() => {
      const expired = checkExpiredGrants()
      if (expired.length === 0) {
        console.log("No expired grants found.")
        return
      }
      for (const e of expired) {
        console.log(`  Cleaned up expired grant: ${e.principal} from ${e.namespace}`)
      }
    })

  policy
    .command("show")
    .description("Show full policy for a namespace")
    .argument("<namespace>", "Memory namespace")
    .action((namespace: string) => {
      const policy = loadPolicy(namespace)
      if (!policy) {
        console.log(`No policy found for namespace "${namespace}".`)
        console.log("Create one with: aegis memory policy init <namespace> <owner>")
        return
      }
      console.log(`Namespace: ${policy.namespace}`)
      console.log(`Owner:     ${policy.owner}`)
      console.log(`Default:   ${policy.default}`)
      console.log()
      console.log(`Allow rules (${policy.allow.length}):`)
      for (const r of policy.allow) {
        const expires = r.expires_at ? ` (expires ${new Date(r.expires_at).toISOString()})` : ""
        console.log(`  ${r.principal} → ${r.path_filter ?? "*"} [${r.tools_allowed.join(", ")}]${expires}`)
      }
      console.log()
      console.log(`Deny rules (${policy.deny.length}):`)
      for (const r of policy.deny) {
        console.log(`  ${r.principal} → ${r.path_filter ?? "*"}${r.reason ? ` (${r.reason})` : ""}`)
      }
    })
}

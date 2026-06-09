import type { Command } from "commander"
import { RBACManager, type Permission, type RoleName } from "../../auth/rbac"
import { EncryptedCredentialVault, VaultEnvLoader } from "../../vault"
import { SLOManager } from "../../observability/slo"
import { TraceCollector } from "../../observability/integrations"
import { DashboardProvider } from "../../observability/dashboard"
import { triggerEngine } from "../../triggers/registry"
import { BackgroundAgentManager } from "../../triggers/background"

const rbac = new RBACManager()
const vault = new EncryptedCredentialVault()
const slo = new SLOManager()
const background = new BackgroundAgentManager(triggerEngine)

function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt)
    process.stdin.once("data", (data) => {
      resolve(data.toString().trim())
    })
  })
}

function promptValue(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt)
    process.stdin.once("data", (data) => {
      resolve(data.toString().trim())
    })
  })
}

export function registerProduction(program: Command): void {
  const production = program
    .command("production")
    .description("Production hardening features: RBAC, vault, SLO, traces, background agents")

  // ── RBAC ──────────────────────────────────────────────────────────
  const rbacCmd = production.command("rbac").description("Role-based access control management")

  const userCmd = rbacCmd.command("user").description("Manage RBAC users")

  userCmd
    .command("create")
    .description("Create a new user")
    .argument("<name>", "User display name")
    .option("-r, --roles <roles>", "Comma-separated initial roles")
    .action(async (name: string, opts) => {
      const roles = opts.roles ? (opts.roles.split(",").map((s: string) => s.trim()) as RoleName[]) : []
      const user = rbac.createUser(name, roles)
      console.log(`\n  User created: ${user.id} (${user.name})\n`)
    })

  userCmd
    .command("list")
    .description("List all users")
    .action(async () => {
      const stats = rbac.getStats()
      console.log(`\n  Total users: ${stats.totalUsers}\n`)
    })

  userCmd
    .command("roles")
    .description("Modify user roles")
    .argument("<id>", "User ID")
    .option("--add <role>", "Role to add")
    .option("--remove <role>", "Role to remove")
    .action(async (id: string, opts) => {
      if (opts.add) {
        const ok = rbac.addUserRole(id, opts.add as RoleName)
        console.log(ok ? `\n  Role "${opts.add}" added.\n` : `\n  Failed to add role.\n`)
      }
      if (opts.remove) {
        const ok = rbac.removeUserRole(id, opts.remove as RoleName)
        console.log(ok ? `\n  Role "${opts.remove}" removed.\n` : `\n  Failed to remove role.\n`)
      }
    })

  const keyCmd = rbacCmd.command("key").description("Manage API keys")

  keyCmd
    .command("generate")
    .description("Generate an API key for a user")
    .argument("<user-id>", "User ID")
    .option("-l, --label <label>", "Human-readable label for the key")
    .action(async (userId: string, opts) => {
      const result = rbac.generateApiKey(userId, opts.label ?? "cli-generated")
      console.log(`\n  API Key: ${result.apiKey}\n`)
      console.log(`  Key Hash: ${result.credential.keyHash}`)
      console.log(`  Label: ${result.credential.label}`)
      console.log(`  Roles: ${result.credential.roles.join(", ")}\n`)
      console.log(`  ⚠  This is the only time the raw key will be shown. Store it securely.\n`)
    })

  keyCmd
    .command("list")
    .description("List all API keys")
    .action(async () => {
      const keys = rbac.listApiKeys()
      if (keys.length === 0) {
        console.log("\n  No API keys.\n")
        return
      }
      console.log(`\n  ${keys.length} API key(s):\n`)
      for (const k of keys) {
        const status = k.enabled ? "✓" : "✗"
        console.log(`  ${status} ${k.label}`)
        console.log(`     Hash:     ${k.keyHash.slice(0, 16)}...`)
        console.log(`     Roles:    ${k.roles.join(", ")}`)
        console.log(`     Created:  ${k.createdAt}`)
        console.log(`     Last used: ${k.lastUsed || "never"}`)
        console.log()
      }
    })

  keyCmd
    .command("revoke")
    .description("Revoke an API key")
    .argument("<key-hash>", "SHA-256 hash of the API key")
    .action(async (keyHash: string) => {
      const ok = rbac.revokeApiKey(keyHash)
      console.log(ok ? "\n  API key revoked.\n" : "\n  API key not found.\n")
    })

  rbacCmd
    .command("check")
    .description("Check if a user has a permission")
    .argument("<user-id>", "User ID")
    .argument("<permission>", "Permission to check")
    .action(async (userId: string, permission: string) => {
      const has = rbac.hasPermission(userId, permission as Permission)
      console.log(has ? `\n  ✓ User ${userId} has "${permission}"\n` : `\n  ✗ User ${userId} lacks "${permission}"\n`)
    })

  rbacCmd
    .command("protect")
    .description("Register a route permission requirement")
    .argument("<route>", "Route pattern (e.g. /api/v1/agents)")
    .requiredOption("-p, --permission <perm>", "Permission required (e.g. agent:spawn)")
    .option("-m, --method <method>", "HTTP method (default: ALL)")
    .action(async (route: string, opts) => {
      const perm = opts.permission as Permission
      const method = (opts.method ?? "ALL").toUpperCase()
      rbac.protectRoute(route, method, perm)
      console.log(`\n  Protected ${method} ${route} → "${perm}"\n`)
    })

  // ── Vault ─────────────────────────────────────────────────────────
  const vaultCmd = production.command("vault").description("Encrypted credential vault management")

  vaultCmd
    .command("init")
    .description("Initialize the vault with a master password")
    .action(async () => {
      try {
        const pw = await promptPassword("Enter master password: ")
        vault.initialize(pw)
        console.log("\n  Vault initialized.\n")
      } catch (err: unknown) {
        console.log(`\n  ❌ ${err instanceof Error ? err.message : String(err)}\n`)
      }
    })

  vaultCmd
    .command("unlock")
    .description("Unlock the vault")
    .action(async () => {
      const pw = await promptPassword("Enter master password: ")
      const ok = vault.unlock(pw)
      if (ok) {
        const { syncVaultToProviders } = await import("../../vault/provider-bridge")
        const synced = syncVaultToProviders(vault)
        console.log(`\n  Vault unlocked. Synced ${synced} provider credentials.\n`)
      } else {
        console.log("\n  ❌ Failed to unlock vault.\n")
      }
    })

  vaultCmd
    .command("lock")
    .description("Lock the vault")
    .action(async () => {
      vault.lock()
      console.log("\n  Vault locked.\n")
    })

  vaultCmd
    .command("store")
    .description("Store a credential")
    .argument("<name>", "Credential name")
    .option("-t, --type <type>", "Credential type", "password")
    .action(async (name: string, opts) => {
      const value = await promptValue("Enter value to store: ")
      try {
        const entry = vault.store(name, value, opts.type as any)
        console.log(`\n  Stored: ${entry.id} (${entry.name})\n`)
      } catch (err: unknown) {
        console.log(`\n  ❌ ${err instanceof Error ? err.message : String(err)}\n`)
      }
    })

  vaultCmd
    .command("get")
    .description("Retrieve a credential")
    .argument("<name>", "Credential name")
    .action(async (name: string) => {
      try {
        const result = vault.retrieveByName(name)
        if (result) {
          console.log(`\n  ${result.entry.name}: ${result.value}\n`)
        } else {
          console.log("\n  Credential not found.\n")
        }
      } catch (err: unknown) {
        console.log(`\n  ❌ ${err instanceof Error ? err.message : String(err)}\n`)
      }
    })

  vaultCmd
    .command("list")
    .description("List credentials")
    .option("-t, --type <type>", "Filter by type")
    .action(async (opts) => {
      const entries = vault.list(opts.type as any)
      if (entries.length === 0) {
        console.log("\n  No entries.\n")
        return
      }
      console.log(`\n  ${entries.length} entry(ies):\n`)
      for (const e of entries) {
        const expires = e.metadata.expiresAt ? ` (expires: ${e.metadata.expiresAt})` : ""
        console.log(`  ${e.name} (${e.type})${expires}`)
        console.log(`     ID:    ${e.id}`)
        console.log(`     Accesses: ${e.accessCount}`)
        console.log()
      }
    })

  vaultCmd
    .command("delete")
    .description("Delete a credential")
    .argument("<id>", "Entry ID")
    .action(async (id: string) => {
      const ok = vault.delete(id)
      console.log(ok ? "\n  Deleted.\n" : "\n  Not found.\n")
    })

  vaultCmd
    .command("env")
    .description("Load a vault entry as environment variables")
    .argument("<entry-name>", "Vault entry name")
    .action(async (entryName: string) => {
      try {
        const loader = new VaultEnvLoader(vault)
        loader.loadAsEnv([entryName])
        console.log(
          `\n  Loaded "${entryName}" as AEGIS_VAULT_${entryName.toUpperCase().replace(/[^a-zA-Z0-9_]/g, "_")}\n`,
        )
      } catch (err: unknown) {
        console.log(`\n  ❌ ${err instanceof Error ? err.message : String(err)}\n`)
      }
    })

  vaultCmd
    .command("status")
    .description("Show vault status")
    .action(async () => {
      const stats = vault.getStats()
      console.log(`\n  Vault status:`)
      console.log(`  Locked:     ${stats.locked}`)
      console.log(`  Entries:    ${stats.totalEntries}`)
      console.log(`  Expired:    ${stats.expired}`)
      console.log(
        `  Types:      ${Object.entries(stats.types)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")}\n`,
      )
    })

  // ── SLO ───────────────────────────────────────────────────────────
  const sloCmd = production.command("slo").description("Service Level Objective management")

  sloCmd
    .command("register")
    .description("Register an SLO")
    .argument("<name>", "SLO name")
    .requiredOption("--target <n>", "Target value (e.g. 0.999 for 99.9%)", parseFloat)
    .requiredOption(
      "--metric <m>",
      "Metric type: uptime, success_rate, error_rate, latency_p50, latency_p95, latency_p99",
    )
    .option("--window <days>", "Rolling window in days", "30")
    .option("--desc <text>", "Description")
    .option("--threshold <n>", "Threshold for latency metrics (ms)", parseFloat)
    .action(async (name: string, opts) => {
      slo.register({
        name,
        description: opts.desc ?? "",
        target: opts.target,
        windowDays: parseInt(opts.window),
        metric: opts.metric,
        threshold: opts.threshold,
      })
      console.log(`\n  SLO "${name}" registered (target: ${opts.target}, metric: ${opts.metric})\n`)
    })

  sloCmd
    .command("status")
    .description("Check SLO status")
    .option("-n, --name <name>", "SLO name (omit for all)")
    .action(async (opts) => {
      if (opts.name) {
        const result = slo.check(opts.name)
        if (result) {
          const icon = result.met ? "✓" : "✗"
          console.log(`\n  ${icon} ${result.name}`)
          console.log(
            `     Current: ${(result.current * 100).toFixed(2)}% (target: ${(result.target * 100).toFixed(2)}%)`,
          )
          const burn = slo.getBurnRate(result.name)
          if (burn) console.log(`     Burn rate: ${burn.rate.toFixed(2)}x (time remaining: ${burn.timeRemaining})`)
          console.log(`     Window: ${result.windowDays}d, data points: ${result.history.length}`)
          console.log()
        } else {
          console.log(`\n  SLO "${opts.name}" not found.\n`)
        }
      } else {
        const results = slo.checkAll()
        if (results.length === 0) {
          console.log("\n  No SLOs registered.\n")
          return
        }
        console.log(`\n  ${results.length} SLO(s):\n`)
        for (const r of results) {
          const icon = r.met ? "✓" : "✗"
          console.log(`  ${icon} ${r.name}: ${(r.current * 100).toFixed(2)}% (target: ${(r.target * 100).toFixed(2)}%)`)
        }
        console.log()
      }
    })

  sloCmd
    .command("report")
    .description("Full SLO report")
    .action(async () => {
      const results = slo.checkAll()
      if (results.length === 0) {
        console.log("\n  No SLOs registered.\n")
        return
      }
      console.log("\n  ═══════════════════════════════════════")
      console.log("  SLO Report")
      console.log("  ═══════════════════════════════════════\n")
      for (const r of results) {
        const icon = r.met ? "✓" : "✗"
        console.log(`  ${icon} ${r.name}`)
        console.log(`     Metric:    ${r.metric}`)
        console.log(`     Target:    ${(r.target * 100).toFixed(2)}%`)
        console.log(`     Current:   ${(r.current * 100).toFixed(2)}%`)
        console.log(`     Window:    ${r.windowDays}d`)
        console.log(`     Met:       ${r.met ? "YES" : "NO"}`)
        console.log()
      }
    })

  // ── Dashboard ────────────────────────────────────────────────────
  production
    .command("dashboard")
    .description("Show production dashboard")
    .action(async () => {
      const provider = new DashboardProvider()
      const data = await provider.getDashboardData()
      console.log("\n  ═══════════════════════════════════════")
      console.log("  Production Dashboard")
      console.log("  ═══════════════════════════════════════\n")
      console.log(`  System Uptime:          ${(data.systemUptime * 100).toFixed(2)}%`)
      console.log(`  Agents:                 ${data.activeAgents}/${data.totalAgents} active`)
      console.log(`  Total Sessions:         ${data.totalSessions}`)
      console.log(`  Recent Errors:          ${data.recentErrors}`)
      console.log(`  Avg Latency:            ${data.avgLatency.toFixed(0)}ms`)
      console.log(`  Cost Today:             $${data.costToday.toFixed(4)}`)
      console.log(`  Cost This Week:         $${data.costThisWeek.toFixed(4)}`)
      console.log(`  Budget Remaining:       $${data.budgetRemaining.toFixed(4)}\n`)
      if (data.sloResults.length > 0) {
        console.log("  SLOs:")
        for (const s of data.sloResults) {
          const icon = s.met ? "✓" : "✗"
          console.log(`    ${icon} ${s.name}: ${(s.current * 100).toFixed(2)}%`)
        }
        console.log()
      }
      if (data.topFailures.length > 0) {
        console.log("  Top Failures:")
        for (const f of data.topFailures.slice(0, 5)) {
          console.log(`    ${f.count}x  ${f.pattern.slice(0, 60)}`)
        }
        console.log()
      }
    })

  // ── Traces ───────────────────────────────────────────────────────
  const traceCmd = production.command("trace").description("Trace span querying")

  traceCmd
    .command("query")
    .description("Query trace spans")
    .option("-t, --type <type>", "Filter by type (agent, tool, llm, ipc, auth, memory)")
    .option("-s, --status <status>", "Filter by status (ok, error, pending)")
    .option("--since <date>", "Show spans since date (ISO 8601)")
    .option("-l, --limit <n>", "Max results", "50")
    .action(async (opts) => {
      const collector = new TraceCollector()
      const spans = collector.query({
        type: opts.type,
        status: opts.status,
        since: opts.since,
        limit: parseInt(opts.limit),
      })
      if (spans.length === 0) {
        console.log("\n  No trace spans found.\n")
        return
      }
      console.log(`\n  ${spans.length} trace span(s):\n`)
      for (const s of spans) {
        const statusIcon = s.status === "ok" ? "✓" : s.status === "error" ? "✗" : "⋯"
        console.log(`  ${statusIcon} ${s.name} (${s.type})`)
        console.log(`     ID:     ${s.id}`)
        console.log(`     Status: ${s.status}`)
        if (s.duration !== undefined) console.log(`     Duration: ${s.duration}ms`)
        console.log()
      }
    })

  // ── Background Agents ────────────────────────────────────────────
  const bgCmd = production.command("background").description("Background agent management")

  bgCmd
    .command("list")
    .description("List background agents")
    .action(async () => {
      const agents = background.listBackgroundAgents()
      if (agents.length === 0) {
        console.log("\n  No background agents.\n")
        return
      }
      console.log(`\n  ${agents.length} background agent(s):\n`)
      for (const a of agents) {
        const status = a.enabled ? "✓" : "✗"
        console.log(`  ${status} ${a.name} (${a.type})`)
        console.log(`     ID:    ${a.id}`)
        console.log(`     Goal:  ${a.action.goal}`)
        console.log()
      }
    })

  bgCmd
    .command("status")
    .description("Background agent status overview")
    .action(async () => {
      const statuses = background.getStatus()
      if (statuses.length === 0) {
        console.log("\n  No background agents or file watchers.\n")
        return
      }
      console.log(`\n  ${statuses.length} background worker(s):\n`)
      for (const s of statuses) {
        const icon = s.enabled ? "✓" : "✗"
        const lastFired = s.lastFired ? ` (last: ${new Date(s.lastFired).toLocaleString()})` : ""
        console.log(`  ${icon} ${s.name} [${s.type}] — ${s.fireCount} fires${lastFired}`)
      }
      console.log()
    })
}

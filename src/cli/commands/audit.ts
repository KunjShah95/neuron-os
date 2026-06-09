import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerAudit(program: Command) {
  const audit = program.command("audit").description("Audit trail — record and replay agent decisions")

  audit.command("stats").alias("types").description("Show audit store statistics").action(handleAuditStats)

  audit
    .command("recent")
    .description("Show recent audit entries")
    .option("-l, --limit <number>", "Number of entries to show", "20")
    .option("--project <name>", "Filter by project")
    .action(handleAuditRecent)

  audit
    .command("replay <sessionId>")
    .description("Replay a session step-by-step from the audit log")
    .action(handleAuditReplay)

  audit.command("timeline <sessionId>").description("Show compact timeline of a session").action(handleAuditTimeline)

  audit.command("policy").description("List registered policies").action(handleAuditPolicy)
}

async function handleAuditStats() {
  await showBanner()
  const { auditStore } = await import("../../audit/store")
  const stats = auditStore.getStats()

  console.log(theme.heading("\n  📋 Audit Store Statistics\n"))
  console.log(`  Total entries:   ${theme.bold(String(stats.totalEntries))}`)
  console.log(`  Total sessions:  ${theme.bold(String(stats.totalSessions))}`)
  console.log()
  console.log(theme.dim("  By type:"))
  for (const [type, count] of Object.entries(stats.byType).sort(([, a], [, b]) => b - a)) {
    console.log(`  ${theme.muted(type)}: ${count}`)
  }
  console.log()
}

async function handleAuditRecent(opts: { limit?: string; project?: string }) {
  await showBanner()
  const limit = parseInt(opts.limit ?? "20", 10) || 20
  const { auditStore } = await import("../../audit/store")
  const entries = auditStore.getRecent(limit, opts.project)

  if (entries.length === 0) {
    console.log(theme.dim("\n  No audit entries found.\n"))
    return
  }

  console.log(theme.heading(`\n  📋 Recent Audit Entries (${entries.length})\n`))
  for (const e of entries) {
    const icon = e.eventType === "error" ? theme.error("✗") : theme.muted("•")
    const time = e.timestamp.slice(11, 19)
    console.log(`  ${icon} ${time} ${theme.dim(`[${e.eventType}]`)} ${e.summary.slice(0, 80)}`)
  }
  console.log()
}

async function handleAuditReplay(sessionId: string) {
  await showBanner()
  const { SessionReplay } = await import("../../audit/replay")

  try {
    const replay = new SessionReplay(sessionId)
    const summary = replay.getSummary()
    console.log(summary)
  } catch (err: unknown) {
    console.log(theme.error(`\n  ✗ ${err instanceof Error ? err.message : String(err)}\n`))
  }
}

async function handleAuditTimeline(sessionId: string) {
  await showBanner()
  const { SessionReplay } = await import("../../audit/replay")

  try {
    const replay = new SessionReplay(sessionId)
    const timeline = replay.getTimeline()
    console.log(timeline)
    console.log()
  } catch (err: unknown) {
    console.log(theme.error(`\n  ✗ ${err instanceof Error ? err.message : String(err)}\n`))
  }
}

async function handleAuditPolicy() {
  await showBanner()
  const { policyEngine } = await import("../../audit/policy")

  const policies = policyEngine.listPolicies()
  console.log(theme.heading(`\n  🛡️  Guardrails (${policies.length} policies)\n`))
  for (const p of policies) {
    const severityIcon =
      p.severity === "error" ? theme.error("🔴") : p.severity === "warning" ? theme.warn("🟡") : theme.info("🔵")
    console.log(`  ${severityIcon} ${theme.bold(p.name)}`)
    console.log(`     ${theme.dim(p.description)}`)
    console.log(`     ${theme.muted(p.severity)}`)
    console.log()
  }
}

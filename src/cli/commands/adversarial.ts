import type { Command } from "commander"
import { loadFindings, loadRecentFindings } from "../../adversarial/findings-store"

export function registerAdversarial(program: Command): void {
  const adversarial = program
    .command("adversarial")
    .alias("adv")
    .description("Red-team adversarial self-play")

  adversarial
    .command("enable")
    .description("Enable adversarial self-play in config")
    .action(() => {
      console.log("Set `adversarial.enabled: true` in Aegis config to enable.")
      console.log("Or run: aegis config set adversarial.enabled true")
    })

  adversarial
    .command("disable")
    .description("Disable adversarial self-play in config")
    .action(() => {
      console.log("Set `adversarial.enabled: false` in Aegis config to disable.")
      console.log("Or run: aegis config set adversarial.enabled false")
    })

  adversarial
    .command("status")
    .description("Show recent adversarial findings summary")
    .action(() => {
      const recent = loadRecentFindings(7)
      const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 }
      for (const f of recent) {
        const key = f.severity as keyof typeof bySeverity
        bySeverity[key]++
      }
      console.log(`Recent findings (7d): ${recent.length} total`)
      console.log(`  Critical: ${bySeverity.critical}`)
      console.log(`  High:     ${bySeverity.high}`)
      console.log(`  Medium:   ${bySeverity.medium}`)
      console.log(`  Low:      ${bySeverity.low}`)
    })

  adversarial
    .command("findings")
    .description("List adversarial findings")
    .option("--since <days>", "Filter by recency (days)", "7")
    .option("--severity <level>", "Filter by minimum severity (low|medium|high|critical)")
    .option("--task <id>", "Filter by task ID")
    .action((opts: { since?: string; severity?: string; task?: string }) => {
      const since = opts.since ? parseInt(opts.since, 10) : undefined
      const findings = opts.task
        ? loadFindings(opts.task, since)
        : loadRecentFindings(since, opts.severity)

      if (findings.length === 0) {
        console.log("No findings.")
        return
      }

      for (const f of findings) {
        const tag = f.ratcheted ? " [RATCHETED]" : ""
        console.log(`  ${f.severity.padEnd(8)} ${f.finding_type.padEnd(14)} ${f.id}${tag}`)
        console.log(`    ${f.description.slice(0, 120)}`)
        if (f.ratchet_case_path) console.log(`    -> ${f.ratchet_case_path}`)
        console.log()
      }
    })

  adversarial
    .command("ratchet")
    .description("Manage ratcheted regression cases")
    .argument("[action]", "list | revert <finding_id>", "list")
    .argument("[findingId]", "Finding ID to revert")
    .action((action: string, findingId?: string) => {
      if (action === "list") {
        const all = loadRecentFindings(365)
        const ratcheted = all.filter((f) => f.ratcheted)
        if (ratcheted.length === 0) {
          console.log("No ratcheted findings.")
          return
        }
        console.log(`Ratcheted findings (${ratcheted.length}):`)
        for (const f of ratcheted) {
          const path = f.ratchet_case_path ?? "?"
          console.log(`  ${f.id} -> ${path} (${f.severity})`)
        }
      } else if (action === "revert" && findingId) {
        console.log(`Reverted finding ${findingId} (mark ratcheted=false)`)
      } else {
        console.log("Usage: aegis adversarial ratchet list")
        console.log("       aegis adversarial ratchet revert <finding_id>")
      }
    })
}

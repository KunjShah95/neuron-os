import type { Command } from "commander"
import { globalDetector } from "../../debate/detector"
import { listDecisionRecords, loadDecisionRecord } from "../../debate/record"

export function registerDebate(program: Command): void {
  const debate = program
    .command("debate")
    .description("Disagreement detection and arbitration")

  debate
    .command("pending")
    .description("List unresolved disagreements")
    .action(() => {
      // Pending = no record yet (in-memory only)
      listDecisionRecords() // ensure module is loaded
      const claims = globalDetector.getClaims()
      const subjects = new Set(claims.map((c) => c.subject))
      if (subjects.size === 0) {
        console.log("No pending disagreements.")
        return
      }
      for (const subject of subjects) {
        const subjectClaims = claims.filter((c) => c.subject === subject)
        const agents = [...new Set(subjectClaims.map((c) => c.agent_id))]
        console.log(`  ${subject} (${agents.length} agents, ${subjectClaims.length} claims)`)
        for (const c of subjectClaims) {
          console.log(`    ${c.agent_id}: ${c.position} (confidence: ${c.confidence})`)
        }
        console.log()
      }
    })

  debate
    .command("resolved")
    .description("List resolved disagreements")
    .option("--since <days>", "Filter by recency", "7")
    .action((opts: { since?: string }) => {
      const records = listDecisionRecords()
      const sinceDays = opts.since ? parseInt(opts.since, 10) : 7
      const cutoff = Date.now() - sinceDays * 86400_000
      const recent = records.filter((r) => r.resolved_at >= cutoff)

      if (recent.length === 0) {
        console.log("No resolved disagreements.")
        return
      }
      for (const r of recent) {
        const winning = r.positions.find((p) => p.claim_id === r.verdict.winning_claim_id)
        console.log(`  ${r.disagreement_id} (${r.subject})`)
        console.log(`    Winner: ${winning?.agent_id ?? "?"} — ${r.verdict.reasoning.slice(0, 80)}`)
        console.log(`    Resolved: ${new Date(r.resolved_at).toISOString()}`)
        console.log()
      }
    })

  debate
    .command("show")
    .description("Show full disagreement record")
    .argument("<disagreement_id>", "Disagreement ID")
    .action((id: string) => {
      const record = loadDecisionRecord(id)
      if (!record) {
        console.log(`No record found for: ${id}`)
        return
      }

      console.log(`Disagreement: ${record.disagreement_id}`)
      console.log(`Subject: ${record.subject}`)
      console.log(`Resolved: ${new Date(record.resolved_at).toISOString()}`)
      console.log()
      console.log("Positions:")
      for (const pos of record.positions) {
        const winner = pos.claim_id === record.verdict.winning_claim_id ? " [WINNER]" : ""
        console.log(`  ${pos.agent_id}${winner}`)
        console.log(`    Position: ${pos.position}`)
        console.log(`    Confidence: ${pos.confidence}`)
        console.log(`    Evidence: ${pos.evidence.join(", ")}`)
        console.log()
      }
      console.log("Verdict:")
      console.log(`  Winner: ${record.verdict.winning_claim_id}`)
      console.log(`  Reasoning: ${record.verdict.reasoning}`)
      if (record.signed) {
        console.log(`  Signed: ${record.signed.slice(0, 16)}...`)
      }
    })
}

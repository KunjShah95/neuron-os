/**
 * experience/retrieval — Inference-time experience context injection.
 *
 * Wraps ExperienceStore.searchByGoalSimilarity with formatting suitable
 * for the agent's system prompt. The output is a markdown block that
 * AgentEngine prepends before the first model call.
 *
 * Used by AgentEngine.streamChat / chat when experience is enabled.
 */

import type { ExperienceRecord, ExperienceStore } from "./store"

export interface RetrievedExperience {
  record: ExperienceRecord
  similarity: number
}

export interface RetrievedOptions {
  limit?: number
  project?: string
  minSimilarity?: number
}

const OUTCOME_ICONS: Record<ExperienceRecord["outcome"], string> = {
  success: "✅",
  partial: "➖",
  failed: "❌",
  reverted: "↩️",
}

export class ExperienceRetriever {
  constructor(private store: ExperienceStore) {}

  searchSimilar(goal: string, opts?: RetrievedOptions): RetrievedExperience[] {
    const limit = opts?.limit ?? 5
    return this.store
      .searchByGoalSimilarity(goal, limit, opts?.project)
      .filter(
        (r) =>
          opts?.minSimilarity === undefined ||
          r.similarity >= opts.minSimilarity,
      )
      .map((r) => ({ record: r, similarity: r.similarity }))
  }

  formatContext(retrieved: RetrievedExperience[]): string {
    if (retrieved.length === 0) return ""

    const lines: string[] = ["## Prior Experience (similar goals)", ""]

    for (const { record, similarity } of retrieved) {
      const icon = OUTCOME_ICONS[record.outcome] ?? "•"
      const goal = record.goal.slice(0, 80).replace(/\n/g, " ")
      const summary = record.summary.slice(0, 200).replace(/\n/g, " ")
      lines.push(
        `### ${icon} [reward: ${record.reward.toFixed(2)}, sim: ${similarity.toFixed(2)}] ${goal}`,
      )
      lines.push(`Summary: ${summary}`)
      lines.push("")
    }

    const failures = retrieved.filter(
      (r) => r.record.outcome === "failed" || r.record.outcome === "reverted",
    )
    if (failures.length > 0) {
      lines.push("## Avoid (failed/reverted patterns)")
      for (const f of failures) {
        const summary = f.record.summary.slice(0, 120).replace(/\n/g, " ")
        lines.push(`- ${summary}`)
      }
      lines.push("")
    }

    return lines.join("\n").trimEnd()
  }
}

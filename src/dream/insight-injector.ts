import { loadConfig, saveConfig } from "../config"
import type { DreamInsight } from "./types"

export interface InsightInjectorOptions {
  maxFresh?: number
  promoteConfidence?: number
  promoteMinSources?: number
}

const DEFAULTS: Required<InsightInjectorOptions> = {
  maxFresh: 5,
  promoteConfidence: 0.8,
  promoteMinSources: 3,
}

export function buildInsightContext(
  insights: DreamInsight[],
  persistedInsights: string[],
  opts: InsightInjectorOptions = {},
): string {
  const { maxFresh } = { ...DEFAULTS, ...opts }

  const fresh = insights
    .filter((i) => i.actionable && !i.applied)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxFresh)

  const lines: string[] = []

  if (persistedInsights.length > 0) {
    lines.push("## Learned Behaviors (persisted from prior cycles)")
    for (const p of persistedInsights) {
      lines.push(`- ${p}`)
    }
  }

  if (fresh.length > 0) {
    if (lines.length > 0) lines.push("")
    lines.push("## Agent Learnings (from recent dream cycle)")
    for (const i of fresh) {
      lines.push(`- [${i.type}] ${i.title} (confidence: ${i.confidence.toFixed(2)})`)
    }
  }

  return lines.join("\n")
}

export function promoteInsights(
  insights: DreamInsight[],
  opts: InsightInjectorOptions = {},
): void {
  const { promoteConfidence, promoteMinSources } = { ...DEFAULTS, ...opts }

  const candidates = insights.filter(
    (i) => i.confidence >= promoteConfidence && i.sourceCount >= promoteMinSources && i.actionable,
  )

  if (candidates.length === 0) return

  const config = loadConfig()
  const existing = new Set(config.persistedInsights ?? [])

  for (const c of candidates) {
    const entry = `[${c.type}] ${c.title}`
    existing.add(entry)
  }

  saveConfig({ ...config, persistedInsights: [...existing].slice(-20) })
}

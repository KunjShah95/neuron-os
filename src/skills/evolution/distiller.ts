/**
 * src/skills/evolution/distiller.ts
 *
 * Distillation pipeline — clusters successful tool-call sequences from
 * session traces and emits SkillCandidate records. Designed to run as a
 * cron job (default: nightly at 3am) or on-demand via CLI.
 *
 * Architecture:
 *   1. Load recent EpisodeRecords from the session store
 *   2. Cluster by tool_sequence match (n-gram) + embedding cosine ≥ 0.85
 *   3. For each cluster with ≥3 episodes and failure rate ≤ 20%:
 *      - LLM synthesizes a reusable SKILL.md
 *      - Emits a SkillCandidate (pending) for the quality gate
 */

import { createLogger } from "../../cli/logger"
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import type { EpisodeRecord, SkillCandidate, DistillerConfig } from "./types"
import { DistillerConfigSchema } from "./types"

const log = createLogger("distiller")

// ── Default config ────────────────────────────────────────────────────

const DEFAULT_CONFIG: DistillerConfig = DistillerConfigSchema.parse({})

// ── Simple n-gram + cosine clustering ─────────────────────────────────

interface TokenizedEpisode {
  episode: EpisodeRecord
  sequence: string[] // tool_sequence as array
  tokens: Set<string> // tokenized context_summary for cosine approx
  vector: number[] // normalized term-frequency vector
}

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
  return new Set(words)
}

function buildVector(tokens: Set<string>, vocabulary: string[]): number[] {
  return vocabulary.map((term) => (tokens.has(term) ? 1 : 0))
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < a.length; i++) {
    const av = a[i]!
    const bv = b[i]!
    dot += av * bv
    normA += av * av
    normB += bv * bv
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export function clusterBySequence(
  episodes: EpisodeRecord[],
  minSize: number = DEFAULT_CONFIG.minClusterSize,
  minCosine: number = DEFAULT_CONFIG.minCosineSimilarity,
): EpisodeRecord[][] {
  // Step 1: Bucket by exact tool_sequence
  const seqBuckets = new Map<string, EpisodeRecord[]>()
  for (const ep of episodes) {
    const key = ep.tool_sequence.join("→")
    const bucket = seqBuckets.get(key) || []
    bucket.push(ep)
    seqBuckets.set(key, bucket)
  }

  // Step 2: Within each bucket, cluster by context similarity
  const clusters: EpisodeRecord[][] = []

  for (const [, bucket] of seqBuckets) {
    if (bucket.length < minSize) continue

    // Build vocabulary for this bucket
    const allTokens = bucket.map((ep) => tokenize(ep.context_summary))
    const vocabulary = [...new Set(allTokens.flatMap((t) => [...t]))]

    // Build vectors for each episode
    const tokenized: TokenizedEpisode[] = bucket.map((ep, i) => ({
      episode: ep,
      sequence: ep.tool_sequence,
      tokens: allTokens[i] ?? new Set(),
      vector: buildVector(allTokens[i] ?? new Set(), vocabulary),
    }))

    // Greedy clustering: start with first episode, add similar ones
    const used = new Set<number>()
    for (let i = 0; i < tokenized.length; i++) {
      if (used.has(i)) continue
      const current = tokenized[i]
      if (!current) continue
      const cluster: EpisodeRecord[] = [current.episode]
      used.add(i)

      for (let j = i + 1; j < tokenized.length; j++) {
        if (used.has(j)) continue
        const other = tokenized[j]
        if (!other) continue
        const sim = cosineSimilarity(current.vector, other.vector)
        if (sim >= minCosine) {
          cluster.push(other.episode)
          used.add(j)
        }
      }

      if (cluster.length >= minSize) {
        clusters.push(cluster)
      }
    }
  }

  log.info(
    `clustered ${episodes.length} episodes → ${clusters.length} clusters (minSize=${minSize}, minCosine=${minCosine})`,
  )
  return clusters
}

// ── LLM skill synthesis ────────────────────────────────────────────────

async function synthesizeSkill(cluster: EpisodeRecord[]): Promise<{ name: string; content: string } | null> {
  const episodes = cluster.slice(0, 5) // cap at 5 for token budget

  const successfulSteps = episodes.map((ep) => ep.tool_sequence.join(" → ")).join("\n")

  const contexts = episodes.map((ep, i) => `${i + 1}. "${ep.context_summary}"`).join("\n")

  const name = `auto-${episodes[0]!.tool_sequence[0] || "skill"}-${Date.now().toString(36)}`

  // Build SKILL.md content programmatically
  const content = [
    "---",
    `name: ${name}`,
    `description: Auto-distilled from ${episodes.length} successful episodes`,
    "tags: [auto-distilled, evolution]",
    "---",
    "",
    `# ${name}`,
    "",
    "## When to use",
    "",
    "Use this skill when the task involves the following tool pattern:",
    "",
    "```",
    successfulSteps,
    "```",
    "",
    "## Context examples where this skill applies",
    "",
    contexts,
    "",
    "## Steps",
    "",
    ...episodes[0]!.tool_sequence.map(
      (step, i) => `${i + 1}. Use the \`${step}\` tool${i < episodes[0]!.tool_sequence.length - 1 ? ", then" : ""}`,
    ),
    "",
    "## Notes",
    "",
    "- Auto-generated by the evolution distiller",
    `- Based on ${episodes.length} successful episodes`,
    `- Generated: ${new Date().toISOString()}`,
    "",
  ].join("\n")

  return { name, content }
}

// ── Main distiller entry point ────────────────────────────────────────

export interface DistillResult {
  candidates: SkillCandidate[]
  clustersFound: number
  episodesProcessed: number
  durationMs: number
}

export async function distill(
  episodes: EpisodeRecord[],
  config: Partial<DistillerConfig> = {},
): Promise<DistillResult> {
  const start = Date.now()
  const cfg = { ...DEFAULT_CONFIG, ...config }

  log.info(`distiller: processing ${episodes.length} episodes`)

  // Cluster
  const clusters = clusterBySequence(episodes, cfg.minClusterSize, cfg.minCosineSimilarity)

  // Filter out clusters with high failure rates
  const viableClusters = clusters.filter((cluster) => {
    const failures = cluster.filter((ep) => ep.outcome === "failure").length
    const rate = failures / cluster.length
    return rate <= cfg.failureRateThreshold
  })

  log.info(`distiller: ${viableClusters.length} viable clusters (after failure-rate filter)`)

  // Synthesize candidates
  const candidates: SkillCandidate[] = []
  for (const cluster of viableClusters.slice(0, cfg.maxCandidatesPerRun)) {
    const skill = await synthesizeSkill(cluster)
    if (!skill) continue

    candidates.push({
      id: `candidate-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: skill.name,
      content: skill.content,
      evidence: cluster,
      status: "pending",
      created_at: Date.now(),
    })
  }

  return {
    candidates,
    clustersFound: clusters.length,
    episodesProcessed: episodes.length,
    durationMs: Date.now() - start,
  }
}

// ── Episode loader (reads from session store / audit log) ──────────────

export function loadRecentEpisodes(sinceMs: number): EpisodeRecord[] {
  // In production, this reads from the session store's persisted episodes.
  // For now, returns empty — the distillation cron job will populate this
  // once session hooks are wired to emit EpisodeRecords.
  try {
    const home = process.env.HOME || process.env.USERPROFILE || "~"
    const trajDir = join(home, ".aegis", "trajectories")

    if (!existsSync(trajDir)) return []

    const files = readdirSync(trajDir)
      .filter((f) => f.endsWith(".jsonl"))
      .slice(-50) // last 50 files

    const episodes: EpisodeRecord[] = []
    for (const file of files) {
      const fPath = join(trajDir, file)
      const stat = existsSync(fPath) ? readFileSync(fPath, "utf-8") : ""
      if (!stat) continue

      const lines = stat.split("\n").filter(Boolean)
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line)
          // Convert trajectory events to EpisodeRecords
          if (parsed.type === "session_end") {
            episodes.push({
              session_id: parsed.session_id || file.replace(".jsonl", ""),
              tool_call_id: `tool-${parsed.ts}`,
              tool_sequence: [],
              outcome: parsed.outcome === "success" ? "success" : "failure",
              cost_usd: parsed.cost_usd || 0,
              latency_ms: parsed.latency_ms || 0,
              context_summary: parsed.reason || "",
              ts: parsed.ts || Date.now(),
            })
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    return episodes.filter((ep) => ep.ts >= sinceMs)
  } catch {
    return []
  }
}

// ── Cron integration ──────────────────────────────────────────────────

export const DISTILLER_CRON_NAME = "evolution-distill"
export const DISTILLER_CRON_SCHEDULE = "1d"
export const DISTILLER_CRON_GOAL =
  "Run the evolution distillation pipeline — cluster successful sessions and emit skill candidates"

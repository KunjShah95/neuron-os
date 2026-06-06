import { z } from "zod"

// ── Core event record from agent sessions ─────────────────────────────

export const EpisodeRecordSchema = z.object({
  session_id: z.string(),
  tool_call_id: z.string(),
  tool_sequence: z.array(z.string()),
  outcome: z.enum(["success", "failure"]),
  cost_usd: z.number(),
  latency_ms: z.number(),
  context_summary: z.string(),
  ts: z.number(),
})

export type EpisodeRecord = z.infer<typeof EpisodeRecordSchema>

// ── A candidate skill extracted from clustered episodes ────────────────

export const SkillCandidateSchema = z.object({
  id: z.string(),
  name: z.string().regex(/^[a-z0-9-]+$/),
  content: z.string(),
  evidence: z.array(EpisodeRecordSchema),
  judge_verdict: z.enum(["pass", "fail", "skipped"]).optional(),
  regression_results: z.array(z.boolean()).optional(),
  status: z.enum(["pending", "approved", "rejected", "retired"]),
  created_at: z.number(),
  decided_at: z.number().optional(),
  rejection_reason: z.string().optional(),
})

export type SkillCandidate = z.infer<typeof SkillCandidateSchema>

// ── Distiller configuration ────────────────────────────────────────────

export const DistillerConfigSchema = z.object({
  minClusterSize: z.number().min(2).default(3),
  minCosineSimilarity: z.number().min(0).max(1).default(0.85),
  maxCandidatesPerRun: z.number().default(5),
  failureRateThreshold: z.number().min(0).max(1).default(0.2),
  regressionCaseCount: z.number().default(10),
  regressionPassThreshold: z.number().default(0.8),
  judgeTimeoutMs: z.number().default(10_000),
})

export type DistillerConfig = z.infer<typeof DistillerConfigSchema>

// ── Quality gate decision ──────────────────────────────────────────────

export interface QualityGateDecision {
  passed: boolean
  judge: {
    verdict: "pass" | "fail" | "skipped"
    reason?: string
  }
  regression: {
    passRate: number
    passed: number
    total: number
  }
  action: "approve" | "reject"
  diff?: string | null
}

// ── Self-improvement event types ───────────────────────────────────────

export const PostMortemSchema = z.object({
  skill_name: z.string(),
  session_id: z.string(),
  ts: z.number(),
  failure_reason: z.string(),
  tool_sequence: z.array(z.string()),
  context: z.string(),
})

export type PostMortem = z.infer<typeof PostMortemSchema>

export const PatchCandidateSchema = z.object({
  id: z.string(),
  skill_name: z.string(),
  old_string: z.string(),
  new_string: z.string(),
  reason: z.string(),
  evidence_count: z.number(),
  status: z.enum(["pending", "applied", "rejected"]),
  created_at: z.number(),
})

export type PatchCandidate = z.infer<typeof PatchCandidateSchema>

// ── Hub publication metadata ──────────────────────────────────────────

export const HubPublishMetadataSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  author: z.string().optional(),
  description: z.string(),
  tags: z.array(z.string()).default([]),
  provenance: z.object({
    evolution_manifest: z.string(),
    quality_score: z.number(),
    evidence_count: z.number(),
    judge_verdict: z.enum(["pass", "fail", "skipped"]),
  }),
})

export type HubPublishMetadata = z.infer<typeof HubPublishMetadataSchema>

// ── Evolution manifest entry ──────────────────────────────────────────

export interface EvolutionManifestEntry {
  version: number
  ts: number
  action: "create" | "approve" | "reject" | "patch" | "retire" | "publish"
  skill_name: string
  detail: string
  evidence_count: number
}

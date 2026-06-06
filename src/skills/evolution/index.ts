/**
 * src/skills/evolution/index.ts
 *
 * Self-evolving skills loop — distills successful tool-call patterns into
 * reusable skills, evaluates them through a quality gate, self-improves
 * through post-mortem analysis, retires underperformers, and publishes
 * to the agentskills.io Hub.
 *
 * Export surface for the evolution system.
 */

export { distill, clusterBySequence, loadRecentEpisodes, DISTILLER_CRON_NAME, DISTILLER_CRON_SCHEDULE, DISTILLER_CRON_GOAL } from "./distiller"
export type { DistillResult } from "./distiller"

export { gate } from "./quality-gate"
export type { QualityGateDecision } from "./types"

export { recordPostMortem, loadPostMortems, generatePatchFromFailures, applyPatch, isSelfImprovementEnabled } from "./self-improvement"

export { retireSkill, retireUnderperformers, checkRetirementEligibility, cleanArchive } from "./retirement"
export type { RetirementCheck } from "./retirement"

export { publishToHub, browseHub, searchHub, installFromHub } from "./hub-client"
export type { HubSkill, PublishOptions, PublishResult } from "./hub-client"

export type {
  EpisodeRecord,
  SkillCandidate,
  PostMortem,
  PatchCandidate,
  DistillerConfig,
  EvolutionManifestEntry,
  HubPublishMetadata,
} from "./types"

export {
  EpisodeRecordSchema,
  SkillCandidateSchema,
  PostMortemSchema,
  PatchCandidateSchema,
  DistillerConfigSchema,
} from "./types"

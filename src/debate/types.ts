import { z } from "zod"

export const PositionClaim = z.object({
  claim_id: z.string(),
  agent_id: z.string(),
  agent_type: z.string(),
  subject: z.string(),
  position: z.string(),
  evidence: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  ts: z.number(),
})

export type PositionClaim = z.infer<typeof PositionClaim>

export const ArbitratorConfig = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent"), agent_type: z.string(), model: z.string().optional() }),
  z.object({ type: z.literal("human"), channel: z.enum(["tui", "dashboard", "gateway"]) }),
  z.object({ type: z.literal("majority"), min_voters: z.number().int().min(3) }),
])

export type ArbitratorConfig = z.infer<typeof ArbitratorConfig>

export const Disagreement = z.object({
  id: z.string(),
  subject: z.string(),
  positions: z.array(PositionClaim).min(2),
  status: z.enum(["pending", "arbitrating", "resolved", "abandoned"]),
  arbitrator: ArbitratorConfig,
  raised_at: z.number(),
  resolved_at: z.number().optional(),
})

export type Disagreement = z.infer<typeof Disagreement>

export const Verdict = z.object({
  winning_claim_id: z.string(),
  reasoning: z.string(),
  arbitrator_agent_id: z.string().optional(),
  arbitrator_human_id: z.string().optional(),
})

export type Verdict = z.infer<typeof Verdict>

export const DecisionRecord = z.object({
  disagreement_id: z.string(),
  subject: z.string(),
  positions: z.array(PositionClaim),
  arbitrator: ArbitratorConfig,
  verdict: Verdict,
  resolved_at: z.number(),
  signed: z.string().optional(),
})

export type DecisionRecord = z.infer<typeof DecisionRecord>

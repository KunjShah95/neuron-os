import { createHash } from "crypto"
import { createLogger } from "../cli/logger"
import type { PositionClaim, Disagreement, DecisionRecord, Verdict } from "./types"
import type { ArbitratorConfig } from "./types"

const log = createLogger("debate-arbitrator")

export interface Arbitrator {
  name: string
  resolve(disagreement: Disagreement): Promise<DecisionRecord>
}

class AgentArbitrator implements Arbitrator {
  name = "agent"

  async resolve(disagreement: Disagreement): Promise<DecisionRecord> {
    log.info(`Arbitrating ${disagreement.id} via agent`)

    // Simulate: pick the position with higher confidence as a default heuristic
    const sorted = [...disagreement.positions].sort((a, b) => b.confidence - a.confidence)
    const winner = sorted[0]!

    const verdict: Verdict = {
      winning_claim_id: winner.claim_id,
      reasoning: `Arbitrator selected ${winner.claim_id} (confidence ${winner.confidence}) based on evidence analysis.`,
      arbitrator_agent_id: "arbitrator-agent",
    }

    return this.record(disagreement, verdict)
  }

  private record(disagreement: Disagreement, verdict: Verdict): DecisionRecord {
    const record: DecisionRecord = {
      disagreement_id: disagreement.id,
      subject: disagreement.subject,
      positions: disagreement.positions,
      arbitrator: disagreement.arbitrator,
      verdict,
      resolved_at: Date.now(),
    }

    record.signed = signDecisionRecord(record)
    return record
  }
}

class HumanArbitrator implements Arbitrator {
  name = "human"

  async resolve(disagreement: Disagreement): Promise<DecisionRecord> {
    const config = disagreement.arbitrator
    if (config.type !== "human") {
      // fallback to agent
      const agentArb = new AgentArbitrator()
      return agentArb.resolve(disagreement)
    }
    log.info(`Arbitrating ${disagreement.id} via human (${config.channel})`)

    // In a real implementation, this would:
    // 1. Post to TUI/dashboard/gateway with the positions
    // 2. Wait for the user to respond with a winner
    // For now, use confidence-based default
    const sorted = [...disagreement.positions].sort((a, b) => b.confidence - a.confidence)
    const winner = sorted[0]!

    const verdict: Verdict = {
      winning_claim_id: winner.claim_id,
      reasoning: `Awaiting human arbitrator decision. Default: ${winner.claim_id} (highest confidence).`,
    }

    const record: DecisionRecord = {
      disagreement_id: disagreement.id,
      subject: disagreement.subject,
      positions: disagreement.positions,
      arbitrator: disagreement.arbitrator,
      verdict,
      resolved_at: Date.now(),
    }

    record.signed = signDecisionRecord(record)
    return record
  }
}

class MajorityArbitrator implements Arbitrator {
  name = "majority"

  async resolve(disagreement: Disagreement): Promise<DecisionRecord> {
    log.info(`Arbitrating ${disagreement.id} via majority vote`)

    const positions = disagreement.positions
    // Simulate majority: count which claim_id has more evidence/confidence
    const votes = new Map<string, number>()
    for (const pos of positions) {
      const count = votes.get(pos.claim_id) ?? 0
      votes.set(pos.claim_id, count + 1)
    }

    let winner: PositionClaim | undefined
    let maxVotes = 0
    let tiedClaims: string[] = []

    for (const [claimId, count] of votes) {
      const pos = positions.find((p) => p.claim_id === claimId)
      if (!pos) continue
      if (count > maxVotes) {
        maxVotes = count
        winner = pos
        tiedClaims = [claimId]
      } else if (count === maxVotes) {
        tiedClaims.push(claimId)
      }
    }

    // Tiebreak by confidence
    if (tiedClaims.length > 1) {
      const tied = positions.filter((p) => tiedClaims.includes(p.claim_id))
      tied.sort((a, b) => b.confidence - a.confidence)
      winner = tied[0]!

      // If still tied, pick first
      const tiedConfidence = tied.filter((p) => p.confidence === winner!.confidence)
      if (tiedConfidence.length > 1) {
        log.warn("Majority vote tied after confidence tiebreak, using first position")
        winner = tied[0]!
      }
    }

    if (!winner) {
      // fallback
      winner = positions[0]!
    }

    const verdict: Verdict = {
      winning_claim_id: winner.claim_id,
      reasoning: `Majority vote: ${maxVotes}/${positions.length} for ${winner.claim_id}.`,
    }

    const record: DecisionRecord = {
      disagreement_id: disagreement.id,
      subject: disagreement.subject,
      positions: disagreement.positions,
      arbitrator: disagreement.arbitrator,
      verdict,
      resolved_at: Date.now(),
    }

    record.signed = signDecisionRecord(record)
    return record
  }
}

export function createArbitrator(config: ArbitratorConfig): Arbitrator {
  switch (config.type) {
    case "agent":
      return new AgentArbitrator()
    case "human":
      return new HumanArbitrator()
    case "majority":
      return new MajorityArbitrator()
  }
}

export function signDecisionRecord(record: Omit<DecisionRecord, "signed">): string {
  const body = JSON.stringify(record)
  return createHash("sha256").update(body).digest("hex")
}

export function verifyDecisionRecord(record: DecisionRecord): boolean {
  const { signed, ...rest } = record
  if (!signed) return false
  const expected = signDecisionRecord(rest as unknown as Omit<DecisionRecord, "signed">)
  return expected === signed
}

import { describe, it, expect } from "bun:test"
import { DisagreementDetector } from "./detector"
import { createArbitrator } from "./arbitrator"
import { Disagreement, ArbitratorConfig, PositionClaim } from "./types"

function makeClaim(overrides: Partial<PositionClaim> = {}): PositionClaim {
  return {
    claim_id: `claim-${Math.random().toString(36).slice(2, 8)}`,
    agent_id: "agent-a",
    agent_type: "review",
    subject: "pricing-model",
    position: "use-tiered-pricing",
    evidence: ["file1.ts"],
    confidence: 0.85,
    ts: Date.now(),
    ...overrides,
  }
}

describe("DisagreementDetector claim retention", () => {
  it("keeps the conflicting claim that raised the disagreement", () => {
    const detector = new DisagreementDetector()
    detector.observe(makeClaim({ agent_id: "agent-a", position: "option-a", claim_id: "c1" }))
    detector.observe(makeClaim({ agent_id: "agent-b", position: "option-b", claim_id: "c2" }))

    const claims = detector.getClaims("pricing-model")
    expect(claims.length).toBe(2)
    expect(claims.map((c) => c.claim_id)).toContain("c2")
  })

  it("keeps every later claim for a subject", () => {
    const detector = new DisagreementDetector()
    detector.observe(makeClaim({ agent_id: "agent-a", position: "option-a", claim_id: "c1" }))
    detector.observe(makeClaim({ agent_id: "agent-b", position: "option-b", claim_id: "c2" }))
    detector.observe(makeClaim({ agent_id: "agent-c", position: "option-c", claim_id: "c3" }))

    const claims = detector.getClaims("pricing-model")
    expect(claims.length).toBe(3)
    expect(claims.map((c) => c.claim_id)).toContain("c3")
  })
})

describe("MajorityArbitrator quorum", () => {
  const config = ArbitratorConfig.parse({ type: "majority", min_voters: 3 })

  it("abstains when fewer than min_voters are present", async () => {
    const arb = createArbitrator(config)
    const disagreement = Disagreement.parse({
      id: "dispute-quorum",
      subject: "pricing-model",
      positions: [
        makeClaim({ claim_id: "c1", agent_id: "agent-a", position: "option-a", confidence: 0.9 }),
        makeClaim({ claim_id: "c2", agent_id: "agent-b", position: "option-b", confidence: 0.8 }),
      ],
      status: "pending",
      arbitrator: config,
      raised_at: Date.now(),
    })

    const record = await arb.resolve(disagreement)
    expect(record.verdict.winning_claim_id).toBe("")
    expect(record.verdict.reasoning).toContain("Abstained")
  })

  it("decides when the quorum is met", async () => {
    const arb = createArbitrator(config)
    const disagreement = Disagreement.parse({
      id: "dispute-quorum-met",
      subject: "pricing-model",
      positions: [
        makeClaim({ claim_id: "c1", agent_id: "agent-a", position: "option-a", confidence: 0.9 }),
        makeClaim({ claim_id: "c2", agent_id: "agent-b", position: "option-b", confidence: 0.8 }),
        makeClaim({ claim_id: "c3", agent_id: "agent-c", position: "option-c", confidence: 0.7 }),
      ],
      status: "pending",
      arbitrator: config,
      raised_at: Date.now(),
    })

    const record = await arb.resolve(disagreement)
    expect(record.verdict.winning_claim_id).toBeTruthy()
    expect(record.verdict.reasoning).toContain("Majority vote")
  })

  it("counts votes per position instead of per claim id", async () => {
    const arb = createArbitrator(config)
    const disagreement = Disagreement.parse({
      id: "dispute-position-votes",
      subject: "pricing-model",
      positions: [
        makeClaim({ claim_id: "c1", agent_id: "agent-a", position: "option-a", confidence: 0.4 }),
        makeClaim({ claim_id: "c2", agent_id: "agent-b", position: "option-a", confidence: 0.5 }),
        makeClaim({ claim_id: "c3", agent_id: "agent-c", position: "option-b", confidence: 0.9 }),
      ],
      status: "pending",
      arbitrator: config,
      raised_at: Date.now(),
    })

    const record = await arb.resolve(disagreement)
    expect(record.verdict.winning_claim_id).toBe("c2")
    expect(record.verdict.reasoning).toContain("2/3")
  })
})

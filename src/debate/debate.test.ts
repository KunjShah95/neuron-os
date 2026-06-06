import { describe, it, expect } from "bun:test"
import { DisagreementDetector } from "./detector"
import { createArbitrator, signDecisionRecord, verifyDecisionRecord } from "./arbitrator"
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

describe("DisagreementDetector", () => {
  it("returns null for non-conflicting claims", () => {
    const detector = new DisagreementDetector()
    const r1 = detector.observe(makeClaim({ agent_id: "agent-a", position: "option-a", claim_id: "c1" }))
    expect(r1).toBeNull()

    const r2 = detector.observe(makeClaim({ agent_id: "agent-a", position: "option-a", claim_id: "c2" }))
    expect(r2).toBeNull() // same agent, same position - dedup
  })

  it("raises disagreement on conflicting claims from different agents", () => {
    const detector = new DisagreementDetector()
    detector.observe(makeClaim({ agent_id: "agent-a", position: "option-a", claim_id: "c1" }))
    const r2 = detector.observe(makeClaim({ agent_id: "agent-b", position: "option-b", claim_id: "c2" }))
    expect(r2).not.toBeNull()
    expect(r2!.status).toBe("pending")
    expect(r2!.positions.length).toBe(2)
  })

  it("ignores duplicate claims from the same agent", () => {
    const detector = new DisagreementDetector()
    detector.observe(makeClaim({ agent_id: "agent-a", position: "option-a", claim_id: "c1" }))
    detector.observe(makeClaim({ agent_id: "agent-b", position: "option-b", claim_id: "c2" }))
    const r3 = detector.observe(makeClaim({ agent_id: "agent-a", position: "option-a", claim_id: "c3" }))
    expect(r3).toBeNull()
  })
})

describe("Arbitrator", () => {
  it("agent arbitrator picks higher confidence", async () => {
    const config = ArbitratorConfig.parse({ type: "agent", agent_type: "review" })
    const arb = createArbitrator(config)
    const disagreement = Disagreement.parse({
      id: "test-1",
      subject: "test",
      positions: [
        makeClaim({ claim_id: "c1", confidence: 0.6 }),
        makeClaim({ claim_id: "c2", agent_id: "agent-b", position: "option-b", confidence: 0.9 }),
      ],
      status: "pending",
      arbitrator: config,
      raised_at: Date.now(),
    })
    const record = await arb.resolve(disagreement)
    expect(record.verdict.winning_claim_id).toBe("c2")
  })

  it("majority arbitrator handles ties via confidence", async () => {
    const config = ArbitratorConfig.parse({ type: "majority", min_voters: 3 })
    const arb = createArbitrator(config)
    const disagreement = Disagreement.parse({
      id: "test-2",
      subject: "test",
      positions: [
        makeClaim({ claim_id: "c1", confidence: 0.6 }),
        makeClaim({ claim_id: "c2", agent_id: "agent-b", position: "option-b", confidence: 0.6 }),
        makeClaim({ claim_id: "c3", agent_id: "agent-c", position: "option-c", confidence: 0.9 }),
      ],
      status: "pending",
      arbitrator: config,
      raised_at: Date.now(),
    })
    const record = await arb.resolve(disagreement)
    expect(record.verdict.winning_claim_id).toBeTruthy()
  })
})

describe("DecisionRecord signatures", () => {
  it("signs and verifies a record", () => {
    const record = {
      disagreement_id: "test-sign",
      subject: "test",
      positions: [makeClaim()],
      arbitrator: ArbitratorConfig.parse({ type: "agent", agent_type: "review" }),
      verdict: { winning_claim_id: "c1", reasoning: "test" },
      resolved_at: Date.now(),
    }
    const sig = signDecisionRecord(record)
    const signed = { ...record, signed: sig }
    expect(verifyDecisionRecord(signed)).toBe(true)
  })

  it("rejects tampered records", () => {
    const record = {
      disagreement_id: "test-tamper",
      subject: "test",
      positions: [makeClaim()],
      arbitrator: ArbitratorConfig.parse({ type: "agent", agent_type: "review" }),
      verdict: { winning_claim_id: "c1", reasoning: "test" },
      resolved_at: Date.now(),
      signed: "tampered-signature",
    }
    expect(verifyDecisionRecord(record)).toBe(false)
  })
})

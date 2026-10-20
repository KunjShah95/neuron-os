import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs"
import { join, resolve, dirname } from "node:path"
import { tmpdir } from "node:os"

import { resolveDisagreement, loadDecisionRecord, listDecisionRecords, resolveRecordPath } from "./record"
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

function makeDisagreement(id: string): Disagreement {
  const arbitrator = ArbitratorConfig.parse({ type: "agent", agent_type: "review" })
  return Disagreement.parse({
    id,
    subject: "pricing-model",
    positions: [
      makeClaim({ claim_id: "c1", agent_id: "agent-a", position: "option-a" }),
      makeClaim({ claim_id: "c2", agent_id: "agent-b", position: "option-b" }),
    ],
    status: "pending",
    arbitrator,
    raised_at: Date.now(),
  })
}

describe("decision record paths", () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "decision-records-"))
    process.env.AEGIS_DECISIONS_DIR = tmp
  })

  afterEach(() => {
    delete process.env.AEGIS_DECISIONS_DIR
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {}
  })

  it("keeps a traversal id inside the decisions directory", () => {
    const path = resolveRecordPath("../../../../.ssh/authorized_keys")
    expect(dirname(path)).toBe(resolve(tmp))
    expect(path.startsWith(resolve(tmp))).toBe(true)
  })

  it("writes a record with a hostile id inside the decisions directory", async () => {
    const id = "../../escaped-decision"
    await resolveDisagreement(makeDisagreement(id))

    const files = readdirSync(tmp)
    expect(files.length).toBe(1)
    expect(files[0]?.endsWith(".json")).toBe(true)
    expect(existsSync(resolve(tmp, "..", "escaped-decision.json"))).toBe(false)
  })

  it("loads a record that was written with a hostile id", async () => {
    const id = "../../escaped-decision"
    await resolveDisagreement(makeDisagreement(id))
    const record = loadDecisionRecord(id)
    expect(record).not.toBeNull()
    expect(record?.disagreement_id).toBe(id)
  })
})

describe("decision record integrity", () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "decision-integrity-"))
    process.env.AEGIS_DECISIONS_DIR = tmp
  })

  afterEach(() => {
    delete process.env.AEGIS_DECISIONS_DIR
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {}
  })

  it("refuses to load a record whose signature does not verify", async () => {
    const id = "dispute-tampered"
    await resolveDisagreement(makeDisagreement(id))

    const path = resolveRecordPath(id)
    const record = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>
    record.verdict = { winning_claim_id: "c2", reasoning: "tampered" }
    writeFileSync(path, JSON.stringify(record), "utf-8")

    expect(loadDecisionRecord(id)).toBeNull()
  })

  it("refuses to load an unsigned record", async () => {
    const id = "dispute-unsigned"
    await resolveDisagreement(makeDisagreement(id))

    const path = resolveRecordPath(id)
    const record = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>
    delete record.signed
    writeFileSync(path, JSON.stringify(record), "utf-8")

    expect(loadDecisionRecord(id)).toBeNull()
  })

  it("skips tampered records when listing", async () => {
    const good = "dispute-good"
    const bad = "dispute-bad"
    await resolveDisagreement(makeDisagreement(good))
    await resolveDisagreement(makeDisagreement(bad))

    const badPath = resolveRecordPath(bad)
    const record = JSON.parse(readFileSync(badPath, "utf-8")) as Record<string, unknown>
    record.resolved_at = 1
    writeFileSync(badPath, JSON.stringify(record), "utf-8")

    const records = listDecisionRecords()
    expect(records.length).toBe(1)
    expect(records[0]?.disagreement_id).toBe(good)
  })

  it("loads a properly signed record", async () => {
    const id = "dispute-valid"
    await resolveDisagreement(makeDisagreement(id))
    const record = loadDecisionRecord(id)
    expect(record).not.toBeNull()
    expect(record?.signed).toBeTruthy()
  })
})

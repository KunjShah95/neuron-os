# Debate Topology — Design Spec

**Date:** 2026-06-06
**Status:** Draft
**Scope:** v1.x — disagreement detection, arbitrator selection, decision records

## Context

When 2+ Aegis agents work on the same task, they may disagree. Today the only resolution is "the last one wins" or "human decides". Hermes, CrewAI, AutoGen don't have a formal disagreement-resolution mechanism. Your ROADMAP mentions "disagreement resolution / debate topology" as a v1.x bet.

This spec adds:
1. A `disagreement` event when 2+ agents emit conflicting positions on the same subject
2. An `arbitrator` role (typed, configurable) that resolves the disagreement — agent, human, or majority vote
3. A `decision_record.json` artifact capturing both positions, evidence, and the ruling
4. Skill-evolution integration: when 2 skill candidates disagree on the same workflow, debate picks the winner (or merges them)

## 1. Goals

1. **Position claims** — agents emit structured `PositionClaim` records during their work
2. **Disagreement detection** — a `DisagreementDetector` watches claims and raises a `disagreement` event when 2+ claims conflict on the same `subject`
3. **Arbitrator selection** — config-driven (`arbitrator: { type: 'agent' | 'human' | 'majority', ... }`)
4. **Decision record** — `~/.aegis/decisions/<disagreement_id>.json` with: positions, evidence, arbitrator verdict, reasoning, timestamp
5. **Skill-candidate integration** — when 2 SkillCandidates are emitted for the same workflow, debate picks the best one
6. **CLI** — `aegis debate <disagreement_id>` shows the full record; `aegis debate --pending` lists unresolved

## 2. Non-Goals (v1)

- BFT consensus (that's v0.9 distributed runtime; this is single-machine)
- Reputation/scoring of agents (just decisions; no leaderboard of "who is usually right")
- Cross-machine debates (debates happen within one Aegis install)
- Byzantine fault tolerance
- Multi-party negotiation protocols (we pick a winner; no counter-offers)

## 3. Architecture

```
  ┌────────────────────────────────────────────────────────┐
  │  Agents emit PositionClaims during work                │
  │    { subject, position, evidence, confidence, ts }     │
  └─────────────┬──────────────────────────────────────────┘
                │ bus events
                ▼
  ┌────────────────────────────────────────────────────────┐
  │  src/debate/                                           │
  │    - detector.ts     (groups claims, raises events)    │
  │    - arbitrator.ts   (3 strategies: agent, human,      │
  │                       majority)                        │
  │    - record.ts       (writes decision_record.json)     │
  │    - skill-arbitrator.ts  (debate-aware skill picker)  │
  └────────────────────────────────────────────────────────┘
```

## 4. Schemas (Zod)

```ts
const PositionClaim = z.object({
  claim_id: z.string(),
  agent_id: z.string(),
  agent_type: z.string(),
  subject: z.string(),                        // e.g. "use-effect-deps", "pricing-model"
  position: z.string(),                        // human-readable position
  evidence: z.array(z.string()),              // tool call IDs, file paths, URLs
  confidence: z.number().min(0).max(1),
  ts: z.number(),
})

const Disagreement = z.object({
  id: z.string(),
  subject: z.string(),
  positions: z.array(PositionClaim).min(2),
  status: z.enum(['pending', 'arbitrating', 'resolved', 'abandoned']),
  arbitrator: ArbitratorConfig,
  raised_at: z.number(),
  resolved_at: z.number().optional(),
})

const DecisionRecord = z.object({
  disagreement_id: z.string(),
  subject: z.string(),
  positions: z.array(PositionClaim),
  arbitrator: ArbitratorConfig,
  verdict: z.object({
    winning_claim_id: z.string(),
    reasoning: z.string(),
    arbitrator_agent_id: z.string().optional(),
    arbitrator_human_id: z.string().optional(),
  }),
  resolved_at: z.number(),
  signed: z.string().optional(),               // HMAC of the record body
})

const ArbitratorConfig = z.discriminatedUnion('type', [
  z.object({ type: z.literal('agent'), agent_type: z.string(), model: z.string().optional() }),
  z.object({ type: z.literal('human'), channel: z.enum(['tui','dashboard','gateway']) }),
  z.object({ type: z.literal('majority'), min_voters: z.number().int().min(3) }),
])
```

## 5. DisagreementDetector Logic

```ts
class DisagreementDetector {
  private claimsBySubject = new Map<string, PositionClaim[]>()
  private seen = new Set<string>()

  observe(claim: PositionClaim): Disagreement | null {
    const list = this.claimsBySubject.get(claim.subject) ?? []
    const conflict = list.find(c => c.position !== claim.position && c.agent_id !== claim.agent_id)
    if (!conflict) {
      list.push(claim)
      this.claimsBySubject.set(claim.subject, list)
      return null
    }
    const id = uuid()
    const dis: Disagreement = {
      id, subject: claim.subject, positions: [conflict, claim],
      status: 'pending', arbitrator: this.defaultArbitrator,
      raised_at: Date.now(),
    }
    bus.emit('disagreement', dis)
    this.claimsBySubject.set(claim.subject, [conflict, claim])  // keep, but mark
    return dis
  }
}
```

The `defaultArbitrator` is set in `~/.aegis/config.yaml`; per-agent-type overrides via the `agent.yaml` (from the typed-spec spec).

## 6. Arbitrator Strategies

**Agent arbitrator:**
1. Spawn the configured agent_type with input: `{ subject, positions, evidence }`
2. Agent emits `{ type: 'arbitration_verdict', winning_claim_id, reasoning }`
3. DecisionRecord written

**Human arbitrator:**
1. Post a prompt to the configured channel (TUI notification, dashboard modal, or gateway message)
2. The user replies with: `claim_id` of the winner + optional reasoning
3. Timeout (default 24h): escalate or abandon

**Majority arbitrator:**
1. Spawn N=min_voters agents of the same type, each with the same input
2. Collect verdicts; pick the most-voted claim_id
3. Tied → confidence-weighted; if still tied → escalate to human

## 7. Skill-Candidate Integration

When the SkillDistiller (from spec 2) emits 2 SkillCandidates for the same workflow (matched on `tool_sequence` + `context_summary` cosine):

1. SkillArbitrator treats them as a debate
2. Runs both against the regression suite
3. Picks the higher-scoring one
4. If both pass and disagree on a non-overlapping detail → merge them (LLM combines the two SKILL.md files, gated by the same QualityGate)

## 8. Data Flow

1. Agent A finishes a task and emits `position_claim` for subject X
2. Agent B finishes the same task and emits `position_claim` for subject X with a different position
3. DisagreementDetector sees both → raises `disagreement` event on the bus
4. Arbitrator selected (config or default)
5. Arbitrator sees both positions + evidence, emits verdict
6. DecisionRecord written; agents notified via the bus; downstream consumers (e.g., `aegis debate --pending` in TUI, dashboard widget) see the resolution

## 9. CLI Surface

```bash
aegis debate --pending                       # list unresolved
aegis debate --resolved [--since 7d]          # list resolved
aegis debate <disagreement_id>                # show full record
aegis debate <disagreement_id> --override     # human override an arbitrator verdict
aegis debate config                           # show arbitrator config
aegis debate config set <field> <value>       # interactive
```

## 10. Error Handling

| Failure | Behavior |
|---|---|
| Arbitrator agent failure | Fall back to human arbitrator |
| Human arbitrator timeout (>24h) | Escalate to a configured escalation channel, or mark `abandoned` |
| DecisionRecord write failure | Log to audit; do not block agents |
| Tied vote (majority mode) | Confidence-weighted tiebreak; if still tied, escalate to human |
| `disagreement` event with only 1 position (false positive) | Status: `abandoned`, logged |
| Sign/verify failure on a DecisionRecord | Reject as tampered; surface warning |

## 11. Testing

**Unit:**
- Detector groups claims correctly; raises disagreement on conflict; ignores duplicates from the same agent
- Arbitrator strategies (agent verdict parses, human gets prompt, majority tallies + tiebreaks)
- DecisionRecord sign/verify round-trip

**Integration:**
- 2 agents emit conflicting claims → disagreement raised → arbitrator resolves → record written + signed
- Skill-candidate dispute resolved by debate
- Human arbitrator timeout → escalation flow
- Tied vote → confidence-weighted tiebreak → escalation

**E2E:**
- 2 review agents disagree on a PR; debate produces a record; CI gate uses the record
- 2 SkillCandidates for the same workflow → debate picks the higher-scoring one
- Dashboard widget shows pending disagreements; user clicks → resolves via the modal

## 12. Phasing

| Phase | PR | What |
|---|---|---|
| 1 | `feat(debate): PositionClaim + DisagreementDetector + bus events` | Foundation |
| 2 | `feat(debate): Arbitrator trait + 3 strategies` | Resolution |
| 3 | `feat(debate): DecisionRecord + HMAC + CLI` | Audit trail |
| 4 | `feat(skills): SkillArbitrator integration` | Cross-link with skills spec |
| 5 | `feat(debate): dashboard widget for pending disagreements` | UX |
| 6 | `docs(debate): guide + examples` | User-facing |

## 13. Open Questions (for plan review)

- Should `Disagreement` always be raised, or only when confidence is high enough on both sides? Threshold default?
- For human arbitrators, what's the default timeout before escalation? 24h is the proposed default; could be shorter for hot paths.
- Should the DecisionRecord be signed (HMAC) by default? Yes (proposed) for tamper-evidence; users can disable.
- For majority arbitrators, do we spawn N agents in parallel (faster, more expensive) or serially (slower, cheaper)?

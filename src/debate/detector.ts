import { createLogger } from "../cli/logger"
import type { PositionClaim, Disagreement } from "./types"
import { ArbitratorConfig } from "./types"

const log = createLogger("debate-detector")

export class DisagreementDetector {
  private claimsBySubject = new Map<string, PositionClaim[]>()
  private seen = new Set<string>()
  private listeners: Array<(disagreement: Disagreement) => void> = []

  defaultArbitrator = ArbitratorConfig.parse({ type: "agent", agent_type: "review" })

  onDisagreement(cb: (disagreement: Disagreement) => void): void {
    this.listeners.push(cb)
  }

  observe(claim: PositionClaim): Disagreement | null {
    // Skip duplicate claims from the same agent on the same subject
    const dedupKey = `${claim.agent_id}:${claim.subject}:${claim.position}`
    if (this.seen.has(dedupKey)) return null
    this.seen.add(dedupKey)

    const list = this.claimsBySubject.get(claim.subject) ?? []

    // Find a conflicting claim from a different agent
    const conflict = list.find((c) => c.position !== claim.position && c.agent_id !== claim.agent_id)

    if (!conflict) {
      list.push(claim)
      this.claimsBySubject.set(claim.subject, list)
      return null
    }

    const id = `dispute-${claim.subject}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const disagreement: Disagreement = {
      id,
      subject: claim.subject,
      positions: [conflict, claim],
      status: "pending",
      arbitrator: this.defaultArbitrator,
      raised_at: Date.now(),
    }

    // Emit to listeners
    for (const cb of this.listeners) {
      try {
        cb(disagreement)
      } catch (err) {
        log.warn(`Disagreement listener error: ${err}`)
      }
    }

    log.info(`Disagreement raised: ${id} (${claim.subject})`)
    return disagreement
  }

  getClaims(subject?: string): PositionClaim[] {
    if (subject) return this.claimsBySubject.get(subject) ?? []
    return Array.from(this.claimsBySubject.values()).flat()
  }

  clear(): void {
    this.claimsBySubject.clear()
    this.seen.clear()
  }
}

export const globalDetector = new DisagreementDetector()

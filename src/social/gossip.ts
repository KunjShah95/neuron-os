import { createLogger } from "../cli/logger"
import { socialStore } from "./social-store"
import type { GossipEvent } from "./types"

const log = createLogger("social-gossip")

export class GossipProtocol {
  shareInsight(params: {
    sourcePeerId: string
    insightTitle: string
    insightDescription: string
    confidence: number
  }): GossipEvent {
    const payload = JSON.stringify({
      title: params.insightTitle,
      description: params.insightDescription.slice(0, 200),
      confidence: params.confidence,
    })

    const event = socialStore.recordGossip({
      type: "insight-shared",
      sourcePeerId: params.sourcePeerId,
      targetPeerId: "",
      payload,
      ttl: 5,
    })

    log.debug(`Shared insight: ${params.insightTitle.slice(0, 40)}`)
    return event
  }

  shareMutation(params: {
    sourcePeerId: string
    filePath: string
    strategy: string
    description: string
    success: boolean
  }): GossipEvent {
    const payload = JSON.stringify({
      filePath: params.filePath,
      strategy: params.strategy,
      description: params.description.slice(0, 200),
      success: params.success,
    })

    const event = socialStore.recordGossip({
      type: "mutation-shared",
      sourcePeerId: params.sourcePeerId,
      targetPeerId: "",
      payload,
      ttl: 3,
    })

    return event
  }

  reportPeerStatus(params: {
    sourcePeerId: string
    targetPeerId: string
    arrived: boolean
  }): GossipEvent {
    const event = socialStore.recordGossip({
      type: params.arrived ? "peer-arrived" : "peer-departed",
      sourcePeerId: params.sourcePeerId,
      targetPeerId: params.targetPeerId,
      payload: "",
      ttl: 2,
    })

    return event
  }

  updateReputation(params: {
    sourcePeerId: string
    targetPeerId: string
    delta: number
  }): GossipEvent {
    const peer = socialStore.getPeer(params.targetPeerId)
    if (!peer) {
      log.debug(`Cannot update reputation for unknown peer ${params.targetPeerId.slice(0, 12)}`)
      const event = socialStore.recordGossip({
        type: "reputation-change",
        sourcePeerId: params.sourcePeerId,
        targetPeerId: params.targetPeerId,
        payload: JSON.stringify({ delta: params.delta, newValue: 0 }),
        ttl: 2,
      })
      return event
    }

    const newReputation = Math.max(-1, Math.min(1, peer.reputation + params.delta))
    socialStore.upsertPeer({
      id: peer.id,
      profileId: peer.profileId,
      name: peer.name,
      reputation: newReputation,
    })

    const event = socialStore.recordGossip({
      type: "reputation-change",
      sourcePeerId: params.sourcePeerId,
      targetPeerId: params.targetPeerId,
      payload: JSON.stringify({ delta: params.delta, newValue: newReputation }),
      ttl: 2,
    })

    log.debug(`Reputation ${params.delta > 0 ? "↑" : "↓"} for ${peer.name}: ${newReputation.toFixed(2)}`)
    return event
  }

  getRecentGossip(limit = 50): GossipEvent[] {
    return socialStore.getRecentGossip(limit)
  }

  getStats(): { total: number; byType: Record<string, number> } {
    const events = socialStore.getRecentGossip(1000)
    const byType: Record<string, number> = {}
    for (const e of events) {
      byType[e.type] = (byType[e.type] || 0) + 1
    }
    return { total: events.length, byType }
  }
}

export const gossipProtocol = new GossipProtocol()

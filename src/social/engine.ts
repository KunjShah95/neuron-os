import { createLogger } from "../cli/logger"
import { socialStore } from "./social-store"
import { peerDiscovery } from "./discovery"
import { messenger } from "./messenger"
import { gossipProtocol } from "./gossip"
import type { AgentProfile, SocialConfig, SocialStats } from "./types"
import { DEFAULT_SOCIAL_CONFIG } from "./types"

const log = createLogger("social-engine")

export class SocialEngine {
  private discovery = peerDiscovery
  private messenger = messenger
  private gossip = gossipProtocol
  private config: SocialConfig
  private timerIds: Array<ReturnType<typeof setInterval>> = []
  private running = false
  private localProfile: AgentProfile | null = null
  private lastDiscoveryAt = ""
  private lastGossipAt = ""

  constructor(config?: Partial<SocialConfig>) {
    this.config = { ...DEFAULT_SOCIAL_CONFIG, ...config }
  }

  getConfig(): SocialConfig {
    return { ...this.config }
  }

  updateConfig(config: Partial<SocialConfig>): void {
    this.config = { ...this.config, ...config }
    if (this.running) {
      this.stop()
      this.start()
    }
  }

  registerInstance(params: {
    name: string
    version: string
    capabilities: string[]
    agentTypes: string[]
    listenAddress?: string
  }): AgentProfile {
    const existing = socialStore.getLocalProfile()

    const profile: AgentProfile = {
      id: existing?.id || `agent-${Date.now().toString(36)}`,
      name: params.name,
      instanceId: existing?.instanceId || crypto.randomUUID(),
      version: params.version,
      capabilities: params.capabilities,
      agentTypes: params.agentTypes,
      listenAddress: params.listenAddress || "",
      lastSeenAt: new Date().toISOString(),
      status: "online",
      publicKey: existing?.publicKey || "",
    }

    socialStore.saveLocalProfile(profile)
    this.localProfile = profile
    this.discovery.setLocalProfile(profile)
    log.info(`Registered as ${profile.name} (${profile.id.slice(0, 12)})`)
    return profile
  }

  getLocalProfile(): AgentProfile | null {
    return this.localProfile || socialStore.getLocalProfile()
  }

  start(): void {
    if (this.running) return
    this.running = true

    if (this.config.enabled) {
      const discoId = setInterval(() => this.discoveryTick(), this.config.discoveryIntervalMs)
      this.timerIds.push(discoId)

      const gossipId = setInterval(() => this.gossipTick(), this.config.gossipIntervalMs)
      this.timerIds.push(gossipId)

      this.discoveryTick()
      log.info(`Social network started (discovery: ${this.config.discoveryIntervalMs}ms, gossip: ${this.config.gossipIntervalMs}ms)`)
    }
  }

  stop(): void {
    this.running = false
    for (const id of this.timerIds) clearInterval(id)
    this.timerIds = []
    log.info("Social network stopped")
  }

  private discoveryTick(): void {
    if (!this.localProfile) {
      const profile = this.getLocalProfile()
      if (profile) {
        this.localProfile = profile
        this.discovery.setLocalProfile(profile)
      }
    }

    this.discovery.broadcastPresence()
    const peers = this.discovery.discoverPeers()
    this.discovery.markPeersOffline()
    this.discovery.cleanupStaleBeacons()
    this.lastDiscoveryAt = new Date().toISOString()

    if (peers.length > 0) {
      log.debug(`Discovered ${peers.length} peer(s)`)
      for (const peer of peers) {
        this.gossip.reportPeerStatus({
          sourcePeerId: this.localProfile?.id || "unknown",
          targetPeerId: peer.id,
          arrived: true,
        })
      }
    }
  }

  private gossipTick(): void {
    this.lastGossipAt = new Date().toISOString()
  }

  sendMessage(params: {
    recipientId: string
    subject: string
    body: string
    priority?: "low" | "normal" | "high" | "critical"
  }) {
    const profile = this.getLocalProfile()
    if (!profile) {
      log.error("Cannot send message — local profile not registered")
      return null
    }

    const peer = socialStore.getPeer(params.recipientId)
    if (peer) {
      socialStore.upsertPeer({
        id: peer.id,
        profileId: peer.profileId,
        name: peer.name,
        messageCount: (peer.messageCount || 0) + 1,
      })
    }

    return this.messenger.sendMessage({
      senderId: profile.id,
      recipientId: params.recipientId,
      subject: params.subject,
      body: params.body,
      priority: params.priority,
    })
  }

  getMessages(limit = 50) {
    const profile = this.getLocalProfile()
    if (!profile) return []
    return this.messenger.getConversation(profile.id, limit)
  }

  getPendingMessages() {
    const profile = this.getLocalProfile()
    if (!profile) return []
    return this.messenger.getPendingMessages(profile.id)
  }

  markMessageDelivered(messageId: string): void {
    this.messenger.markDelivered(messageId)
  }

  shareInsight(params: { title: string; description: string; confidence: number }): void {
    const profile = this.getLocalProfile()
    if (!profile || !this.config.autoShareInsights) return
    this.gossip.shareInsight({
      sourcePeerId: profile.id,
      insightTitle: params.title,
      insightDescription: params.description,
      confidence: params.confidence,
    })
  }

  shareMutation(params: { filePath: string; strategy: string; description: string; success: boolean }): void {
    const profile = this.getLocalProfile()
    if (!profile || !this.config.autoShareMutations) return
    this.gossip.shareMutation({
      sourcePeerId: profile.id,
      ...params,
    })
  }

  updateReputation(peerId: string, delta: number): void {
    const profile = this.getLocalProfile()
    if (!profile) return
    this.gossip.updateReputation({
      sourcePeerId: profile.id,
      targetPeerId: peerId,
      delta,
    })
  }

  listPeers(status?: string) {
    return socialStore.listPeers(status as Parameters<typeof socialStore.listPeers>[0])
  }

  getStats(): SocialStats {
    const storeStats = socialStore.getStats()
    const gossipStats = this.gossip.getStats()
    return {
      ...storeStats,
      totalGossipEvents: gossipStats.total,
      lastDiscoveryAt: this.lastDiscoveryAt || storeStats.lastDiscoveryAt,
      lastGossipAt: this.lastGossipAt || storeStats.lastGossipAt,
    }
  }
}

export const socialEngine = new SocialEngine()

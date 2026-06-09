export type PeerStatus = "online" | "offline" | "away" | "unknown"
export type MessagePriority = "low" | "normal" | "high" | "critical"
export type MessageStatus = "pending" | "delivered" | "read" | "failed"
export type TrustLevel = "none" | "minimal" | "partial" | "full"

export interface AgentProfile {
  id: string
  name: string
  instanceId: string
  version: string
  capabilities: string[]
  agentTypes: string[]
  listenAddress: string
  lastSeenAt: string
  status: PeerStatus
  publicKey: string
}

export interface SocialMessage {
  id: string
  senderId: string
  recipientId: string
  subject: string
  body: string
  priority: MessagePriority
  status: MessageStatus
  createdAt: string
  deliveredAt: string
  readAt: string
  replyTo: string
  metadata: string
}

export interface PeerRecord {
  id: string
  profileId: string
  name: string
  instanceId: string
  version: string
  capabilities: string[]
  agentTypes: string[]
  listenAddress: string
  firstSeenAt: string
  lastSeenAt: string
  status: PeerStatus
  trustLevel: TrustLevel
  reputation: number
  messageCount: number
  helpfulCount: number
  insightShareCount: number
}

export interface SocialConfig {
  enabled: boolean
  instanceName: string
  listenPort: number
  discoveryIntervalMs: number
  gossipIntervalMs: number
  maxPeers: number
  messageRetentionDays: number
  autoShareInsights: boolean
  autoShareMutations: boolean
  reputationDecay: number
}

export const DEFAULT_SOCIAL_CONFIG: SocialConfig = {
  enabled: true,
  instanceName: "",
  listenPort: 0,
  discoveryIntervalMs: 60000,
  gossipIntervalMs: 120000,
  maxPeers: 50,
  messageRetentionDays: 30,
  autoShareInsights: true,
  autoShareMutations: true,
  reputationDecay: 0.95,
}

export interface SocialStats {
  totalPeers: number
  onlinePeers: number
  totalMessages: number
  deliveredMessages: number
  failedMessages: number
  totalGossipEvents: number
  averageReputation: number
  topPeers: Array<{ name: string; reputation: number }>
  lastDiscoveryAt: string
  lastGossipAt: string
}

export interface GossipEvent {
  id: string
  type: "peer-arrived" | "peer-departed" | "insight-shared" | "mutation-shared" | "reputation-change" | "message-relay"
  sourcePeerId: string
  targetPeerId: string
  payload: string
  timestamp: string
  ttl: number
}

import { Database } from "bun:sqlite"
import { join } from "node:path"
import { mkdirSync, existsSync } from "node:fs"
import { createLogger } from "../cli/logger"
import type { AgentProfile, SocialMessage, PeerRecord, GossipEvent, PeerStatus, TrustLevel, MessagePriority, MessageStatus } from "./types"

const log = createLogger("social-store")

function generateId(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`
}

export class SocialStore {
  private db: Database
  private initialized = false

  constructor(project?: string) {
    const dataDir = project
      ? join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "projects", project)
      : join(process.cwd(), "data")
    const dir = join(dataDir, "social")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(join(dir, "social.db"))
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec("PRAGMA synchronous = NORMAL")
    this.init()
  }

  private init(): void {
    if (this.initialized) return

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS peers (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        name TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '',
        capabilities TEXT NOT NULL DEFAULT '[]',
        agent_types TEXT NOT NULL DEFAULT '[]',
        listen_address TEXT NOT NULL DEFAULT '',
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('online','offline','away','unknown')),
        trust_level TEXT NOT NULL DEFAULT 'none' CHECK (trust_level IN ('none','minimal','partial','full')),
        reputation REAL NOT NULL DEFAULT 0.0,
        message_count INTEGER NOT NULL DEFAULT 0,
        helpful_count INTEGER NOT NULL DEFAULT 0,
        insight_share_count INTEGER NOT NULL DEFAULT 0
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','critical')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','read','failed')),
        created_at TEXT NOT NULL,
        delivered_at TEXT,
        read_at TEXT,
        reply_to TEXT NOT NULL DEFAULT '',
        metadata TEXT NOT NULL DEFAULT '{}'
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gossip_events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('peer-arrived','peer-departed','insight-shared','mutation-shared','reputation-change','message-relay')),
        source_peer_id TEXT NOT NULL,
        target_peer_id TEXT NOT NULL DEFAULT '',
        payload TEXT NOT NULL DEFAULT '',
        timestamp TEXT NOT NULL,
        ttl INTEGER NOT NULL DEFAULT 3
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS local_profile (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        version TEXT NOT NULL DEFAULT '',
        capabilities TEXT NOT NULL DEFAULT '[]',
        agent_types TEXT NOT NULL DEFAULT '[]',
        listen_address TEXT NOT NULL DEFAULT '',
        last_seen_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'online',
        public_key TEXT NOT NULL DEFAULT ''
      )
    `)

    this.db.exec("CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id, status)")
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at DESC)")
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_peers_status ON peers(status)")
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_gossip_timestamp ON gossip_events(timestamp DESC)")

    this.initialized = true
    log.debug("Social store initialized")
  }

  getLocalProfile(): AgentProfile | null {
    const row = this.db.prepare("SELECT * FROM local_profile LIMIT 1").get() as Record<string, unknown> | null
    if (!row) return null
    return {
      id: row.id as string,
      name: row.name as string,
      instanceId: row.instance_id as string,
      version: row.version as string,
      capabilities: JSON.parse(row.capabilities as string),
      agentTypes: JSON.parse(row.agent_types as string),
      listenAddress: row.listen_address as string,
      lastSeenAt: row.last_seen_at as string,
      status: row.status as PeerStatus,
      publicKey: row.public_key as string,
    }
  }

  saveLocalProfile(profile: AgentProfile): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO local_profile (id, name, instance_id, version, capabilities, agent_types, listen_address, last_seen_at, status, public_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        profile.id, profile.name, profile.instanceId, profile.version,
        JSON.stringify(profile.capabilities), JSON.stringify(profile.agentTypes),
        profile.listenAddress, profile.lastSeenAt, profile.status, profile.publicKey,
      )
  }

  upsertPeer(record: Partial<PeerRecord> & { id: string; profileId: string; name: string }): void {
    const existing = this.db.prepare("SELECT * FROM peers WHERE id = ?").get(record.id) as Record<string, unknown> | null
    const now = new Date().toISOString()

    if (existing) {
      const updates: string[] = ["last_seen_at = ?", "status = ?"]
      const params: (string | number | null)[] = [now, record.status || "online"]

      if (record.reputation !== undefined) { updates.push("reputation = ?"); params.push(record.reputation) }
      if (record.trustLevel !== undefined) { updates.push("trust_level = ?"); params.push(record.trustLevel) }
      if (record.listenAddress) { updates.push("listen_address = ?"); params.push(record.listenAddress) }
      if (record.messageCount !== undefined) { updates.push("message_count = ?"); params.push(record.messageCount) }
      if (record.helpfulCount !== undefined) { updates.push("helpful_count = ?"); params.push(record.helpfulCount) }
      if (record.insightShareCount !== undefined) { updates.push("insight_share_count = ?"); params.push(record.insightShareCount) }
      if (record.capabilities) { updates.push("capabilities = ?"); params.push(JSON.stringify(record.capabilities)) }

      params.push(record.id)
      this.db.prepare(`UPDATE peers SET ${updates.join(", ")} WHERE id = ?`).run(...params)
    } else {
      this.db
        .prepare(
          `INSERT INTO peers (id, profile_id, name, instance_id, version, capabilities, agent_types, listen_address,
           first_seen_at, last_seen_at, status, trust_level, reputation, message_count, helpful_count, insight_share_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          record.id, record.profileId, record.name, record.instanceId || "", record.version || "",
          JSON.stringify(record.capabilities || []), JSON.stringify(record.agentTypes || []),
          record.listenAddress || "", now, now, record.status || "unknown",
          record.trustLevel || "none", record.reputation || 0,
          record.messageCount || 0, record.helpfulCount || 0, record.insightShareCount || 0,
        )
    }
  }

  getPeer(id: string): PeerRecord | null {
    const row = this.db.prepare("SELECT * FROM peers WHERE id = ?").get(id) as Record<string, unknown> | null
    return row ? this.rowToPeer(row) : null
  }

  listPeers(status?: PeerStatus): PeerRecord[] {
    let sql = "SELECT * FROM peers"
    const params: (string | number | null)[] = []
    if (status) {
      sql += " WHERE status = ?"
      params.push(status)
    }
    sql += " ORDER BY reputation DESC"
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[]
    return rows.map((r) => this.rowToPeer(r))
  }

  createMessage(msg: Omit<SocialMessage, "id" | "createdAt" | "deliveredAt" | "readAt">): SocialMessage {
    const id = generateId()
    const now = new Date().toISOString()
    const message: SocialMessage = {
      id, ...msg,
      createdAt: now, deliveredAt: "", readAt: "",
    }

    this.db
      .prepare(
        `INSERT INTO messages (id, sender_id, recipient_id, subject, body, priority, status, created_at, reply_to, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(message.id, message.senderId, message.recipientId, message.subject, message.body,
        message.priority, message.status, message.createdAt, message.replyTo, message.metadata)

    return message
  }

  updateMessageStatus(id: string, status: MessageStatus): void {
    const now = new Date().toISOString()
    const extra = status === "delivered" ? ", delivered_at = ?" : status === "read" ? ", read_at = ?" : ""
    const params: (string | number | null)[] = [status]
    if (status === "delivered" || status === "read") params.push(now)
    params.push(id)
    this.db.prepare(`UPDATE messages SET status = ?${extra} WHERE id = ?`).run(...params)
  }

  getMessagesForPeer(peerId: string, limit = 50): SocialMessage[] {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE recipient_id = ? OR sender_id = ? ORDER BY created_at DESC LIMIT ?")
      .all(peerId, peerId, limit) as Record<string, unknown>[]
    return rows.map((r) => this.rowToMessage(r))
  }

  getPendingMessages(recipientId: string): SocialMessage[] {
    const rows = this.db
      .prepare("SELECT * FROM messages WHERE recipient_id = ? AND status = 'pending' ORDER BY created_at ASC")
      .all(recipientId) as Record<string, unknown>[]
    return rows.map((r) => this.rowToMessage(r))
  }

  recordGossip(event: Omit<GossipEvent, "id" | "timestamp">): GossipEvent {
    const id = generateId()
    const now = new Date().toISOString()
    const evt: GossipEvent = { id, ...event, timestamp: now }

    this.db
      .prepare(
        `INSERT INTO gossip_events (id, type, source_peer_id, target_peer_id, payload, timestamp, ttl)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(evt.id, evt.type, evt.sourcePeerId, evt.targetPeerId, evt.payload, evt.timestamp, evt.ttl)

    return evt
  }

  getRecentGossip(limit = 50): GossipEvent[] {
    const rows = this.db
      .prepare("SELECT * FROM gossip_events ORDER BY timestamp DESC LIMIT ?")
      .all(limit) as Record<string, unknown>[]
    return rows.map((r) => this.rowToGossip(r))
  }

  getStats(): {
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
  } {
    const totalPeers = (this.db.prepare("SELECT COUNT(*) as c FROM peers").get() as { c: number }).c
    const onlinePeers = (this.db.prepare("SELECT COUNT(*) as c FROM peers WHERE status = 'online'").get() as { c: number }).c
    const totalMessages = (this.db.prepare("SELECT COUNT(*) as c FROM messages").get() as { c: number }).c
    const deliveredMessages = (this.db.prepare("SELECT COUNT(*) as c FROM messages WHERE status IN ('delivered','read')").get() as { c: number }).c
    const failedMessages = (this.db.prepare("SELECT COUNT(*) as c FROM messages WHERE status = 'failed'").get() as { c: number }).c
    const totalGossipEvents = (this.db.prepare("SELECT COUNT(*) as c FROM gossip_events").get() as { c: number }).c
    const avgRow = this.db.prepare("SELECT AVG(reputation) as avg FROM peers").get() as { avg: number | null }
    const averageReputation = avgRow.avg || 0

    const top = this.db.prepare("SELECT name, reputation FROM peers ORDER BY reputation DESC LIMIT 5").all() as { name: string; reputation: number }[]
    const topPeers = top.map((r) => ({ name: r.name, reputation: r.reputation }))

    const lastGossip = this.db.prepare("SELECT timestamp FROM gossip_events ORDER BY timestamp DESC LIMIT 1").get() as { timestamp: string } | null
    const lastPeer = this.db.prepare("SELECT last_seen_at FROM peers ORDER BY last_seen_at DESC LIMIT 1").get() as { last_seen_at: string } | null

    return {
      totalPeers, onlinePeers, totalMessages, deliveredMessages, failedMessages,
      totalGossipEvents, averageReputation, topPeers,
      lastDiscoveryAt: lastPeer?.last_seen_at || "",
      lastGossipAt: lastGossip?.timestamp || "",
    }
  }

  private rowToPeer(row: Record<string, unknown>): PeerRecord {
    return {
      id: row.id as string,
      profileId: row.profile_id as string,
      name: row.name as string,
      instanceId: row.instance_id as string,
      version: row.version as string,
      capabilities: JSON.parse(row.capabilities as string),
      agentTypes: JSON.parse(row.agent_types as string),
      listenAddress: row.listen_address as string,
      firstSeenAt: row.first_seen_at as string,
      lastSeenAt: row.last_seen_at as string,
      status: row.status as PeerStatus,
      trustLevel: row.trust_level as TrustLevel,
      reputation: row.reputation as number,
      messageCount: row.message_count as number,
      helpfulCount: row.helpful_count as number,
      insightShareCount: row.insight_share_count as number,
    }
  }

  private rowToMessage(row: Record<string, unknown>): SocialMessage {
    return {
      id: row.id as string,
      senderId: row.sender_id as string,
      recipientId: row.recipient_id as string,
      subject: row.subject as string,
      body: row.body as string,
      priority: row.priority as MessagePriority,
      status: row.status as MessageStatus,
      createdAt: row.created_at as string,
      deliveredAt: (row.delivered_at as string) || "",
      readAt: (row.read_at as string) || "",
      replyTo: (row.reply_to as string) || "",
      metadata: (row.metadata as string) || "{}",
    }
  }

  private rowToGossip(row: Record<string, unknown>): GossipEvent {
    return {
      id: row.id as string,
      type: row.type as GossipEvent["type"],
      sourcePeerId: row.source_peer_id as string,
      targetPeerId: row.target_peer_id as string,
      payload: row.payload as string,
      timestamp: row.timestamp as string,
      ttl: row.ttl as number,
    }
  }
}

export const socialStore = new SocialStore()

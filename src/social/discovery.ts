import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { createLogger } from "../cli/logger"
import type { AgentProfile, PeerRecord, PeerStatus } from "./types"
import { socialStore } from "./social-store"

const log = createLogger("social-discovery")

const BEACON_DIR = join(process.cwd(), "data", "social", "beacons")
const BEACON_TTL_MS = 120_000

export class PeerDiscovery {
  private localProfile: AgentProfile | null = null

  setLocalProfile(profile: AgentProfile): void {
    this.localProfile = profile
  }

  broadcastPresence(): void {
    if (!this.localProfile) {
      log.warn("No local profile set — cannot broadcast")
      return
    }

    if (!existsSync(BEACON_DIR)) {
      mkdirSync(BEACON_DIR, { recursive: true })
    }

    const beacon = {
      profile: this.localProfile,
      timestamp: Date.now(),
      ttl: BEACON_TTL_MS,
    }

    const beaconPath = join(BEACON_DIR, `${this.localProfile.id}.json`)
    writeFileSync(beaconPath, JSON.stringify(beacon, null, 2), "utf-8")
  }

  discoverPeers(): PeerRecord[] {
    if (!existsSync(BEACON_DIR)) return []

    const now = Date.now()
    const discovered: PeerRecord[] = []
    const files = readdirSync(BEACON_DIR)

    for (const file of files) {
      if (!file.endsWith(".json")) continue

      try {
        const beaconPath = join(BEACON_DIR, file)
        const beacon = JSON.parse(readFileSync(beaconPath, "utf-8"))

        if (now - beacon.timestamp > beacon.ttl) {
          continue
        }

        if (this.localProfile && beacon.profile.id === this.localProfile.id) continue

        const profile = beacon.profile as AgentProfile

        const existing = socialStore.getPeer(profile.id)
        const record: Partial<PeerRecord> & { id: string; profileId: string; name: string } = {
          id: profile.id,
          profileId: profile.id,
          name: profile.name || profile.id.slice(0, 8),
          instanceId: profile.instanceId || "",
          version: profile.version || "",
          capabilities: profile.capabilities || [],
          agentTypes: profile.agentTypes || [],
          listenAddress: profile.listenAddress || "",
          status: "online" as PeerStatus,
          reputation: existing?.reputation || 0,
          trustLevel: existing?.trustLevel || "none",
          messageCount: existing?.messageCount || 0,
          helpfulCount: existing?.helpfulCount || 0,
          insightShareCount: existing?.insightShareCount || 0,
        }

        socialStore.upsertPeer(record)

        const full = socialStore.getPeer(profile.id)
        if (full) discovered.push(full)
      } catch (err) {
        log.debug(`Failed to parse beacon ${file}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    return discovered
  }

  markPeersOffline(): void {
    const onlinePeers = socialStore.listPeers("online")
    const now = Date.now()

    for (const peer of onlinePeers) {
      const lastSeen = new Date(peer.lastSeenAt).getTime()
      if (now - lastSeen > BEACON_TTL_MS) {
        socialStore.upsertPeer({
          id: peer.id,
          profileId: peer.profileId,
          name: peer.name,
          status: "offline",
        })
        log.debug(`Marked peer ${peer.name} as offline`)
      }
    }
  }

  cleanupStaleBeacons(): void {
    if (!existsSync(BEACON_DIR)) return

    const now = Date.now()
    for (const file of readdirSync(BEACON_DIR)) {
      if (!file.endsWith(".json")) continue
      try {
        const beaconPath = join(BEACON_DIR, file)
        const beacon = JSON.parse(readFileSync(beaconPath, "utf-8"))
        if (now - beacon.timestamp > beacon.ttl * 2) {
          try { unlinkSync(beaconPath) } catch { /* ignore */ }
        }
      } catch {
        try { unlinkSync(join(BEACON_DIR, file)) } catch { /* ignore */ }
      }
    }
  }
}

export const peerDiscovery = new PeerDiscovery()

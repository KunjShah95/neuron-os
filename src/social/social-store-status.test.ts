import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { SocialStore } from "./social-store"

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "social-store-test-"))
}

describe("SocialStore.upsertPeer status handling", () => {
  let dir: string
  let store: SocialStore

  beforeEach(() => {
    dir = tempDir()
    store = new SocialStore(undefined, { dbPath: dir })
  })

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  })

  it("keeps an offline peer offline when no status is supplied", () => {
    store.upsertPeer({
      id: "peer-1",
      profileId: "profile-1",
      name: "Peer One",
      instanceId: "instance-1",
      status: "online",
    })
    expect(store.getPeer("peer-1")?.status).toBe("online")

    store.upsertPeer({
      id: "peer-1",
      profileId: "profile-1",
      name: "Peer One",
      status: "offline",
    })
    expect(store.getPeer("peer-1")?.status).toBe("offline")

    store.upsertPeer({
      id: "peer-1",
      profileId: "profile-1",
      name: "Peer One",
      reputation: 0.5,
    })

    const peer = store.getPeer("peer-1")
    expect(peer?.status).toBe("offline")
    expect(peer?.reputation).toBe(0.5)
  })

  it("keeps an offline peer offline when the message count changes", () => {
    store.upsertPeer({
      id: "peer-2",
      profileId: "profile-2",
      name: "Peer Two",
      instanceId: "instance-2",
      status: "offline",
    })

    store.upsertPeer({
      id: "peer-2",
      profileId: "profile-2",
      name: "Peer Two",
      messageCount: 3,
    })

    expect(store.getPeer("peer-2")?.status).toBe("offline")
    expect(store.getPeer("peer-2")?.messageCount).toBe(3)
  })

  it("updates the status when one is explicitly supplied", () => {
    store.upsertPeer({
      id: "peer-3",
      profileId: "profile-3",
      name: "Peer Three",
      instanceId: "instance-3",
      status: "offline",
    })

    store.upsertPeer({
      id: "peer-3",
      profileId: "profile-3",
      name: "Peer Three",
      status: "online",
    })

    expect(store.getPeer("peer-3")?.status).toBe("online")
  })

  it("does not resurrect peers that were marked offline", () => {
    store.upsertPeer({
      id: "peer-4",
      profileId: "profile-4",
      name: "Peer Four",
      instanceId: "instance-4",
      status: "online",
    })
    store.upsertPeer({
      id: "peer-4",
      profileId: "profile-4",
      name: "Peer Four",
      status: "offline",
    })

    store.upsertPeer({
      id: "peer-4",
      profileId: "profile-4",
      name: "Peer Four",
      trustLevel: "partial",
    })

    expect(store.listPeers("online").some((p) => p.id === "peer-4")).toBe(false)
    expect(store.listPeers("offline").some((p) => p.id === "peer-4")).toBe(true)
  })
})

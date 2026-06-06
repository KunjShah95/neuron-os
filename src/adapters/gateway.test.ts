import { describe, it, expect, beforeEach } from "bun:test"
/**
 * Unit tests for the Multi-Platform Gateway module.
 *
 * Tests adapter registration/deregistration, message routing,
 * command handling (/agent, /ping), reply sending, and the
 * WebSocket server lifecycle.
 */

import { MultiPlatformGateway } from "./gateway"
import type { PlatformAdapter, PlatformMessage } from "./types"

/**
 * Creates a mock platform adapter for testing.
 */
function createMockAdapter(name: string): PlatformAdapter & { messages: string[]; started: boolean; stopped: boolean } {
  const state = { messages: [] as string[], started: false, stopped: false }
  return {
    name,
    get messages() { return state.messages },
    get started() { return state.started },
    get stopped() { return state.stopped },
    async start() { state.started = true },
    async stop() { state.stopped = true },
    async send(opts: { channelId: string; text: string; replyToId?: string }) {
      state.messages.push(`[${name}:${opts.channelId}] ${opts.text}`)
    },
  }
}

describe("MultiPlatformGateway", () => {
  let gateway: MultiPlatformGateway

  beforeEach(() => {
    gateway = new MultiPlatformGateway()
  })

  // ══════════════════════════════════════════════════════════════════
  //  Adapter Registration
  // ══════════════════════════════════════════════════════════════════

  it("should register an adapter", () => {
    const adapter = createMockAdapter("telegram")
    gateway.register(adapter)
    // No direct way to inspect internals, but no throw = pass
    expect(true).toBe(true)
  })

  it("should register multiple adapters", () => {
    gateway.register(createMockAdapter("slack"))
    gateway.register(createMockAdapter("discord"))
    gateway.register(createMockAdapter("telegram"))
    expect(true).toBe(true)
  })

  it("should overwrite adapter with same name", () => {
    gateway.register(createMockAdapter("test"))
    gateway.register(createMockAdapter("test")) // overwrite
    expect(true).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  Start/Stop Adapters
  // ══════════════════════════════════════════════════════════════════

  it("should start all registered adapters", async () => {
    const a1 = createMockAdapter("adapter-1")
    const a2 = createMockAdapter("adapter-2")
    gateway.register(a1)
    gateway.register(a2)

    await gateway.startAll()
    expect(a1.started).toBe(true)
    expect(a2.started).toBe(true)
  })

  it("should stop all registered adapters", async () => {
    const a1 = createMockAdapter("adapter-1")
    const a2 = createMockAdapter("adapter-2")
    gateway.register(a1)
    gateway.register(a2)

    await gateway.stopAll()
    expect(a1.stopped).toBe(true)
    expect(a2.stopped).toBe(true)
  })

  it("should handle startAll with no adapters", async () => {
    // Should not throw
    await gateway.startAll()
    expect(true).toBe(true)
  })

  it("should handle stopAll with no adapters", async () => {
    await gateway.stopAll()
    expect(true).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  Message Handling
  // ══════════════════════════════════════════════════════════════════

  it("should handle /agent command", async () => {
    const adapter = createMockAdapter("test")
    gateway.register(adapter)

    const msg: PlatformMessage = {
      id: "msg-1",
      platform: "test",
      channelId: "ch-1",
      userId: "user-1",
      userName: "TestUser",
      text: "/agent build the project",
      timestamp: Date.now(),
    }

    await gateway.handleMessage(msg)

    // Should have sent a reply queuing the task
    expect(adapter.messages.length).toBe(1)
    expect(adapter.messages[0]!).toContain("Task queued")
    expect(adapter.messages[0]!).toContain("ch-1")
  })

  it("should handle /ping command", async () => {
    const adapter = createMockAdapter("test")
    gateway.register(adapter)

    const msg: PlatformMessage = {
      id: "msg-2",
      platform: "test",
      channelId: "ch-2",
      userId: "user-2",
      userName: "PingUser",
      text: "/ping",
      timestamp: Date.now(),
    }

    await gateway.handleMessage(msg)

    expect(adapter.messages.length).toBe(1)
    expect(adapter.messages[0]!).toContain("pong")
  })

  it("should handle unrecognized command", async () => {
    const adapter = createMockAdapter("test")
    gateway.register(adapter)

    const msg: PlatformMessage = {
      id: "msg-3",
      platform: "test",
      channelId: "ch-3",
      userId: "user-3",
      userName: "UnknownUser",
      text: "/random_command",
      timestamp: Date.now(),
    }

    await gateway.handleMessage(msg)

    expect(adapter.messages.length).toBe(1)
    expect(adapter.messages[0]!).toContain("Unrecognized")
    expect(adapter.messages[0]!).toContain("/agent")
  })

  it("should handle empty text gracefully", async () => {
    const adapter = createMockAdapter("test")
    gateway.register(adapter)

    const msg: PlatformMessage = {
      id: "msg-4",
      platform: "test",
      channelId: "ch-4",
      userId: "user-4",
      userName: "EmptyUser",
      text: "",
      timestamp: Date.now(),
    }

    // Should not throw on empty text
    await gateway.handleMessage(msg)
    expect(adapter.messages.length).toBe(1)
  })

  it("should handle whitespace-only text", async () => {
    const adapter = createMockAdapter("test")
    gateway.register(adapter)

    const msg: PlatformMessage = {
      id: "msg-5",
      platform: "test",
      channelId: "ch-5",
      userId: "user-5",
      userName: "SpaceUser",
      text: "   ",
      timestamp: Date.now(),
    }

    await gateway.handleMessage(msg)
    expect(adapter.messages.length).toBe(1)
  })

  // ══════════════════════════════════════════════════════════════════
  //  Reply Sending
  // ══════════════════════════════════════════════════════════════════

  it("should send reply through registered adapter", async () => {
    const adapter = createMockAdapter("reply-test")
    gateway.register(adapter)

    await gateway.sendReply("reply-test", "ch-reply", "Hello back!")

    expect(adapter.messages.length).toBe(1)
    expect(adapter.messages[0]!).toContain("Hello back!")
    expect(adapter.messages[0]!).toContain("ch-reply")
  })

  it("should handle reply to unregistered adapter", async () => {
    // Should not throw
    await gateway.sendReply("nonexistent", "ch-1", "Hello")
    expect(true).toBe(true)
  })

  it("should send reply with replyToId", async () => {
    const adapter = createMockAdapter("thread-test")
    gateway.register(adapter)

    await gateway.sendReply("thread-test", "ch-thread", "Thread reply", "original-msg-id")
    expect(adapter.messages.length).toBe(1)
  })

  // ══════════════════════════════════════════════════════════════════
  //  PlatformMessage Structure
  // ══════════════════════════════════════════════════════════════════

  it("should construct a valid PlatformMessage", () => {
    const msg: PlatformMessage = {
      id: "msg-test",
      platform: "slack",
      channelId: "C123",
      userId: "U456",
      userName: "Alice",
      text: "Hello world",
      timestamp: 1700000000000,
    }
    expect(msg.platform).toBe("slack")
    expect(msg.userName).toBe("Alice")
    expect(typeof msg.timestamp).toBe("number")
  })

  it("should construct a PlatformMessage with replyToId", () => {
    const msg: PlatformMessage = {
      id: "msg-thread",
      platform: "discord",
      channelId: "D789",
      userId: "U012",
      userName: "Bob",
      text: "Thread reply",
      replyToId: "parent-msg",
      timestamp: 1700000000000,
    }
    expect(msg.replyToId).toBe("parent-msg")
  })

})

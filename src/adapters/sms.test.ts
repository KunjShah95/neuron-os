import { describe, it, expect, mock, beforeEach } from "bun:test"

/**
 * Unit tests for the SMS adapter.
 *
 * The twilio module is mocked to avoid real API calls.
 * Tests cover send(), start(), stop(), name, text clipping,
 * and the webhook server path.
 */

// ── Mock twilio module ────────────────────────────────────────────────

const mockMessagesCreate = mock(async () => ({ sid: "mock-sid" }))

mock.module("twilio", () => {
  return {
    default: mock(() => ({
      messages: {
        create: mockMessagesCreate,
      },
    })),
  }
})

// Import after mock
import { createSMSAdapter } from "./sms"
import type { PlatformAdapter } from "./types"

// ── Tests ─────────────────────────────────────────────────────────────

describe("SMSAdapter", () => {
  let adapter: PlatformAdapter
  const config = {
    accountSid: "AC_mock",
    authToken: "mock_token",
    fromNumber: "+14155552671",
  }

  beforeEach(() => {
    mockMessagesCreate.mockClear()
    adapter = createSMSAdapter(config)
  })

  // ══════════════════════════════════════════════════════════════════
  //  Adapter Identity
  // ══════════════════════════════════════════════════════════════════

  it("should have name 'sms'", () => {
    expect(adapter.name).toBe("sms")
  })

  // ══════════════════════════════════════════════════════════════════
  //  send()
  // ══════════════════════════════════════════════════════════════════

  it("should send an SMS with correct parameters", async () => {
    await adapter.send({
      channelId: "+1234567890",
      text: "Hello from the bot!",
    })

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1)
    expect(mockMessagesCreate).toHaveBeenCalledWith({
      from: config.fromNumber,
      to: "+1234567890",
      body: "Hello from the bot!",
    })
  })

  it("should strip markdown bold before sending", async () => {
    await adapter.send({
      channelId: "+1234567890",
      text: "This is *bold* text",
    })

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "This is bold text",
      }),
    )
  })

  it("should clip long messages to 1600 characters", async () => {
    const longText = "X".repeat(2000)

    await adapter.send({
      channelId: "+1234567890",
      text: longText,
    })

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("…[truncated]"),
      }),
    )
  })

  it("should handle empty text gracefully", async () => {
    await adapter.send({
      channelId: "+1234567890",
      text: "",
    })

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1)
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ body: "" }),
    )
  })

  it("should send to the correct phone number", async () => {
    await adapter.send({
      channelId: "+1987654321",
      text: "Test message",
    })

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+1987654321" }),
    )
  })

  // ══════════════════════════════════════════════════════════════════
  //  start() / stop()
  // ══════════════════════════════════════════════════════════════════

  it("should start without throwing", async () => {
    await expect(adapter.start()).resolves.toBeUndefined()
  })

  it("should stop without throwing when not started with webhook", async () => {
    await adapter.start()
    await expect(adapter.stop()).resolves.toBeUndefined()
  })

  it("should start and stop multiple times without error", async () => {
    await adapter.start()
    await adapter.stop()
    await adapter.start()
    await adapter.stop()
    expect(true).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  Text Clipping
  // ══════════════════════════════════════════════════════════════════

  it("should preserve exact text under the length limit", async () => {
    const text = "Short message"
    await adapter.send({
      channelId: "+1234567890",
      text,
    })

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ body: text }),
    )
  })

  it("should not clip text exactly at the limit", async () => {
    const text = "Y".repeat(1600)
    await adapter.send({
      channelId: "+1234567890",
      text,
    })

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ body: text }),
    )
  })

  // ══════════════════════════════════════════════════════════════════
  //  Error Handling
  // ══════════════════════════════════════════════════════════════════

  it("should propagate Twilio API errors from send()", async () => {
    mockMessagesCreate.mockImplementationOnce(() => Promise.reject(new Error("Twilio API error")))

    await expect(
      adapter.send({
        channelId: "+1234567890",
        text: "Will fail",
      }),
    ).rejects.toThrow("Twilio API error")
  })

  // ══════════════════════════════════════════════════════════════════
  //  Allowed Users Config (webhook path tested in bot-commands.test)
  // ══════════════════════════════════════════════════════════════════

  it("should respect config with allowedUserIds", async () => {
    const restrictedAdapter = createSMSAdapter({
      ...config,
      allowedUserIds: ["+1111111111"],
    })

    await restrictedAdapter.send({
      channelId: "+1222222222",
      text: "Hello",
    })

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+1222222222",
        body: "Hello",
      }),
    )
  })
})

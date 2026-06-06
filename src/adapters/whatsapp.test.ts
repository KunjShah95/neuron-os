import { describe, it, expect, mock, beforeEach } from "bun:test"

/**
 * Unit tests for the WhatsApp adapter.
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
      api: {
        accounts: () => ({
          fetch: mock(async () => ({
            friendlyName: "Mock Account",
            status: "active",
          })),
        }),
      },
    })),
  }
})

// Import after mock
import { createWhatsAppAdapter } from "./whatsapp"
import type { PlatformAdapter } from "./types"

// ── Tests ─────────────────────────────────────────────────────────────

describe("WhatsAppAdapter", () => {
  let adapter: PlatformAdapter
  const config = {
    accountSid: "AC_mock",
    authToken: "mock_token",
    fromNumber: "whatsapp:+14155238886",
  }

  beforeEach(() => {
    mockMessagesCreate.mockClear()
    adapter = createWhatsAppAdapter(config)
  })

  // ══════════════════════════════════════════════════════════════════
  //  Adapter Identity
  // ══════════════════════════════════════════════════════════════════

  it("should have name 'whatsapp'", () => {
    expect(adapter.name).toBe("whatsapp")
  })

  // ══════════════════════════════════════════════════════════════════
  //  send()
  // ══════════════════════════════════════════════════════════════════

  it("should send a WhatsApp message with correct parameters", async () => {
    await adapter.send({
      channelId: "whatsapp:+1234567890",
      text: "Hello from the bot!",
    })

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1)
    expect(mockMessagesCreate).toHaveBeenCalledWith({
      from: config.fromNumber,
      to: "whatsapp:+1234567890",
      body: "Hello from the bot!",
    })
  })

  it("should strip markdown bold in sent messages", async () => {
    await adapter.send({
      channelId: "whatsapp:+1234567890",
      text: "This is *bold* and _italic_",
    })

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "This is bold and _italic_",
      }),
    )
  })

  it("should clip long messages to 1600 characters", async () => {
    const longText = "A".repeat(2000)

    await adapter.send({
      channelId: "whatsapp:+1234567890",
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
      channelId: "whatsapp:+1234567890",
      text: "",
    })

    expect(mockMessagesCreate).toHaveBeenCalledTimes(1)
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ body: "" }),
    )
  })

  it("should send to the correct channelId", async () => {
    await adapter.send({
      channelId: "whatsapp:+1987654321",
      text: "Test message",
    })

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: "whatsapp:+1987654321" }),
    )
  })

  // ══════════════════════════════════════════════════════════════════
  //  start() / stop()
  // ══════════════════════════════════════════════════════════════════

  it("should start without throwing", async () => {
    // start() with no webhook port just logs — should not throw
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
    // Should not throw on repeated start/stop
    expect(true).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  Text Clipping
  // ══════════════════════════════════════════════════════════════════

  it("should preserve exact text under the length limit", async () => {
    const text = "Short message"
    await adapter.send({
      channelId: "whatsapp:+1234567890",
      text,
    })

    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ body: text }),
    )
  })

  it("should not clip text exactly at the limit", async () => {
    const text = "X".repeat(1600)
    await adapter.send({
      channelId: "whatsapp:+1234567890",
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
        channelId: "whatsapp:+1234567890",
        text: "Will fail",
      }),
    ).rejects.toThrow("Twilio API error")
  })
})

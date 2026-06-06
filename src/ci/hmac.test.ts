import { describe, it, expect } from "bun:test"
import { signPayload, verifySignature } from "./hmac"

describe("HMAC", () => {
  it("signs and verifies a payload", () => {
    const key = "test-key-123"
    const payload = JSON.stringify({ repo: "owner/name", run_id: "12345" })
    const sig = signPayload(payload, key)
    expect(verifySignature(payload, sig, key)).toBe(true)
  })

  it("rejects wrong signature", () => {
    const key = "test-key-123"
    const payload = JSON.stringify({ repo: "owner/name", run_id: "12345" })
    const sig = signPayload(payload, key)
    expect(verifySignature(payload + "tampered", sig, key)).toBe(false)
  })

  it("rejects wrong key", () => {
    const payload = JSON.stringify({ repo: "owner/name", run_id: "12345" })
    const sig = signPayload(payload, "key-a")
    expect(verifySignature(payload, sig, "key-b")).toBe(false)
  })
})

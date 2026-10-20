import { describe, it, expect } from "bun:test"
import { createHmac } from "node:crypto"
import { createHash } from "node:crypto"

import { signPayload, verifyPayload, verifySignature } from "./hmac"
import { handleCiFixHttpRequest } from "./server"

describe("CI HMAC", () => {
  it("produces a real HMAC-SHA256, not a plain hash of payload+key", () => {
    const key = "test-key-123"
    const payload = JSON.stringify({ repo: "owner/name", run_id: "12345" })

    const expected = createHmac("sha256", key).update(payload, "utf-8").digest("hex")
    expect(signPayload(payload, key)).toBe(expected)

    const broken = createHash("sha256").update(payload + key).digest("hex")
    expect(signPayload(payload, key)).not.toBe(broken)
  })

  it("signs and verifies a payload", () => {
    const key = "test-key-123"
    const payload = JSON.stringify({ repo: "owner/name", run_id: "12345" })
    const sig = signPayload(payload, key)
    expect(verifyPayload(payload, sig, key)).toBe(true)
    expect(verifySignature(payload, sig, key)).toBe(true)
  })

  it("rejects a tampered payload, a wrong key, and an empty key", () => {
    const key = "test-key-123"
    const payload = JSON.stringify({ repo: "owner/name", run_id: "12345" })
    const sig = signPayload(payload, key)

    expect(verifyPayload(payload + "tampered", sig, key)).toBe(false)
    expect(verifyPayload(payload, signPayload(payload, "key-a"), "key-b")).toBe(false)
    expect(verifyPayload(payload, sig, "")).toBe(false)
    expect(verifyPayload(payload, "", key)).toBe(false)
  })
})

describe("CI daemon authentication", () => {
  const body = JSON.stringify({ repo: "owner/name", run_id: "1" })

  function makeRequest(headers: Record<string, string>): Request {
    return new Request("http://127.0.0.1/api/v1/ci/fix", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body,
    })
  }

  it("rejects a fix request when no HMAC key is configured (503)", async () => {
    const res = await handleCiFixHttpRequest(makeRequest({}), null)

    expect(res.status).toBe(503)
    const parsed = (await res.json()) as { error?: string }
    expect(parsed.error).toBe("server misconfigured")
  })

  it("rejects a fix request with a bad HMAC signature (401)", async () => {
    const res = await handleCiFixHttpRequest(makeRequest({ "X-Aegis-Signature": "deadbeef" }), "secret-key")

    expect(res.status).toBe(401)
    const parsed = (await res.json()) as { error?: string }
    expect(parsed.error).toBe("Unauthorized")
  })

  it("rejects a fix request with no signature at all (401)", async () => {
    const res = await handleCiFixHttpRequest(makeRequest({}), "secret-key")

    expect(res.status).toBe(401)
  })

  it("rejects a request whose signature was made with a different key (401)", async () => {
    const wrong = signPayload(body, "other-key")
    const res = await handleCiFixHttpRequest(makeRequest({ "X-Aegis-Signature": wrong }), "secret-key")

    expect(res.status).toBe(401)
  })
})

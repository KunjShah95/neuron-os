import { describe, it, expect } from "bun:test"

/**
 * Tests for the shared HMAC-SHA256 utility (hmac.ts).
 *
 * Covers:
 *   - timingSafeEqual constant-time string comparison
 *   - verifyHmac signature verification
 */

// For verifyHmac tests, we need to compute a valid HMAC-SHA256 signature
// using the same Web Crypto API that verifyHmac uses internally.
async function computeHmac(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ])
  const hmac = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  const hex = Array.from(new Uint8Array(hmac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `sha256=${hex}`
}

import { timingSafeEqual, verifyHmac } from "./hmac"

// ── timingSafeEqual ───────────────────────────────────────────────────

describe("timingSafeEqual", () => {
  it("should return true for identical strings", () => {
    expect(timingSafeEqual("hello", "hello")).toBe(true)
  })

  it("should return true for identical empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true)
  })

  it("should return false for strings with different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false)
  })

  it("should return false for same-length strings with different content", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false)
  })

  it("should return false when one string is empty and the other is not", () => {
    expect(timingSafeEqual("", "a")).toBe(false)
    expect(timingSafeEqual("a", "")).toBe(false)
  })

  it("should handle sha256-prefixed signature strings correctly", () => {
    const sig = "sha256=abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
    expect(timingSafeEqual(sig, sig)).toBe(true)
    expect(timingSafeEqual(sig, "sha256=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx")).toBe(false)
  })

  it("should handle special characters correctly", () => {
    expect(timingSafeEqual("a+b=c", "a+b=c")).toBe(true)
    expect(timingSafeEqual("a+b=c", "a-b=c")).toBe(false)
  })

  it("should handle long strings efficiently", () => {
    const long = "x".repeat(10000)
    expect(timingSafeEqual(long, long)).toBe(true)
  })
})

// ── verifyHmac ────────────────────────────────────────────────────────

describe("verifyHmac", () => {
  it("should return true for a valid signature", async () => {
    const payload = '{"event":"push","ref":"refs/heads/main"}'
    const secret = "my-webhook-secret"
    const validSig = await computeHmac(payload, secret)

    const result = await verifyHmac(payload, secret, validSig)
    expect(result).toBe(true)
  })

  it("should return false for an invalid signature", async () => {
    const result = await verifyHmac("payload", "secret", "sha256=invalid")
    expect(result).toBe(false)
  })

  it("should return false for an empty signature", async () => {
    const result = await verifyHmac("payload", "secret", "")
    expect(result).toBe(false)
  })

  it("should return false when signature has wrong prefix", async () => {
    const payload = '{"test":true}'
    const secret = "key"
    const validSig = await computeHmac(payload, secret)
    // Remove the sha256= prefix
    const badPrefix = "md5=" + validSig.slice(7)

    const result = await verifyHmac(payload, secret, badPrefix)
    expect(result).toBe(false)
  })

  it("should return false when payload is tampered", async () => {
    const payload = '{"data":"original"}'
    const secret = "shared-secret"
    const validSig = await computeHmac(payload, secret)

    // Tampered payload
    const result = await verifyHmac('{"data":"tampered"}', secret, validSig)
    expect(result).toBe(false)
  })

  it("should return false when secret does not match", async () => {
    const payload = '{"event":"push"}'
    const sigFromSecretA = await computeHmac(payload, "secret-a")

    const result = await verifyHmac(payload, "secret-b", sigFromSecretA)
    expect(result).toBe(false)
  })

  it("should handle empty payload correctly", async () => {
    const secret = "secret"
    const validSig = await computeHmac("", secret)

    const result = await verifyHmac("", secret, validSig)
    expect(result).toBe(true)
  })

  it("should return false when secret is empty (crypto API rejects empty keys)", async () => {
    // The Web Crypto API rejects empty HMAC keys, so verifyHmac
    // catches the error and returns false.
    const result = await verifyHmac("test", "", "sha256=anything")
    expect(result).toBe(false)
  })

  it("should return false for arbitrary string as signature (no valid hex)", async () => {
    // Any hex-invalid signature string will fail the comparison.
    // This exercises the normal mismatch path, not the error-handling catch.
    const result = await verifyHmac("any", "any", "sha256=any")
    expect(result).toBe(false)
  })
})

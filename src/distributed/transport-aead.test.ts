/**
 * Security tests for the distributed secure transport.
 *
 * Covers: passphrase hardening via scrypt and AEAD binding of the
 * envelope type so a message cannot be re-labelled without breaking the tag.
 */

import { describe, it, expect } from "bun:test"
import { createHash } from "node:crypto"
import { SecureTransport } from "./transport"

describe("SecureTransport key derivation", () => {
  it("does not derive the key with a plain sha256 of the secret", () => {
    const secret = "correct horse battery staple"
    const derived = SecureTransport.deriveKey(secret)
    const naive = createHash("sha256").update(secret, "utf-8").digest()
    expect(derived.equals(naive)).toBe(false)
    expect(derived.length).toBe(32)
  })

  it("derives the same key for the same secret and different keys for different secrets", () => {
    const a = SecureTransport.deriveKey("secret-a")
    const b = SecureTransport.deriveKey("secret-a")
    const c = SecureTransport.deriveKey("secret-b")
    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
  })
})

describe("SecureTransport message integrity", () => {
  it("round-trips a message", () => {
    const key = SecureTransport.deriveKey("secret")
    const raw = SecureTransport.createMessage("heartbeat", { id: "node-1" }, key)
    const parsed = SecureTransport.parseMessage(raw, key)
    expect(parsed.type).toBe("heartbeat")
    expect(parsed.payload).toEqual({ id: "node-1" })
  })

  it("uses a fresh iv for every message", () => {
    const key = SecureTransport.deriveKey("secret")
    const a = JSON.parse(SecureTransport.createMessage("heartbeat", { id: "node-1" }, key)) as { iv: string }
    const b = JSON.parse(SecureTransport.createMessage("heartbeat", { id: "node-1" }, key)) as { iv: string }
    expect(a.iv).not.toBe(b.iv)
  })

  it("rejects a message whose type was swapped", () => {
    const key = SecureTransport.deriveKey("secret")
    const raw = SecureTransport.createMessage("heartbeat", { id: "node-1" }, key)
    const envelope = JSON.parse(raw) as { type: string; ciphertext: string; iv: string; tag: string }
    const tampered = JSON.stringify({ ...envelope, type: "task" })
    expect(() => SecureTransport.parseMessage(tampered, key)).toThrow()
  })

  it("rejects a message encrypted under a different key", () => {
    const key = SecureTransport.deriveKey("secret")
    const other = SecureTransport.deriveKey("other-secret")
    const raw = SecureTransport.createMessage("heartbeat", { id: "node-1" }, key)
    expect(() => SecureTransport.parseMessage(raw, other)).toThrow()
  })

  it("binds the aad into the cipher when encrypting directly", () => {
    const key = SecureTransport.deriveKey("secret")
    const payload = SecureTransport.encrypt("hello", key, "type-a")
    expect(SecureTransport.decrypt(payload, key, "type-a")).toBe("hello")
    expect(() => SecureTransport.decrypt(payload, key, "type-b")).toThrow()
  })
})

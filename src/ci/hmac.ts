import { createHmac, timingSafeEqual } from "node:crypto"

const ALGORITHM = "sha256"

export function signPayload(payload: string, key: string): string {
  return createHmac(ALGORITHM, key).update(payload, "utf-8").digest("hex")
}

export function verifyPayload(payload: string, signature: string, key: string): boolean {
  if (!key || !signature) return false
  const expected = Buffer.from(signPayload(payload, key), "utf-8")
  const provided = Buffer.from(signature, "utf-8")
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}

export function verifySignature(payload: string, signature: string, key: string): boolean {
  return verifyPayload(payload, signature, key)
}

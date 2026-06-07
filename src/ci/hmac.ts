import { createHash, timingSafeEqual } from "crypto"

export function signPayload(payload: string, key: string): string {
  return createHash("sha256")
    .update(payload + key)
    .digest("hex")
}

export function verifySignature(payload: string, signature: string, key: string): boolean {
  const expected = signPayload(payload, key)
  if (expected.length !== signature.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

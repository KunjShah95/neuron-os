import { createHmac, timingSafeEqual } from "node:crypto"

export interface TwilioSignatureParams {
  [key: string]: string
}

function base64HmacSha1(authToken: string, payload: string): string {
  return createHmac("sha1", authToken).update(payload, "utf-8").digest("base64")
}

export function buildTwilioSignaturePayload(url: string, params: TwilioSignatureParams): string {
  const keys = Object.keys(params).sort()
  let payload = url
  for (const key of keys) {
    payload += key + (params[key] ?? "")
  }
  return payload
}

export function computeTwilioSignature(authToken: string, url: string, params: TwilioSignatureParams): string {
  return base64HmacSha1(authToken, buildTwilioSignaturePayload(url, params))
}

export function validateTwilioSignature(
  authToken: string,
  signature: string | null | undefined,
  url: string,
  params: TwilioSignatureParams,
): boolean {
  if (!authToken || !signature) return false
  const expected = Buffer.from(computeTwilioSignature(authToken, url, params), "utf-8")
  const provided = Buffer.from(signature, "utf-8")
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}

import { describe, expect, it } from "bun:test"
import { createHmac } from "node:crypto"
import {
  buildTwilioSignaturePayload,
  computeTwilioSignature,
  validateTwilioSignature,
} from "./twilio-signature"

describe("Twilio request signature validation", () => {
  const authToken = "test-auth-token"
  const url = "https://example.com/webhook/twilio/sms"
  const params = {
    From: "+15551230000",
    To: "+15559990000",
    Body: "/agent do something",
  }

  it("builds the payload from the url plus params sorted by key", () => {
    const payload = buildTwilioSignaturePayload(url, params)
    expect(payload).toBe(url + "Body/agent do somethingFrom+15551230000To+15559990000")
  })

  it("accepts a signature produced by the documented Twilio algorithm", () => {
    const expected = createHmac("sha1", authToken)
      .update(buildTwilioSignaturePayload(url, params))
      .digest("base64")
    expect(expected).toBe(computeTwilioSignature(authToken, url, params))
    expect(validateTwilioSignature(authToken, expected, url, params)).toBe(true)
  })

  it("rejects a signature computed over a different url", () => {
    const signature = computeTwilioSignature(authToken, "https://evil.test/webhook", params)
    expect(validateTwilioSignature(authToken, signature, url, params)).toBe(false)
  })

  it("rejects a signature computed over tampered params", () => {
    const signature = computeTwilioSignature(authToken, url, { ...params, Body: "/agent rm -rf" })
    expect(validateTwilioSignature(authToken, signature, url, params)).toBe(false)
  })

  it("rejects a signature computed with a different auth token", () => {
    const signature = computeTwilioSignature("other-token", url, params)
    expect(validateTwilioSignature(authToken, signature, url, params)).toBe(false)
  })

  it("rejects a missing signature or a missing auth token", () => {
    expect(validateTwilioSignature(authToken, null, url, params)).toBe(false)
    expect(validateTwilioSignature(authToken, undefined, url, params)).toBe(false)
    expect(validateTwilioSignature("", computeTwilioSignature(authToken, url, params), url, params)).toBe(false)
  })

  it("rejects a signature of the wrong length without throwing", () => {
    expect(validateTwilioSignature(authToken, "abc", url, params)).toBe(false)
  })
})

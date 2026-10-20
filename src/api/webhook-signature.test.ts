/**
 * Security tests for webhook HMAC verification.
 *
 * Covers: missing signature rejection, verification over the raw request
 * body, and tamper detection.
 */

import { describe, it, expect } from "bun:test"
import { createWebhookHandler } from "./webhook-handler"

const SECRET = "webhook-shared-secret"

async function sign(payload: string, secret: string = SECRET): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const result = await crypto.subtle.sign("HMAC", key, encoder.encode(payload))
  const hex = Array.from(new Uint8Array(result))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `sha256=${hex}`
}

function webhookRequest(body: string, signature?: string): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-github-event": "ping",
  }
  if (signature) headers["x-hub-signature-256"] = signature
  return new Request("http://localhost/api/v1/webhook/github", {
    method: "POST",
    headers,
    body,
  })
}

describe("webhook signature verification", () => {
  it("rejects a request with no signature when a secret is configured", async () => {
    const handler = createWebhookHandler({ secret: SECRET })
    const res = await handler(webhookRequest(JSON.stringify({ zen: "hello" })))
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Missing signature")
  })

  it("accepts a signature computed over the raw request body", async () => {
    const handler = createWebhookHandler({ secret: SECRET })
    const raw = JSON.stringify({ zen: "hello", nested: { a: 1 } })
    const res = await handler(webhookRequest(raw, await sign(raw)))
    expect(res.status).toBe(200)
  })

  it("rejects a signature computed over a re-serialized payload", async () => {
    const handler = createWebhookHandler({ secret: SECRET })
    const raw = JSON.stringify({ zen: "hello", nested: { a: 1 } })
    const reserialized = JSON.stringify({ nested: { a: 1 }, zen: "hello" })
    const res = await handler(webhookRequest(raw, await sign(reserialized)))
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Invalid signature")
  })

  it("rejects a body that was tampered with after signing", async () => {
    const handler = createWebhookHandler({ secret: SECRET })
    const raw = JSON.stringify({ zen: "hello" })
    const tampered = JSON.stringify({ zen: "goodbye" })
    const res = await handler(webhookRequest(tampered, await sign(raw)))
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Invalid signature")
  })

  it("rejects a signature made with the wrong secret", async () => {
    const handler = createWebhookHandler({ secret: SECRET })
    const raw = JSON.stringify({ zen: "hello" })
    const res = await handler(webhookRequest(raw, await sign(raw, "other-secret")))
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Invalid signature")
  })

  it("does not require a signature when no secret is configured", async () => {
    const handler = createWebhookHandler({})
    const res = await handler(webhookRequest(JSON.stringify({ zen: "hello" })))
    expect(res.status).toBe(200)
  })

  it("still rejects malformed JSON with 400", async () => {
    const handler = createWebhookHandler({ secret: SECRET })
    const raw = "{not json"
    const res = await handler(webhookRequest(raw, await sign(raw)))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Invalid JSON payload")
  })
})

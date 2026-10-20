/**
 * Security tests for the distributed cluster API request signing.
 *
 * Covers: mandatory signature, body-bound signatures, replay window,
 * and constant-time comparison behaviour.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { DistributedAPI } from "./api"
import { WorkerPool } from "./pool"
import { SecureTransport } from "./transport"

const SECRET = "cluster-secret-for-signing-tests"

let api: DistributedAPI
let key: Buffer
let base: string

beforeAll(async () => {
  process.env.AEGIS_CLUSTER_SECRET = SECRET
  key = SecureTransport.deriveKey(SECRET)
  const pool = new WorkerPool({ nodeId: "node-test", role: "worker", listenPort: 0, secret: SECRET })
  api = new DistributedAPI(pool)
  await api.start(0)
  base = `http://127.0.0.1:${api.getPort()}`
})

afterAll(async () => {
  await api.stop()
})

function signed(
  method: string,
  path: string,
  body: string,
  timestamp: number = Date.now(),
): { signature: string; timestamp: string } {
  return DistributedAPI.signRequest(method, path, body, key, timestamp)
}

describe("Distributed API signature enforcement", () => {
  it("rejects a request without a signature header", async () => {
    const res = await fetch(`${base}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "test", payload: {} }),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Missing signature")
  })

  it("rejects a request without a timestamp header", async () => {
    const payload = JSON.stringify({ type: "test", payload: {} })
    const { signature } = signed("POST", "/task", payload)
    const res = await fetch(`${base}/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-aegis-signature": signature },
      body: payload,
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Missing timestamp")
  })

  it("rejects a body that was tampered with after signing", async () => {
    const signedBody = JSON.stringify({ type: "test", payload: { goal: "benign" } })
    const sentBody = JSON.stringify({ type: "test", payload: { goal: "malicious" } })
    const { signature, timestamp } = signed("POST", "/task", signedBody)
    const res = await fetch(`${base}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-aegis-signature": signature,
        "x-aegis-timestamp": timestamp,
      },
      body: sentBody,
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Invalid signature")
  })

  it("rejects a signature computed for a different path", async () => {
    const payload = JSON.stringify({ type: "test", payload: {} })
    const { signature, timestamp } = signed("POST", "/health", payload)
    const res = await fetch(`${base}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-aegis-signature": signature,
        "x-aegis-timestamp": timestamp,
      },
      body: payload,
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Invalid signature")
  })

  it("rejects a signature outside the replay window", async () => {
    const payload = JSON.stringify({ type: "test", payload: {} })
    const stale = Date.now() - 5 * 60 * 1000
    const { signature, timestamp } = signed("POST", "/task", payload, stale)
    const res = await fetch(`${base}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-aegis-signature": signature,
        "x-aegis-timestamp": timestamp,
      },
      body: payload,
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe("Expired timestamp")
  })

  it("accepts a validly signed request", async () => {
    const payload = JSON.stringify({ type: "test", payload: { goal: "hello" } })
    const { signature, timestamp } = signed("POST", "/task", payload)
    const res = await fetch(`${base}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-aegis-signature": signature,
        "x-aegis-timestamp": timestamp,
      },
      body: payload,
    })
    expect(res.status).not.toBe(401)
    const body = (await res.json()) as { error?: string }
    expect(body.error).not.toBe("Invalid signature")
    expect(body.error).not.toBe("Missing signature")
  })

  it("accepts a validly signed health request", async () => {
    const { signature, timestamp } = signed("GET", "/health", "")
    const res = await fetch(`${base}/health`, {
      headers: { "x-aegis-signature": signature, "x-aegis-timestamp": timestamp },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe("ok")
  })

  it("rejects a malformed signature", async () => {
    const payload = JSON.stringify({ type: "test", payload: {} })
    const { timestamp } = signed("POST", "/task", payload)
    const res = await fetch(`${base}/task`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-aegis-signature": "not-a-signature",
        "x-aegis-timestamp": timestamp,
      },
      body: payload,
    })
    expect(res.status).toBe(401)
  })
})

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { createHmac } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { TriggerEngine, triggerEngine } from "./registry"

let dataDir: string
let previousDataDir: string | undefined

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "aegis-trigger-webhook-"))
  previousDataDir = process.env.AEGIS_DATA_DIR
  process.env.AEGIS_DATA_DIR = dataDir
})

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.AEGIS_DATA_DIR
  else process.env.AEGIS_DATA_DIR = previousDataDir
  rmSync(dataDir, { recursive: true, force: true })
})

describe("webhook trigger method matching", () => {
  it("only matches a trigger whose declared method equals the request method", () => {
    const engine = new TriggerEngine()
    engine.register({
      name: "post-only",
      type: "webhook",
      config: { path: "/api/v1/webhook/github", method: "POST" },
      action: { mode: "queue-task", goal: "do the thing" },
      enabled: true,
    })

    expect(engine.matchWebhook("/api/v1/webhook/github", "POST")).toBeDefined()
    expect(engine.matchWebhook("/api/v1/webhook/github", "GET")).toBeUndefined()
    expect(engine.matchWebhook("/api/v1/webhook/github", "PUT")).toBeUndefined()
  })

  it("matches a trigger with no declared method for any method", () => {
    const engine = new TriggerEngine()
    engine.register({
      name: "any-method",
      type: "webhook",
      config: { path: "/api/v1/webhook/any" },
      action: { mode: "queue-task", goal: "do the thing" },
      enabled: true,
    })

    expect(engine.matchWebhook("/api/v1/webhook/any", "POST")).toBeDefined()
    expect(engine.matchWebhook("/api/v1/webhook/any", "GET")).toBeDefined()
  })
})

describe("webhook trigger secret enforcement", () => {
  it("rejects a missing or wrong signature and accepts a matching one", () => {
    const engine = new TriggerEngine()
    const trigger = engine.register({
      name: "signed",
      type: "webhook",
      config: { path: "/api/v1/webhook/signed", method: "POST", secret: "topsecret" },
      action: { mode: "queue-task", goal: "do the thing" },
      enabled: true,
    })

    const payload = JSON.stringify({ hello: "world" })
    const good = createHmac("sha256", "topsecret").update(payload, "utf-8").digest("hex")
    const bad = createHmac("sha256", "wrongsecret").update(payload, "utf-8").digest("hex")

    expect(engine.verifyWebhookSecret(trigger, payload, good)).toBe(true)
    expect(engine.verifyWebhookSecret(trigger, payload, `sha256=${good}`)).toBe(true)
    expect(engine.verifyWebhookSecret(trigger, payload, bad)).toBe(false)
    expect(engine.verifyWebhookSecret(trigger, payload, null)).toBe(false)
    expect(engine.verifyWebhookSecret(trigger, payload, undefined)).toBe(false)
  })

  it("treats a trigger with no secret as open", () => {
    const engine = new TriggerEngine()
    const trigger = engine.register({
      name: "unsigned",
      type: "webhook",
      config: { path: "/api/v1/webhook/unsigned", method: "POST" },
      action: { mode: "queue-task", goal: "do the thing" },
      enabled: true,
    })

    expect(engine.verifyWebhookSecret(trigger, "anything", null)).toBe(true)
  })
})

describe("webhook handler enforcement on non-POST requests", () => {
  const registered: string[] = []

  afterEach(() => {
    for (const id of registered.splice(0, registered.length)) {
      triggerEngine.unregister(id)
    }
  })

  function registerGetTrigger(): string {
    const path = `/api/v1/webhook/test-get-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const trigger = triggerEngine.register({
      name: `test-get-${Date.now()}`,
      type: "webhook",
      config: { path, method: "GET" },
      action: { mode: "queue-task", goal: "do the thing" },
      enabled: true,
    })
    registered.push(trigger.id)
    return path
  }

  function getRequest(path: string, signature?: string): Request {
    const headers: Record<string, string> = {}
    if (signature) headers["x-hub-signature-256"] = signature
    return new Request(`http://localhost${path}`, { method: "GET", headers })
  }

  it("rejects a request with no signature when the handler secret is configured", async () => {
    const { createWebhookHandler } = await import("../api/webhook-handler")
    const path = registerGetTrigger()

    const res = await createWebhookHandler({ secret: "global-secret" })(getRequest(path))
    expect(res.status).toBe(401)
  })

  it("rejects a request with the wrong signature when the handler secret is configured", async () => {
    const { createWebhookHandler } = await import("../api/webhook-handler")
    const path = registerGetTrigger()

    const res = await createWebhookHandler({ secret: "global-secret" })(
      getRequest(path, `sha256=${createHmac("sha256", "wrong").update("", "utf-8").digest("hex")}`),
    )
    expect(res.status).toBe(401)
  })

  it("accepts a request signed with the handler secret", async () => {
    const { createWebhookHandler } = await import("../api/webhook-handler")
    const path = registerGetTrigger()

    const signature = `sha256=${createHmac("sha256", "global-secret").update("", "utf-8").digest("hex")}`
    const res = await createWebhookHandler({ secret: "global-secret" })(getRequest(path, signature))
    expect(res.status).toBe(202)
  })

  it("rejects a request whose trigger secret does not match", async () => {
    const { createWebhookHandler } = await import("../api/webhook-handler")
    const path = `/api/v1/webhook/test-signed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const trigger = triggerEngine.register({
      name: `test-signed-${Date.now()}`,
      type: "webhook",
      config: { path, method: "GET", secret: "trigger-secret" },
      action: { mode: "queue-task", goal: "do the thing" },
      enabled: true,
    })
    registered.push(trigger.id)

    const bad = createHmac("sha256", "wrong-secret").update("", "utf-8").digest("hex")
    const res = await createWebhookHandler({})(getRequest(path, bad))
    expect(res.status).toBe(401)

    const good = createHmac("sha256", "trigger-secret").update("", "utf-8").digest("hex")
    const ok = await createWebhookHandler({})(getRequest(path, good))
    expect(ok.status).toBe(202)
  })

  it("returns 405 when no trigger declares the request method", async () => {
    const { createWebhookHandler } = await import("../api/webhook-handler")
    const res = await createWebhookHandler({})(getRequest("/api/v1/webhook/does-not-exist"))
    expect(res.status).toBe(405)
  })

  it("accepts a bare hex signature for the handler secret", async () => {
    const { createWebhookHandler } = await import("../api/webhook-handler")
    const path = registerGetTrigger()

    const bare = createHmac("sha256", "global-secret").update("", "utf-8").digest("hex")
    const res = await createWebhookHandler({ secret: "global-secret" })(getRequest(path, bare))
    expect(res.status).toBe(202)
  })
})

describe("webhook handler enforcement on POST requests", () => {
  const registered: string[] = []

  afterEach(() => {
    for (const id of registered.splice(0, registered.length)) {
      triggerEngine.unregister(id)
    }
  })

  function registerPostTrigger(secret: string): string {
    const path = `/api/v1/webhook/test-post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const trigger = triggerEngine.register({
      name: `test-post-${Date.now()}`,
      type: "webhook",
      config: { path, method: "POST", secret },
      action: { mode: "queue-task", goal: "do the thing" },
      enabled: true,
    })
    registered.push(trigger.id)
    return path
  }

  function postRequest(path: string, body: string, headers: Record<string, string>): Request {
    return new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    })
  }

  it("enforces the trigger secret on a POST request", async () => {
    const { createWebhookHandler } = await import("../api/webhook-handler")
    const path = registerPostTrigger("trigger-secret")
    const body = JSON.stringify({ hello: "world" })

    const bad = createHmac("sha256", "wrong-secret").update(body, "utf-8").digest("hex")
    const rejected = await createWebhookHandler({})(
      postRequest(path, body, { "x-aegis-signature": bad }),
    )
    expect(rejected.status).toBe(401)

    const good = createHmac("sha256", "trigger-secret").update(body, "utf-8").digest("hex")
    const accepted = await createWebhookHandler({})(
      postRequest(path, body, { "x-aegis-signature": good }),
    )
    expect(accepted.status).not.toBe(401)
  })
})

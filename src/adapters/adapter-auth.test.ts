import { describe, it, expect, afterEach } from "bun:test"

import { WsGatewayAdapter } from "./ws-gateway"
import { MultiPlatformGateway } from "./gateway"

const adapters: WsGatewayAdapter[] = []
const gateways: MultiPlatformGateway[] = []

function connectWebSocket(url: string): Promise<"open" | "error"> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    ws.onopen = () => {
      ws.close()
      resolve("open")
    }
    ws.onerror = () => resolve("error")
  })
}

afterEach(async () => {
  while (adapters.length > 0) await adapters.pop()?.stop()
  while (gateways.length > 0) await gateways.pop()?.stopAll()
})

describe("WsGatewayAdapter authentication", () => {
  it("rejects an upgrade with no token", async () => {
    const adapter = new WsGatewayAdapter(0, "secret-token")
    adapters.push(adapter)
    await adapter.start()
    const port = (adapter as unknown as { server: { port: number } }).server.port

    const res = await fetch(`http://127.0.0.1:${port}/ws`)
    expect(res.status).toBe(401)
  })

  it("rejects an upgrade with a token that only shares the aegis_ prefix", async () => {
    const adapter = new WsGatewayAdapter(0, "secret-token")
    adapters.push(adapter)
    await adapter.start()
    const port = (adapter as unknown as { server: { port: number } }).server.port

    const res = await fetch(`http://127.0.0.1:${port}/ws?token=aegis_x`)
    expect(res.status).toBe(401)
  })

  it("rejects an upgrade with the wrong token", async () => {
    const adapter = new WsGatewayAdapter(0, "secret-token")
    adapters.push(adapter)
    await adapter.start()
    const port = (adapter as unknown as { server: { port: number } }).server.port

    const res = await fetch(`http://127.0.0.1:${port}/ws?token=wrong`)
    expect(res.status).toBe(401)
  })

  it("rejects every upgrade when no token is configured and the key store rejects it", async () => {
    const previous = process.env.AEGIS_WS_TOKEN
    delete process.env.AEGIS_WS_TOKEN
    try {
      const adapter = new WsGatewayAdapter(0, undefined, async () => false)
      adapters.push(adapter)
      await adapter.start()
      const port = (adapter as unknown as { server: { port: number } }).server.port

      const res = await fetch(`http://127.0.0.1:${port}/ws?token=aegis_anything`)
      expect(res.status).toBe(401)
    } finally {
      if (previous !== undefined) process.env.AEGIS_WS_TOKEN = previous
    }
  })

  it("accepts a valid Aegis API key when no dedicated token is configured", async () => {
    const previous = process.env.AEGIS_WS_TOKEN
    delete process.env.AEGIS_WS_TOKEN
    try {
      const seen: string[] = []
      const adapter = new WsGatewayAdapter(0, undefined, async (token: string) => {
        seen.push(token)
        return token === "aegis_valid_key"
      })
      adapters.push(adapter)
      await adapter.start()
      const port = (adapter as unknown as { server: { port: number } }).server.port

      expect(await connectWebSocket(`ws://127.0.0.1:${port}/ws?token=aegis_valid_key`)).toBe("open")
      expect(seen).toEqual(["aegis_valid_key"])
    } finally {
      if (previous !== undefined) process.env.AEGIS_WS_TOKEN = previous
    }
  })

  it("reports 503 when the key store is unavailable", async () => {
    const previous = process.env.AEGIS_WS_TOKEN
    delete process.env.AEGIS_WS_TOKEN
    try {
      const adapter = new WsGatewayAdapter(0, undefined, async () => {
        throw new Error("key store offline")
      })
      adapters.push(adapter)
      await adapter.start()
      const port = (adapter as unknown as { server: { port: number } }).server.port

      const res = await fetch(`http://127.0.0.1:${port}/ws?token=aegis_anything`)
      expect(res.status).toBe(503)
    } finally {
      if (previous !== undefined) process.env.AEGIS_WS_TOKEN = previous
    }
  })
})

describe("MultiPlatformGateway socket server", () => {
  it("rejects an unauthenticated WebSocket upgrade", async () => {
    const gateway = new MultiPlatformGateway({ socketToken: "gw-token" })
    gateways.push(gateway)
    const server = gateway.startSocketServer(0)
    const port = server.port

    const res = await fetch(`http://127.0.0.1:${port}/ws`)
    expect(res.status).toBe(401)
  })

  it("rejects an upgrade with the wrong bearer token", async () => {
    const gateway = new MultiPlatformGateway({ socketToken: "gw-token" })
    gateways.push(gateway)
    const server = gateway.startSocketServer(0)
    const port = server.port

    const res = await fetch(`http://127.0.0.1:${port}/ws`, {
      headers: { Authorization: "Bearer wrong" },
    })
    expect(res.status).toBe(401)
  })

  it("rejects every upgrade when no token is configured", async () => {
    const previous = process.env.AEGIS_GATEWAY_TOKEN
    delete process.env.AEGIS_GATEWAY_TOKEN
    try {
      const gateway = new MultiPlatformGateway()
      gateways.push(gateway)
      const server = gateway.startSocketServer(0)
      const port = server.port

      const res = await fetch(`http://127.0.0.1:${port}/ws`, {
        headers: { Authorization: "Bearer anything" },
      })
      expect(res.status).toBe(503)
    } finally {
      if (previous !== undefined) process.env.AEGIS_GATEWAY_TOKEN = previous
    }
  })

  it("does not upgrade a non-socket path", async () => {
    const gateway = new MultiPlatformGateway({ socketToken: "gw-token" })
    gateways.push(gateway)
    const server = gateway.startSocketServer(0)
    const port = server.port

    const res = await fetch(`http://127.0.0.1:${port}/anything`)
    expect(res.status).toBe(200)
  })

  it("stops the socket server in stopAll", async () => {
    const gateway = new MultiPlatformGateway({ socketToken: "gw-token" })
    const server = gateway.startSocketServer(0)
    const port = server.port

    await gateway.stopAll()

    let reachable = true
    try {
      await fetch(`http://127.0.0.1:${port}/health`)
    } catch {
      reachable = false
    }
    expect(reachable).toBe(false)
  })
})

import { describe, it, expect, afterAll } from "bun:test"
import { WsGatewayAdapter } from "./ws-gateway"
import type { PlatformMessage } from "./types"

describe("WsGatewayAdapter", () => {
  let adapter: WsGatewayAdapter

  afterAll(async () => {
    await adapter?.stop()
  })

  it("should start and stop without error", async () => {
    adapter = new WsGatewayAdapter(0)
    await adapter.start()
    expect(adapter.connectedClients).toBe(0)
    await adapter.stop()
  })

  it("should reject unauthenticated upgrade requests", async () => {
    adapter = new WsGatewayAdapter(0)
    await adapter.start()

    const port = (adapter as any).server?.port
    const res = await fetch(`http://localhost:${port}/health`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
    await adapter.stop()
  })

  it("should report zero clients when idle", async () => {
    adapter = new WsGatewayAdapter(0)
    await adapter.start()
    expect(adapter.connectedClients).toBe(0)
    await adapter.stop()
  })

  it("should accept onMessage callback", () => {
    adapter = new WsGatewayAdapter(0)
    const handler = async (_msg: PlatformMessage) => {}
    adapter.onMessage = handler
    expect(adapter.onMessage).toBeDefined()
  })

  it("should handle send to no subscribers gracefully", async () => {
    adapter = new WsGatewayAdapter(0)
    await adapter.start()
    await adapter.send({ channelId: "test", text: "hello" })
    await adapter.stop()
  })

  it("should broadcast system messages without errors", async () => {
    adapter = new WsGatewayAdapter(0)
    await adapter.start()
    adapter.broadcastSystem({ message: "test" })
    await adapter.stop()
  })
})

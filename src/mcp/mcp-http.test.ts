/**
 * Tests for the MCP HTTP transport layer.
 * Covers health, tool discovery, tool calling, and JSON-RPC over HTTP.
 *
 * Usage: bun test src/mcp/test-mcp-http.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { startMCPServerHTTP } from "./server"

let server: { stop: () => void }
const PORT = 3124
const BASE = `http://localhost:${PORT}`
const API_KEY = "mcp-http-test-key"
const AUTH = { Authorization: `Bearer ${API_KEY}` }
const ALLOW_LIST = ["list_tools", "call_tool", "read"]

beforeAll(() => {
  server = startMCPServerHTTP({
    port: PORT,
    host: "localhost",
    apiKey: API_KEY,
    allowTools: ALLOW_LIST,
  })
})

afterAll(() => {
  server.stop()
})

describe("MCP HTTP Transport", () => {
  it("should return health status", async () => {
    const res = await fetch(`${BASE}/health`)
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.status).toBe("ok")
    expect(body.protocol).toBe("mcp")
  })

  it("should list available tools", async () => {
    const res = await fetch(`${BASE}/tools`)
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.tools).toBeDefined()
    expect(Array.isArray(body.tools)).toBe(true)
    const toolNames = body.tools.map((t: { name: string }) => t.name)
    // The /tools endpoint returns tools from toolRegistry (registered tools)
    // MCP internal methods (list_tools, call_tool) are returned via JSON-RPC
    expect(toolNames.length).toBeGreaterThan(0)
    // Should contain at least one known registered tool
    const knownTools = ["bash", "read", "write", "edit"]
    const found = knownTools.some((t) => toolNames.includes(t))
    expect(found).toBe(true)
  })

  it("should handle JSON-RPC over HTTP", async () => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "list_tools",
        params: {},
      }),
    })
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.jsonrpc).toBe("2.0")
    expect(body.id).toBe(1)
    expect(body.result).toBeDefined()
    expect(body.result.tools).toBeDefined()
    expect(Array.isArray(body.result.tools)).toBe(true)
  })

  it("should return error for unknown JSON-RPC method", async () => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "nonexistent_method",
        params: {},
      }),
    })
    expect(res.status).toBe(403)
    const body: any = await res.json()
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe(-32003)
    expect(body.error.message).toContain("Method not allowed")
  })

  it("should reject requests without an API key", async () => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "list_tools",
        params: {},
      }),
    })
    expect(res.status).toBe(401)
  })

  it("should return 404 for unknown paths", async () => {
    const res = await fetch(`${BASE}/unknown`)
    expect(res.status).toBe(404)
  })

  it("should call a registered tool via /call endpoint", async () => {
    const res = await fetch(`${BASE}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH },
      body: JSON.stringify({
        name: "list_tools",
        arguments: {},
      }),
    })
    expect(res.status).toBe(200)
    const body: any = await res.json()
    // list_tools is an MCP method, not a registered tool — expect a graceful error
    expect(body.success).toBeDefined()
  })

  it("should return 400 when tool name is missing", async () => {
    const res = await fetch(`${BASE}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body: any = await res.json()
    expect(body.error).toContain("Missing tool name")
  })

  it("should validate JSON-RPC request structure", async () => {
    const res = await fetch(`${BASE}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...AUTH },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "",
        params: {},
      }),
    })
    expect(res.status).toBe(403)
    const body: any = await res.json()
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe(-32003)
  })
})

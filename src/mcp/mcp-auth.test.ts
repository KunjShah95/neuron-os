/**
 * Security tests for the MCP HTTP transport.
 *
 * Covers: authentication on privileged endpoints, allow-list enforcement,
 * server-side permission derivation, and the loopback-only default bind.
 */

import { describe, it, expect, afterAll } from "bun:test"
import { startMCPServerHTTP, type MCPServerHandle } from "./server"

const API_KEY = "unit-test-mcp-key"

const openServers: MCPServerHandle[] = []

function open(config: Parameters<typeof startMCPServerHTTP>[0]): MCPServerHandle {
  const handle = startMCPServerHTTP(config)
  openServers.push(handle)
  return handle
}

afterAll(() => {
  for (const handle of openServers) {
    try {
      handle.stop()
    } catch {
      // ignore stop failures
    }
  }
})

describe("MCP HTTP authentication", () => {
  it("binds to loopback by default", () => {
    const handle = open({ port: 0 })
    expect(handle.host).toBe("127.0.0.1")
    expect(handle.url.startsWith("http://127.0.0.1:")).toBe(true)
  })

  it("rejects /call without an authorization header", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY, allowTools: ["read"] })
    const res = await fetch(`${handle.url}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "read", arguments: { path: "package.json" } }),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain("Unauthorized")
  })

  it("rejects /call with a wrong api key", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY, allowTools: ["read"] })
    const res = await fetch(`${handle.url}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer wrong-key" },
      body: JSON.stringify({ name: "read", arguments: { path: "package.json" } }),
    })
    expect(res.status).toBe(401)
  })

  it("rejects /call when the server has no api key configured", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", allowTools: ["read"] })
    const res = await fetch(`${handle.url}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "read", arguments: { path: "package.json" } }),
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain("no API key configured")
  })

  it("still serves discovery endpoints when no api key is configured", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", allowTools: ["read"] })
    const health = await fetch(`${handle.url}/health`)
    expect(health.status).toBe(200)
    const tools = await fetch(`${handle.url}/tools`)
    expect(tools.status).toBe(200)
  })

  it("rejects /mcp without an authorization header", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY, allowTools: ["list_tools"] })
    const res = await fetch(`${handle.url}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "list_tools", params: {} }),
    })
    expect(res.status).toBe(401)
  })
})

describe("MCP allow-list enforcement", () => {
  it("rejects a tool that is not in allowTools with 403", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY, allowTools: ["read"] })
    const res = await fetch(`${handle.url}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ name: "bash", arguments: { command: "echo pwned" } }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toContain("Tool not allowed")
  })

  it("allows a tool that is in allowTools", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY, allowTools: ["read"] })
    const res = await fetch(`${handle.url}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ name: "read", arguments: { path: "package.json" } }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBeDefined()
  })

  it("treats an undefined allowTools as no tools allowed", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY })
    const res = await fetch(`${handle.url}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ name: "read", arguments: { path: "package.json" } }),
    })
    expect(res.status).toBe(403)
  })

  it("rejects a JSON-RPC method that is not in allowTools with 403", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY, allowTools: ["read"] })
    const res = await fetch(`${handle.url}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "spawn_agent", params: { name: "x" } }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error?: { code: number; message: string } }
    expect(body.error?.code).toBe(-32003)
  })

  it("allows a JSON-RPC method that is in allowTools", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY, allowTools: ["list_tools"] })
    const res = await fetch(`${handle.url}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 8, method: "list_tools", params: {} }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { result?: { tools?: unknown[] } }
    expect(Array.isArray(body.result?.tools)).toBe(true)
  })

  it("rejects a JSON-RPC call_tool for a tool outside allowTools", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY, allowTools: ["call_tool", "read"] })
    const res = await fetch(`${handle.url}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 9,
        method: "call_tool",
        params: { tool: "bash", params: { command: "echo pwned" } },
      }),
    })
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error?: { code: number } }
    expect(body.error?.code).toBe(-32003)
  })

  it("does not let the request body grant its own permission", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY, allowTools: ["read"] })
    const res = await fetch(`${handle.url}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        name: "bash",
        arguments: { command: "echo pwned" },
        permissions: [{ name: "bash", allow: true }],
      }),
    })
    expect(res.status).toBe(403)
  })

  it("allows every method when allowAllTools is set", async () => {
    const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY, allowAllTools: true })
    const res = await fetch(`${handle.url}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 10, method: "nonexistent_method", params: {} }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { error?: { code: number } }
    expect(body.error?.code).toBe(-32601)
  })

  it("falls back to the AEGIS_MCP_ALLOW_TOOLS environment variable", async () => {
    const previous = process.env.AEGIS_MCP_ALLOW_TOOLS
    process.env.AEGIS_MCP_ALLOW_TOOLS = "read"
    try {
      const handle = open({ port: 0, host: "127.0.0.1", apiKey: API_KEY })
      const allowed = await fetch(`${handle.url}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ name: "read", arguments: { path: "package.json" } }),
      })
      expect(allowed.status).toBe(200)
      const denied = await fetch(`${handle.url}/call`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({ name: "bash", arguments: { command: "echo pwned" } }),
      })
      expect(denied.status).toBe(403)
    } finally {
      if (previous === undefined) delete process.env.AEGIS_MCP_ALLOW_TOOLS
      else process.env.AEGIS_MCP_ALLOW_TOOLS = previous
    }
  })
})

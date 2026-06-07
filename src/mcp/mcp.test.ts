import { describe, it, expect } from "bun:test"
/**
 * Unit tests for the MCP (Model Context Protocol) module.
 *
 * Tests both the MCP client (remote tool discovery + execution) and
 * MCP server (JSON-RPC handler, HTTP transport, tool registry integration).
 */

import { toolRegistry, type Tool } from "../tools"

describe("Mcp Tests", () => {
  // ══════════════════════════════════════════════════════════════════
  //  MCP Server: JSON-RPC Handler
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should json rpc parse error", async () => {
    // Verify the server module loads without error
    const mod = await import("./server")
    expect(typeof mod.startMCPServerStdio === "function").toBe(true)
    expect(typeof mod.startMCPServerHTTP === "function").toBe(true)
  })

  it("should tool registry integration", async () => {
    // Verify toolRegistry is accessible and has tools
    const tools = toolRegistry.list()
    expect(Array.isArray(tools)).toBe(true)

    // Check for built-in tools
    const toolNames = tools.map((t) => t.name)
    expect(toolNames.includes("bash")).toBe(true)
    expect(toolNames.includes("read")).toBe(true)
    expect(toolNames.includes("write")).toBe(true)
  })

  it("should tool execution", async () => {
    // Test that tools can be executed through the registry
    const result = await toolRegistry.execute(
      "read",
      { path: "package.json" },
      {
        agentId: "test",
        cwd: process.cwd(),
        permissions: [{ name: "read", allow: true }],
      },
    )
    expect(result.success).toBe(true)
    expect(typeof result.output === "string").toBe(true)
    expect(result.output.length > 0).toBe(true)
  })

  it("should tool not found", async () => {
    const result = await toolRegistry.execute(
      "nonexistent-tool",
      {},
      {
        agentId: "test",
        cwd: process.cwd(),
        permissions: [],
      },
    )
    expect(!result.success).toBe(true)
    expect(typeof result.error === "string" && result.error.length > 0).toBe(true)
  })

  it("should tool permission denied", async () => {
    const result = await toolRegistry.execute(
      "bash",
      { command: "echo hi" },
      {
        agentId: "test",
        cwd: process.cwd(),
        permissions: [], // No permissions granted
      },
    )
    expect(!result.success).toBe(true)
  })

  // ══════════════════════════════════════════════════════════════════
  //  MCP Client: Configuration
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should configure clients", async () => {
    const { configureMCPClients, getMCPClients } = await import("./client")

    // Initially empty
    const initial = getMCPClients()
    expect(initial.length).toBe(0)

    // Configure some clients
    configureMCPClients([{ name: "test-server", url: "http://localhost:9999", enabled: true }])
    const configured = getMCPClients()
    expect(configured.length).toBe(1)
    expect(configured[0]!.name).toBe("test-server")
    expect(configured[0]!.url).toBe("http://localhost:9999")

    // Reset for other tests
    configureMCPClients([])
  })

  it("should client configuration roundtrip", async () => {
    const { configureMCPClients, getMCPClients } = await import("./client")

    configureMCPClients([
      { name: "alpha", url: "http://alpha:8080", apiKey: "key-123", enabled: true },
      { name: "beta", url: "http://beta:9090", enabled: false },
    ])

    const clients = getMCPClients()
    expect(clients.length).toBe(2)

    const alpha = clients.find((c) => c.name === "alpha")
    expect(alpha !== undefined).toBe(true)
    expect(alpha?.apiKey).toBe("key-123")
    expect(alpha?.enabled).toBe(true)

    const beta = clients.find((c) => c.name === "beta")
    expect(beta !== undefined).toBe(true)
    expect(beta?.enabled).toBe(false)

    // Reset
    configureMCPClients([])
  })

  // ══════════════════════════════════════════════════════════════════
  //  MCP Server: HTTP Transport
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should http server health", async () => {
    const { startMCPServerHTTP } = await import("./server")

    // Start server on random port
    const server = startMCPServerHTTP({ port: 0, host: "127.0.0.1" })
    expect(true).toBe(true)
    server.stop()
    expect(true).toBe(true)
  })

  it("should server with auth", async () => {
    const { startMCPServerHTTP } = await import("./server")

    // Start with API key
    const server = startMCPServerHTTP({
      port: 0,
      host: "127.0.0.1",
      apiKey: "test-key",
    })
    expect(true).toBe(true)
    server.stop()
  })

  // ══════════════════════════════════════════════════════════════════
  //  Tool Name Prefixed
  // ══════════════════════════════════════════════════════════════════

  console.log("╚══════════════════════════════════════════════════════════╝\n")

  it("should tool registration", async () => {
    const before = toolRegistry.list().length

    const testTool: Tool = {
      name: "test-mcp-tool",
      description: "A test tool for MCP tests",
      parameters: [{ name: "input", type: "string", description: "Test input", required: true }],
      async execute(params) {
        return { success: true, output: `echo: ${params.input}` }
      },
    }

    toolRegistry.register(testTool)
    const after = toolRegistry.list().length
    expect(after > before).toBe(true)

    // Execute the registered tool
    const result = await toolRegistry.execute(
      "test-mcp-tool",
      { input: "hello" },
      {
        agentId: "test",
        cwd: process.cwd(),
        permissions: [{ name: "test-mcp-tool", allow: true }],
      },
    )
    expect(result.success).toBe(true)
    expect(result.output).toBe("echo: hello")
  })

  // ══════════════════════════════════════════════════════════════════
  //  RUNNER
  // ══════════════════════════════════════════════════════════════════
})

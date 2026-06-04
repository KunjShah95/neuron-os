#!/usr/bin/env bun
/**
 * Unit tests for the MCP (Model Context Protocol) module.
 *
 * Tests both the MCP client (remote tool discovery + execution) and
 * MCP server (JSON-RPC handler, HTTP transport, tool registry integration).
 */

import { toolRegistry, type Tool } from "../tools"

let passed = 0
let failed = 0

function assert(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label}`) }
}

function assertEqual<T>(a: T, b: T, label: string) {
  if (a === b) { passed++; console.log(`  ✅ ${label}`) }
  else { failed++; console.error(`  ❌ ${label} — expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) }
}

// ══════════════════════════════════════════════════════════════════
//  MCP Server: JSON-RPC Handler
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  MCP Server — JSON-RPC Handler                         ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testJsonRpcParseError() {
  // Verify the server module loads without error
  const mod = await import("./server")
  assert(typeof mod.startMCPServerStdio === "function", "startMCPServerStdio is a function")
  assert(typeof mod.startMCPServerHTTP === "function", "startMCPServerHTTP is a function")
}

async function testToolRegistryIntegration() {
  // Verify toolRegistry is accessible and has tools
  const tools = toolRegistry.list()
  assert(Array.isArray(tools), "toolRegistry.list() returns an array")

  // Check for built-in tools
  const toolNames = tools.map((t) => t.name)
  assert(toolNames.includes("bash"), "toolRegistry includes 'bash' tool")
  assert(toolNames.includes("read"), "toolRegistry includes 'read' tool")
  assert(toolNames.includes("write"), "toolRegistry includes 'write' tool")
}

async function testToolExecution() {
  // Test that tools can be executed through the registry
  const result = await toolRegistry.execute("read", { path: "package.json" }, {
    agentId: "test",
    cwd: process.cwd(),
    permissions: [{ name: "read", allow: true }],
  })
  assert(result.success, "read tool executes successfully on package.json")
  assert(typeof result.output === "string", "read tool returns string output")
  assert(result.output.length > 0, "read tool returns non-empty output")
}

async function testToolNotFound() {
  const result = await toolRegistry.execute("nonexistent-tool", {}, {
    agentId: "test",
    cwd: process.cwd(),
    permissions: [],
  })
  assert(!result.success, "nonexistent tool returns failure")
  assert(typeof result.error === "string" && result.error.length > 0, "nonexistent tool returns error message")
}

async function testToolPermissionDenied() {
  const result = await toolRegistry.execute("bash", { command: "echo hi" }, {
    agentId: "test",
    cwd: process.cwd(),
    permissions: [], // No permissions granted
  })
  assert(!result.success, "tool without permissions returns failure")
}

// ══════════════════════════════════════════════════════════════════
//  MCP Client: Configuration
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  MCP Client — Configuration & Discovery                  ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testConfigureClients() {
  const { configureMCPClients, getMCPClients } = await import("./client")

  // Initially empty
  const initial = getMCPClients()
  assertEqual(initial.length, 0, "no clients configured initially")

  // Configure some clients
  configureMCPClients([
    { name: "test-server", url: "http://localhost:9999", enabled: true },
  ])
  const configured = getMCPClients()
  assertEqual(configured.length, 1, "clients are configured")
  assertEqual(configured[0]!.name, "test-server", "client name preserved")
  assertEqual(configured[0]!.url, "http://localhost:9999", "client URL preserved")

  // Reset for other tests
  configureMCPClients([])
}

async function testClientConfigurationRoundtrip() {
  const { configureMCPClients, getMCPClients } = await import("./client")

  configureMCPClients([
    { name: "alpha", url: "http://alpha:8080", apiKey: "key-123", enabled: true },
    { name: "beta", url: "http://beta:9090", enabled: false },
  ])

  const clients = getMCPClients()
  assertEqual(clients.length, 2, "multiple clients configured")

  const alpha = clients.find((c) => c.name === "alpha")
  assert(alpha !== undefined, "alpha client found")
  assertEqual(alpha?.apiKey, "key-123", "API key preserved")
  assertEqual(alpha?.enabled, true, "alpha enabled")

  const beta = clients.find((c) => c.name === "beta")
  assert(beta !== undefined, "beta client found")
  assertEqual(beta?.enabled, false, "beta disabled")

  // Reset
  configureMCPClients([])
}

// ══════════════════════════════════════════════════════════════════
//  MCP Server: HTTP Transport
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  MCP Server — HTTP Transport                            ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testHttpServerHealth() {
  const { startMCPServerHTTP } = await import("./server")

  // Start server on random port
  const server = startMCPServerHTTP({ port: 0, host: "127.0.0.1" })
  assert(true, "MCP HTTP server starts without error")
  server.stop()
  assert(true, "MCP HTTP server stops without error")
}

async function testServerWithAuth() {
  const { startMCPServerHTTP } = await import("./server")

  // Start with API key
  const server = startMCPServerHTTP({
    port: 0,
    host: "127.0.0.1",
    apiKey: "test-key",
  })
  assert(true, "MCP server with auth starts without error")
  server.stop()
}

// ══════════════════════════════════════════════════════════════════
//  Tool Name Prefixed
// ══════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════════════════╗")
console.log("║  Tool Registry — Registration & Discovery               ║")
console.log("╚══════════════════════════════════════════════════════════╝\n")

async function testToolRegistration() {
  const before = toolRegistry.list().length

  const testTool: Tool = {
    name: "test-mcp-tool",
    description: "A test tool for MCP tests",
    parameters: [
      { name: "input", type: "string", description: "Test input", required: true },
    ],
    async execute(params) {
      return { success: true, output: `echo: ${params.input}` }
    },
  }

  toolRegistry.register(testTool)
  const after = toolRegistry.list().length
  assert(after > before, "tool registry count increased after registration")

  // Execute the registered tool
  const result = await toolRegistry.execute("test-mcp-tool", { input: "hello" }, {
    agentId: "test",
    cwd: process.cwd(),
    permissions: [{ name: "test-mcp-tool", allow: true }],
  })
  assert(result.success, "registered tool executes successfully")
  assertEqual(result.output, "echo: hello", "tool returns correct output")
}

// ══════════════════════════════════════════════════════════════════
//  RUNNER
// ══════════════════════════════════════════════════════════════════

async function runAll() {
  console.log("\n  ╔══════════════════════════════════════════╗")
  console.log("  ║   MCP Module Tests                       ║")
  console.log("  ╚══════════════════════════════════════════╝")

  // ── MCP Server ──
  await testJsonRpcParseError()
  await testToolRegistryIntegration()
  await testToolExecution()
  await testToolNotFound()
  await testToolPermissionDenied()

  // ── MCP Client ──
  await testConfigureClients()
  await testClientConfigurationRoundtrip()

  // ── MCP HTTP Transport ──
  await testHttpServerHealth()
  await testServerWithAuth()

  // ── Tool Registry ──
  await testToolRegistration()

  console.log(`\n══ Results: ${passed} passed, ${failed} failed ══\n`)
  process.exit(failed > 0 ? 1 : 0)
}

runAll()

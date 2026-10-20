import { createHash, timingSafeEqual } from "node:crypto"
import { toolRegistry } from "../tools"
import { memorySystem } from "../memory"
import { agentManager } from "../agent/manager"
import { skillRegistry } from "../skills"
import type { AgentTypeName } from "../agent/agent-types"
import type { ToolPermission } from "../agent/agent-types"

export interface MCPServerConfig {
  port?: number
  host?: string
  apiKey?: string
  allowTools?: string[]
  allowAllTools?: boolean
}

export interface MCPServerHandle {
  stop: () => void
  url: string
  host: string
  port: number
}

interface ToolPolicy {
  allows: (name: string) => boolean
  permissions: ToolPermission[]
}

interface MCPRequest {
  jsonrpc: "2.0"
  id: number | string
  method: string
  params?: Record<string, unknown>
}

interface MCPResponse {
  jsonrpc: "2.0"
  id: number | string
  result?: unknown
  error?: { code: number; message: string }
}

// ── MCP tool definitions ──────────────────────────────────────────────

const MCP_TOOLS = [
  {
    name: "list_tools",
    description: "List all available tools on this MCP server",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "call_tool",
    description: "Execute a registered tool by name with parameters",
    inputSchema: {
      type: "object",
      properties: {
        tool: { type: "string", description: "Name of the tool to call" },
        params: { type: "object", description: "Tool parameters as key-value pairs" },
      },
      required: ["tool"],
    },
  },
  {
    name: "list_skills",
    description: "List all installed skills",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "read_skill",
    description: "Get the full content of a skill by name",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", description: "Skill name" } },
      required: ["name"],
    },
  },
  {
    name: "read_memory",
    description: "Read long-term memory",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Optional search query" } },
    },
  },
  {
    name: "write_memory",
    description: "Write to long-term memory",
    inputSchema: {
      type: "object",
      properties: { content: { type: "string", description: "Content to remember" } },
      required: ["content"],
    },
  },
  {
    name: "list_agents",
    description: "List all running agents",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "spawn_agent",
    description: "Spawn a new agent worker",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Agent name" },
        type: { type: "string", description: "Agent type" },
      },
      required: ["name"],
    },
  },
  {
    name: "run_task",
    description: "Send a task to a running agent",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent ID" },
        goal: { type: "string", description: "Task goal" },
      },
      required: ["agentId", "goal"],
    },
  },
  {
    name: "get_agent_output",
    description: "Get the last 50 log lines from a running agent",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent ID" },
      },
      required: ["agentId"],
    },
  },
  {
    name: "send_message",
    description: "Send a message to a running agent via IPC",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Agent ID" },
        message: { type: "string", description: "Message text to send" },
      },
      required: ["agentId", "message"],
    },
  },
]

// ── Handler ────────────────────────────────────────────────────────────

function jsonRpc(id: number | string, result?: unknown, error?: { code: number; message: string }): MCPResponse {
  return { jsonrpc: "2.0", id, result, error }
}

function safeEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf-8").digest()
  const digestB = createHash("sha256").update(b, "utf-8").digest()
  return timingSafeEqual(digestA, digestB)
}

function registeredToolNames(): string[] {
  return toolRegistry.list().map((t) => t.name)
}

function resolveAllowList(config: MCPServerConfig): string[] {
  if (config.allowTools) return config.allowTools
  const fromEnv = process.env.AEGIS_MCP_ALLOW_TOOLS
  if (!fromEnv) return []
  return fromEnv
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function buildPolicy(config: MCPServerConfig): ToolPolicy {
  const requested = resolveAllowList(config)
  const wildcard = config.allowAllTools === true || requested.includes("*")
  if (wildcard) {
    const names = [...registeredToolNames(), ...MCP_TOOLS.map((t) => t.name)]
    return {
      allows: () => true,
      permissions: names.map((name) => ({ name, allow: true })),
    }
  }
  const names = new Set(requested)
  return {
    allows: (name: string) => names.has(name),
    permissions: [...names].map((name) => ({ name, allow: true })),
  }
}

function buildUnrestrictedPolicy(): ToolPolicy {
  return {
    allows: () => true,
    permissions: registeredToolNames().map((name) => ({ name, allow: true })),
  }
}

function forbiddenResponse(req: MCPRequest, policy: ToolPolicy): MCPResponse | null {
  if (!policy.allows(req.method)) {
    return jsonRpc(req.id, undefined, { code: -32003, message: `Method not allowed: ${req.method}` })
  }
  if (req.method === "call_tool") {
    const toolName = String((req.params as Record<string, unknown> | undefined)?.tool ?? "")
    if (toolName && !policy.allows(toolName)) {
      return jsonRpc(req.id, undefined, { code: -32003, message: `Tool not allowed: ${toolName}` })
    }
  }
  return null
}

async function handleRequest(req: MCPRequest, policy: ToolPolicy): Promise<MCPResponse> {
  const { id, method, params } = req

  const forbidden = forbiddenResponse(req, policy)
  if (forbidden) return forbidden

  try {
    switch (method) {
      case "list_tools": {
        const registered = toolRegistry.list()
        const builtinTools = registered.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: {
            type: "object",
            properties: Object.fromEntries(
              t.parameters.map((p) => [p.name, { type: p.type, description: p.description }]),
            ),
            required: t.parameters.filter((p) => p.required).map((p) => p.name),
          },
        }))
        return jsonRpc(id, { tools: [...builtinTools, ...MCP_TOOLS] })
      }

      case "call_tool": {
        if (!params?.tool) return jsonRpc(id, undefined, { code: -32602, message: "Missing 'tool' parameter" })

        const toolName = String(params.tool)
        const toolArgs = (params.params as Record<string, unknown>) || {}

        const result = await toolRegistry.execute(toolName, toolArgs, {
          agentId: "mcp-server",
          cwd: process.cwd(),
          permissions: policy.permissions,
        })

        return jsonRpc(id, { success: result.success, output: result.output || result.error })
      }

      case "list_skills": {
        await skillRegistry.loadAll()
        const skills = skillRegistry.getManifest()
        return jsonRpc(id, { skills })
      }

      case "read_skill": {
        if (!params?.name) return jsonRpc(id, undefined, { code: -32602, message: "Missing 'name' parameter" })
        await skillRegistry.loadAll()
        const content = await skillRegistry.readSkill(String(params.name), {
          agentId: "mcp-server",
          cwd: process.cwd(),
        })
        if (!content) return jsonRpc(id, undefined, { code: -32000, message: `Skill '${params.name}' not found` })
        return jsonRpc(id, { content })
      }

      case "read_memory": {
        if (params?.query) {
          const results = await memorySystem.search(String(params.query))
          return jsonRpc(id, { results })
        }
        const memory = await memorySystem.loadMemory()
        return jsonRpc(id, { memory })
      }

      case "write_memory": {
        if (!params?.content) return jsonRpc(id, undefined, { code: -32602, message: "Missing 'content' parameter" })
        await memorySystem.appendToMemory(String(params.content))
        return jsonRpc(id, { status: "saved" })
      }

      case "list_agents": {
        const agents = agentManager.list().map((a) => ({
          id: a.id,
          name: a.def.name,
          type: a.def.agentType,
          status: a.status,
        }))
        return jsonRpc(id, { agents })
      }

      case "spawn_agent": {
        if (!params?.name) return jsonRpc(id, undefined, { code: -32602, message: "Missing 'name' parameter" })
        const agentId = await agentManager.spawn({
          name: String(params.name),
          agentType: String(params.type ?? "") as AgentTypeName | undefined,
          script: "src/agent/agent-worker.ts",
        })
        return jsonRpc(id, { agentId, status: "spawned" })
      }

      case "run_task": {
        if (!params?.agentId || !params?.goal) {
          return jsonRpc(id, undefined, { code: -32602, message: "Missing 'agentId' or 'goal' parameter" })
        }
        agentManager.sendIpc(String(params.agentId), {
          type: "run-task",
          id: `mcp-${Date.now()}`,
          payload: { goal: String(params.goal) },
          timestamp: Date.now(),
        })
        return jsonRpc(id, { sent: true })
      }

      case "get_agent_output": {
        if (!params?.agentId) return jsonRpc(id, undefined, { code: -32602, message: "Missing 'agentId' parameter" })
        const instance = agentManager.get(String(params.agentId))
        if (!instance) return jsonRpc(id, undefined, { code: -32000, message: `Agent '${params.agentId}' not found` })
        const lines = instance.log.slice(-50).map((e) => `[${e.level}] ${e.text}`)
        return jsonRpc(id, { lines })
      }

      case "send_message": {
        if (!params?.agentId || !params?.message) {
          return jsonRpc(id, undefined, { code: -32602, message: "Missing 'agentId' or 'message' parameter" })
        }
        await agentManager.sendIpc(String(params.agentId), {
          type: "message",
          id: `mcp-msg-${Date.now()}`,
          payload: { text: String(params.message) },
          timestamp: Date.now(),
        })
        return jsonRpc(id, { sent: true })
      }

      default:
        return jsonRpc(id, undefined, { code: -32601, message: `Method not found: ${method}` })
    }
  } catch (err: unknown) {
    return jsonRpc(id, undefined, { code: -32000, message: err instanceof Error ? err.message : String(err) })
  }
}

// ── Transport: Stdio ──────────────────────────────────────────────────

export async function startMCPServerStdio(): Promise<void> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  const policy = buildUnrestrictedPolicy()
  let buffer = ""

  const stdinStream = Bun.stdin.stream()
  const reader = stdinStream.getReader()

  async function writeResponse(res: MCPResponse): Promise<void> {
    const json = JSON.stringify(res) + "\n"
    const encoded = encoder.encode(json)
    process.stdout.write(encoded)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const req = JSON.parse(line) as MCPRequest
        const res = await handleRequest(req, policy)
        await writeResponse(res)
      } catch {
        await writeResponse(jsonRpc(0, undefined, { code: -32700, message: "Parse error" }))
      }
    }
  }
}

// ── Transport: HTTP ───────────────────────────────────────────────────

export function startMCPServerHTTP(config: MCPServerConfig): MCPServerHandle {
  const port = config.port ?? 3100
  const host = config.host ?? "127.0.0.1"
  const apiKey = config.apiKey && config.apiKey.length > 0 ? config.apiKey : undefined
  const policy = buildPolicy(config)

  const jsonHeaders = { "Content-Type": "application/json" }

  function authError(request: Request): Response | null {
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: server has no API key configured, privileged endpoints are disabled" }),
        { status: 401, headers: jsonHeaders },
      )
    }
    const header = request.headers.get("authorization") ?? ""
    if (!safeEqual(header, `Bearer ${apiKey}`)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders })
    }
    return null
  }

  const server = Bun.serve({
    port,
    hostname: host,
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url)

      // GET /health
      if (url.pathname === "/health" && request.method === "GET") {
        return new Response(JSON.stringify({ status: "ok", protocol: "mcp" }), {
          headers: { "Content-Type": "application/json" },
        })
      }

      // GET /tools — MCP tool discovery
      if (url.pathname === "/tools" && request.method === "GET") {
        const registered = toolRegistry.list()
        const tools = registered.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: {
            type: "object",
            properties: Object.fromEntries(
              t.parameters.map((p) => [p.name, { type: p.type, description: p.description }]),
            ),
            required: t.parameters.filter((p) => p.required).map((p) => p.name),
          },
        }))
        return new Response(JSON.stringify({ tools }), {
          headers: { "Content-Type": "application/json" },
        })
      }

      // POST /call — MCP tool call
      if (url.pathname === "/call" && request.method === "POST") {
        const unauthorized = authError(request)
        if (unauthorized) return unauthorized

        const body = (await request.json()) as { name?: string; arguments?: Record<string, unknown> }
        if (!body.name) {
          return new Response(JSON.stringify({ error: "Missing tool name" }), { status: 400, headers: jsonHeaders })
        }

        if (!policy.allows(body.name)) {
          return new Response(JSON.stringify({ error: `Tool not allowed: ${body.name}` }), {
            status: 403,
            headers: jsonHeaders,
          })
        }

        const result = await toolRegistry.execute(body.name, body.arguments || {}, {
          agentId: "mcp-http",
          cwd: process.cwd(),
          permissions: policy.permissions,
        })

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        })
      }

      // POST /mcp — JSON-RPC over HTTP
      if (url.pathname === "/mcp" && request.method === "POST") {
        const unauthorized = authError(request)
        if (unauthorized) return unauthorized

        const req = (await request.json()) as MCPRequest
        const forbidden = forbiddenResponse(req, policy)
        if (forbidden) {
          return new Response(JSON.stringify(forbidden), { status: 403, headers: jsonHeaders })
        }

        const res = await handleRequest(req, policy)
        return new Response(JSON.stringify(res), {
          headers: { "Content-Type": "application/json" },
        })
      }

      return new Response("Not found", { status: 404 })
    },
  })

  const boundHost = server.hostname || host
  const boundPort = typeof server.port === "number" ? server.port : port

  console.log(`🔌 MCP server listening on http://${boundHost}:${boundPort}`)
  console.log(`   Tools endpoint: http://${boundHost}:${boundPort}/tools`)
  console.log(`   JSON-RPC:      POST http://${boundHost}:${boundPort}/mcp`)
  if (!apiKey) {
    console.log("   ⚠ No API key configured — /call and /mcp are disabled until one is set")
  }
  const effectiveAllowList = resolveAllowList(config)
  const allowAll = config.allowAllTools === true || effectiveAllowList.includes("*")
  console.log(`   Allowed: ${allowAll ? "all" : effectiveAllowList.join(", ") || "none"}`)
  return {
    stop: () => server.stop(),
    url: `http://${boundHost}:${boundPort}`,
    host: boundHost,
    port: boundPort,
  }
}

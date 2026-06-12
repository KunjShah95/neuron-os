import { toolRegistry } from "../tools"
import { memorySystem } from "../memory"
import { agentManager } from "../agent/manager"
import { skillRegistry } from "../skills"
import type { AgentTypeName } from "../agent/agent-types"

export interface MCPServerConfig {
  port?: number
  host?: string
  apiKey?: string
  allowTools?: string[]
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

async function handleRequest(req: MCPRequest): Promise<MCPResponse> {
  const { id, method, params } = req

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
          permissions: [{ name: toolName, allow: true }],
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
        const res = await handleRequest(req)
        await writeResponse(res)
      } catch {
        await writeResponse(jsonRpc(0, undefined, { code: -32700, message: "Parse error" }))
      }
    }
  }
}

// ── Transport: HTTP ───────────────────────────────────────────────────

export function startMCPServerHTTP(config: MCPServerConfig): { stop: () => void } {
  const port = config.port ?? 3100
  const host = config.host ?? "0.0.0.0"

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
        const auth = request.headers.get("authorization")
        if (config.apiKey && auth !== `Bearer ${config.apiKey}`) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
        }

        const body = (await request.json()) as { name?: string; arguments?: Record<string, unknown> }
        if (!body.name) {
          return new Response(JSON.stringify({ error: "Missing tool name" }), { status: 400 })
        }

        const result = await toolRegistry.execute(body.name, body.arguments || {}, {
          agentId: "mcp-http",
          cwd: process.cwd(),
          permissions: [{ name: body.name, allow: true }],
        })

        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json" },
        })
      }

      // POST /mcp — JSON-RPC over HTTP
      if (url.pathname === "/mcp" && request.method === "POST") {
        const auth = request.headers.get("authorization")
        if (config.apiKey && auth !== `Bearer ${config.apiKey}`) {
          return new Response(JSON.stringify(jsonRpc(0, undefined, { code: -32001, message: "Unauthorized" })), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          })
        }

        const req = (await request.json()) as MCPRequest
        const res = await handleRequest(req)
        return new Response(JSON.stringify(res), {
          headers: { "Content-Type": "application/json" },
        })
      }

      return new Response("Not found", { status: 404 })
    },
  })

  console.log(`🔌 MCP server listening on http://${host}:${port}`)
  console.log(`   Tools endpoint: http://${host}:${port}/tools`)
  console.log(`   JSON-RPC:      POST http://${host}:${port}/mcp`)

  return { stop: () => server.stop() }
}

import { toolRegistry } from "./registry"
import type { Tool, ToolResult } from "./registry"

interface MCPServerConfig {
  name: string
  url: string
  apiKey?: string
}

interface MCPToolDefinition {
  name: string
  description: string
  inputSchema: {
    type: string
    properties?: Record<string, { type?: unknown; description?: string }>
    required?: string[]
  }
}

const MCP_SCHEMA_TYPES = new Set(["string", "number", "integer", "boolean", "array", "object"])

export function mapMcpParamType(raw: unknown): "string" | "number" | "boolean" | "array" {
  if (typeof raw !== "string") return "string"
  const normalized = raw.trim().toLowerCase()
  if (!MCP_SCHEMA_TYPES.has(normalized)) return "string"
  if (normalized === "number" || normalized === "integer") return "number"
  if (normalized === "boolean") return "boolean"
  if (normalized === "array") return "array"
  return "string"
}

let mcpServers: MCPServerConfig[] = []
let mcpToolsRegistered = false

export function configureMCPServers(servers: MCPServerConfig[]): void {
  mcpServers = servers
  mcpToolsRegistered = false
}

async function fetchMCPTools(server: MCPServerConfig): Promise<MCPToolDefinition[]> {
  const response = await fetch(server.url.replace(/\/$/, "") + "/tools", {
    headers: {
      "Content-Type": "application/json",
      ...(server.apiKey ? { Authorization: `Bearer ${server.apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) {
    throw new Error(`MCP server ${server.name} returned HTTP ${response.status}`)
  }
  const body = (await response.json()) as { tools?: MCPToolDefinition[] }
  return body.tools ?? []
}

async function callMCPTool(server: MCPServerConfig, toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(server.url.replace(/\/$/, "") + "/call", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(server.apiKey ? { Authorization: `Bearer ${server.apiKey}` } : {}),
    },
    body: JSON.stringify({ name: toolName, arguments: args }),
    signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) {
    throw new Error(`MCP tool call failed: HTTP ${response.status}`)
  }
  return response.json()
}

export async function registerMCPTools(): Promise<number> {
  if (mcpToolsRegistered) return 0
  let count = 0

  for (const server of mcpServers) {
    try {
      const definitions = await fetchMCPTools(server)
      for (const def of definitions) {
        const tool: Tool = {
          name: `mcp_${server.name}_${def.name}`,
          description: `[MCP:${server.name}] ${def.description || def.name}`,
          parameters: Object.entries(def.inputSchema?.properties || {}).map(([key, val]) => ({
            name: key,
            type: mapMcpParamType((val as { type?: unknown }).type),
            description: (val as { description?: string }).description || "",
            required: def.inputSchema?.required?.includes(key) || false,
          })),
          async execute(params, _ctx): Promise<ToolResult> {
            try {
              const result = await callMCPTool(server, def.name, params)
              return {
                success: true,
                output: typeof result === "string" ? result : JSON.stringify(result, null, 2),
              }
            } catch (err) {
              return {
                success: false,
                output: "",
                error: err instanceof Error ? err.message : String(err),
              }
            }
          },
        }
        toolRegistry.register(tool)
        count++
      }
    } catch (err) {
      console.error(`Failed to connect to MCP server ${server.name}:`, err)
    }
  }

  mcpToolsRegistered = true
  return count
}

import { toolRegistry } from "../tools"
import type { Tool, ToolContext, ToolResult } from "../tools"

export interface MCPClientConfig {
  name: string
  url: string
  apiKey?: string
  enabled?: boolean
}

interface MCPToolDef {
  name: string
  description: string
  inputSchema: {
    type: string
    properties?: Record<string, { type: string; description?: string }>
    required?: string[]
  }
}

let clients: MCPClientConfig[] = []
let connected = false

export function configureMCPClients(configs: MCPClientConfig[]): void {
  clients = configs
  connected = false
}

export function getMCPClients(): MCPClientConfig[] {
  return [...clients]
}

async function discoverTools(client: MCPClientConfig): Promise<MCPToolDef[]> {
  const url = client.url.replace(/\/$/, "")
  const response = await fetch(`${url}/tools`, {
    headers: {
      "Content-Type": "application/json",
      ...(client.apiKey ? { Authorization: `Bearer ${client.apiKey}` } : {}),
    },
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`MCP ${client.name}: HTTP ${response.status}`)
  const body = (await response.json()) as { tools?: MCPToolDef[] }
  return body.tools ?? []
}

async function callTool(client: MCPClientConfig, toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const url = client.url.replace(/\/$/, "")
  const response = await fetch(`${url}/call`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(client.apiKey ? { Authorization: `Bearer ${client.apiKey}` } : {}),
    },
    body: JSON.stringify({ name: toolName, arguments: args }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`MCP tool call failed: HTTP ${response.status}`)
  return response.json()
}

export async function connectMCPClients(): Promise<number> {
  if (connected) return 0
  let total = 0

  for (const client of clients) {
    if (client.enabled === false) continue
    try {
      const tools = await discoverTools(client)
      for (const def of tools) {
        const tool: Tool = {
          name: `${client.name}_${def.name}`,
          description: `[MCP:${client.name}] ${def.description || def.name}`,
          parameters: Object.entries(def.inputSchema?.properties || {}).map(([key, val]) => ({
            name: key,
            type: ((val as { type?: string }).type === "string" ||
            (val as { type?: string }).type === "number" ||
            (val as { type?: string }).type === "boolean"
              ? (val as { type?: string }).type
              : "string") as "string" | "number" | "boolean" | "array",
            description: (val as { description?: string }).description || "",
            required: def.inputSchema?.required?.includes(key) || false,
          })),
          async execute(params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
            try {
              const result = await callTool(client, def.name, params)
              return {
                success: true,
                output: typeof result === "string" ? result : JSON.stringify(result, null, 2),
              }
            } catch (err: unknown) {
              return { success: false, output: "", error: err instanceof Error ? err.message : String(err) }
            }
          },
        }
        toolRegistry.register(tool)
        total++
      }
    } catch (err) {
      console.error(`Failed to connect MCP client "${client.name}":`, err)
    }
  }

  connected = true
  return total
}

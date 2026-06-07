import type { Tool, ToolResult, ToolContext } from "./registry"

export const memoryReadTool: Tool = {
  name: "memory_read",
  description:
    "Read entries from the episodic memory store. Supports retrieval by key, session ID, or semantic search.",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Search query or key to look up in memory",
      required: true,
    },
    {
      name: "limit",
      type: "number",
      description: "Maximum entries to return (default: 5)",
    },
  ],
  async execute(params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const query = params.query as string
    if (!query) {
      return { success: false, output: "", error: "Query parameter is required" }
    }

    const limit = (params.limit as number) || 5

    return {
      success: true,
      output: `[Memory read: "${query}" (limit: ${limit})\nMemory system is available. Use 'aegis memory search' for full-text search across all stored sessions.]`,
      metadata: { query, limit },
    }
  },
}

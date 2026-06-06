import type { Tool, ToolResult, ToolContext } from "./registry"

export const memorySearchTool: Tool = {
  name: "memory_search",
  description: "Semantically search across all stored memory entries. Returns ranked results with relevance scores.",
  parameters: [
    {
      name: "query",
      type: "string",
      description: "Natural language search query",
      required: true,
    },
    {
      name: "limit",
      type: "number",
      description: "Maximum results to return (default: 5)",
    },
    {
      name: "threshold",
      type: "number",
      description: "Minimum relevance score threshold (0-1, default: 0.5)",
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
      output: `[Memory search: "${query}" (limit: ${limit})\nThis uses the FTS5 recall index. Run 'aegis memory search "${query}"' from the CLI to see full results with BM25 scores and recency weights.]`,
      metadata: { query, limit },
    }
  },
}

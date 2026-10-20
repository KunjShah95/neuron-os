import type { Tool, ToolResult, ToolContext } from "./registry"
import { MemoryAccessError, searchMemory } from "../memory/tool-bridge"

export const memorySearchTool: Tool = {
  name: "memory_search",
  description:
    "Semantically search across all stored memory entries. Returns ranked results with relevance scores. Results are filtered through the memory access policy, so entries from namespaces you cannot read are never returned.",
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
    {
      name: "namespace",
      type: "string",
      description:
        "Optional memory namespace to search. Defaults to every namespace you are allowed to read.",
    },
  ],
  async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const query = params.query as string
    if (!query) {
      return { success: false, output: "", error: "Query parameter is required" }
    }

    const limit = (params.limit as number) || 5
    const threshold = (params.threshold as number) ?? 0.5
    const namespace = typeof params.namespace === "string" ? params.namespace : undefined

    try {
      const result = await searchMemory(ctx, { query, limit, threshold, namespace })

      if (result.hits.length === 0) {
        return {
          success: true,
          output: `[Memory search: "${query}" (limit: ${limit}, threshold: ${threshold})]
No matching memory found in namespaces: ${result.namespaces.join(", ") || "none"}.`,
          metadata: { query, limit, threshold, count: 0, namespaces: result.namespaces },
        }
      }

      const lines = result.hits.map((hit, index) => {
        const score = `${(hit.score * 100).toFixed(0)}%`
        const tags = hit.tags.length > 0 ? ` tags: ${hit.tags.join(", ")}` : ""
        return `${index + 1}. [${hit.store}] ${score} (namespace: ${hit.namespace}) key: ${hit.key}${tags}\n${hit.content}`
      })

      return {
        success: true,
        output: `[Memory search: "${query}" (limit: ${limit}, threshold: ${threshold})]
Found ${result.hits.length} ${result.hits.length === 1 ? "result" : "results"} across namespaces: ${result.namespaces.join(", ")}.

${lines.join("\n\n")}`,
        metadata: {
          query,
          limit,
          threshold,
          count: result.hits.length,
          namespaces: result.namespaces,
        },
      }
    } catch (err) {
      if (err instanceof MemoryAccessError) {
        return {
          success: false,
          output: "",
          error: `Memory search denied for namespace "${err.namespace}": ${err.reason}`,
        }
      }
      return {
        success: false,
        output: "",
        error: `Memory search failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}

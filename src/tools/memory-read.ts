import type { Tool, ToolResult, ToolContext } from "./registry"
import { MemoryAccessError, readMemoryEntries } from "../memory/tool-bridge"

export const memoryReadTool: Tool = {
  name: "memory_read",
  description:
    "Read entries from the episodic memory store. Supports retrieval by key, session ID, or semantic search. Reads are scoped to the caller's memory namespace unless an explicit grant allows another namespace.",
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
    {
      name: "namespace",
      type: "string",
      description:
        "Optional memory namespace to read from. Defaults to your own namespace. Another namespace is denied unless a grant exists.",
    },
  ],
  async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const query = params.query as string
    if (!query) {
      return { success: false, output: "", error: "Query parameter is required" }
    }

    const limit = (params.limit as number) || 5
    const namespace = typeof params.namespace === "string" ? params.namespace : undefined

    try {
      const result = await readMemoryEntries(ctx, { query, limit, namespace })

      if (result.hits.length === 0) {
        return {
          success: true,
          output: `[Memory read: "${query}" (limit: ${limit}) in namespace "${result.namespace}"]
No matching entries found.`,
          metadata: { query, limit, namespace: result.namespace, count: 0 },
        }
      }

      const lines = result.hits.map((hit, index) => {
        const tags = hit.tags.length > 0 ? ` tags: ${hit.tags.join(", ")}` : ""
        return `${index + 1}. [${hit.key}] (${hit.store})${tags}\n${hit.content}`
      })

      return {
        success: true,
        output: `[Memory read: "${query}" (limit: ${limit}) in namespace "${result.namespace}"]
Found ${result.hits.length} ${result.hits.length === 1 ? "entry" : "entries"}.

${lines.join("\n\n")}`,
        metadata: { query, limit, namespace: result.namespace, count: result.hits.length },
      }
    } catch (err) {
      if (err instanceof MemoryAccessError) {
        return {
          success: false,
          output: "",
          error: `Memory read denied for namespace "${err.namespace}": ${err.reason}`,
        }
      }
      return {
        success: false,
        output: "",
        error: `Memory read failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}

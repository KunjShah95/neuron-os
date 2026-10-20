import type { Tool, ToolResult, ToolContext } from "./registry"
import { MemoryAccessError, writeMemoryEntry } from "../memory/tool-bridge"

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const tags: string[] = []
  for (const item of raw) {
    if (typeof item !== "string") continue
    const tag = item.trim()
    if (tag.length > 0 && !tags.includes(tag)) tags.push(tag)
  }
  return tags
}

export const memoryWriteTool: Tool = {
  name: "memory_write",
  description:
    "Write or update an entry in the episodic memory store. Persists important facts, decisions, and context across sessions. Writes land in your own memory namespace by default; another namespace requires an explicit grant.",
  parameters: [
    {
      name: "key",
      type: "string",
      description: "Unique key or topic for the memory entry",
      required: true,
    },
    {
      name: "content",
      type: "string",
      description: "The content to store in memory",
      required: true,
    },
    {
      name: "tags",
      type: "array",
      description: "Optional tags for categorization (e.g. ['decision', 'config', 'architecture'])",
    },
    {
      name: "namespace",
      type: "string",
      description:
        "Optional target memory namespace. Defaults to your own namespace. Writing to another namespace is denied unless a grant exists.",
    },
  ],
  async execute(params: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const key = params.key as string
    const content = params.content as string

    if (!key || !content) {
      return { success: false, output: "", error: "Both 'key' and 'content' parameters are required" }
    }

    const tags = normalizeTags(params.tags)
    const namespace = typeof params.namespace === "string" ? params.namespace : undefined

    try {
      const result = await writeMemoryEntry(ctx, { key, content, tags, namespace })
      return {
        success: true,
        output: `[Memory written: "${result.key}" (${content.length} chars) in namespace "${result.namespace}"]
Stored ${result.stored} entry. Tags: ${result.tags.length > 0 ? result.tags.join(", ") : "none"}.
This entry is persisted and available via memory_read or memory_search.`,
        metadata: {
          key: result.key,
          contentLength: content.length,
          tags: result.tags,
          namespace: result.namespace,
          entryId: result.entryId,
        },
      }
    } catch (err) {
      if (err instanceof MemoryAccessError) {
        return {
          success: false,
          output: "",
          error: `Memory write denied for namespace "${err.namespace}": ${err.reason}`,
        }
      }
      return {
        success: false,
        output: "",
        error: `Memory write failed: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  },
}

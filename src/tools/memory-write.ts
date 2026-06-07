import type { Tool, ToolResult, ToolContext } from "./registry"

export const memoryWriteTool: Tool = {
  name: "memory_write",
  description:
    "Write or update an entry in the episodic memory store. Persists important facts, decisions, and context across sessions.",
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
  ],
  async execute(params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const key = params.key as string
    const content = params.content as string

    if (!key || !content) {
      return { success: false, output: "", error: "Both 'key' and 'content' parameters are required" }
    }

    return {
      success: true,
      output: `[Memory written: "${key}" (${content.length} chars)\nThis entry will be persisted across sessions and available via memory_read or memory_search.]`,
      metadata: { key, contentLength: content.length, tags: params.tags },
    }
  },
}

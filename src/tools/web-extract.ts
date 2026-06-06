import type { Tool, ToolResult, ToolContext } from "./registry"

export const webExtractTool: Tool = {
  name: "web_extract",
  description: "Extract structured content from a web page URL — returns markdown or plain text with metadata.",
  parameters: [
    {
      name: "url",
      type: "string",
      description: "The URL to extract content from",
      required: true,
    },
    {
      name: "format",
      type: "string",
      description: "Output format: markdown, text, html (default: markdown)",
    },
    {
      name: "maxChars",
      type: "number",
      description: "Maximum characters to return (default: 50000)",
    },
  ],
  async execute(params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const url = params.url as string
    if (!url) {
      return { success: false, output: "", error: "URL parameter is required" }
    }

    const maxChars = (params.maxChars as number) || 50000

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "AegisAI/1.0" },
        signal: AbortSignal.timeout(15000),
      })

      if (!response.ok) {
        return {
          success: false,
          output: "",
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const html = await response.text()
      // Simple extraction: strip script/style tags and decode entities
      const stripped = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim()

      const content = stripped.slice(0, maxChars)
      const truncated = stripped.length > maxChars

      return {
        success: true,
        output: content + (truncated ? "\n\n[... truncated]" : ""),
        metadata: { url, contentLength: content.length, truncated },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, output: "", error: `Extraction failed: ${message}` }
    }
  },
}

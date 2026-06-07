import type { Tool, ToolResult } from "./registry"

export const webFetchTool: Tool = {
  name: "web_fetch",
  description: "Fetch content from a URL and return it as text",
  parameters: [
    {
      name: "url",
      type: "string",
      description: "The URL to fetch content from",
      required: true,
    },
    {
      name: "format",
      type: "string",
      description: "Response format: text, markdown, or html (default: text)",
    },
    {
      name: "timeout",
      type: "number",
      description: "Timeout in milliseconds (default: 15000)",
    },
  ],
  async execute(params, _ctx): Promise<ToolResult> {
    const url = params.url as string
    if (!url) {
      return { success: false, output: "", error: "URL parameter is required" }
    }

    const timeout = (params.timeout as number) || 15000

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "AegisAI/1.0" },
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        return {
          success: false,
          output: "",
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const contentType = response.headers.get("content-type") || ""
      let content: string

      if (
        contentType.includes("text") ||
        contentType.includes("json") ||
        contentType.includes("xml") ||
        contentType.includes("html")
      ) {
        content = await response.text()
      } else {
        const buffer = await response.arrayBuffer()
        content = `[Binary content: ${buffer.byteLength} bytes, type: ${contentType}]`
      }

      const format = (params.format as string) || "text"
      if (format === "html") {
        content = `<!DOCTYPE html>\n<html>\n<head>\n  <title>${url}</title>\n</head>\n<body>\n${content}\n</body>\n</html>`
      }

      return {
        success: true,
        output: content,
        metadata: {
          url,
          status: response.status,
          contentType,
          contentLength: content.length,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes("abort")) {
        return { success: false, output: "", error: `Request timed out after ${timeout}ms` }
      }
      return { success: false, output: "", error: message }
    }
  },
}

import type { Tool, ToolResult, ToolContext } from "./registry"

export const visionAnalyzeTool: Tool = {
  name: "vision_analyze",
  description: "Analyze an image from a URL or local file path — returns a text description of its contents.",
  parameters: [
    {
      name: "source",
      type: "string",
      description: "URL or local file path of the image to analyze",
      required: true,
    },
    {
      name: "question",
      type: "string",
      description: "Optional specific question about the image content",
    },
  ],
  async execute(params: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const source = params.source as string
    if (!source) {
      return { success: false, output: "", error: "Source parameter is required" }
    }

    return {
      success: true,
      output: `[Vision analysis of "${source.slice(0, 100)}" requires a multimodal AI provider (e.g. Anthropic, OpenAI). Configure via AEGIS_AI_PROVIDER.${params.question ? `\nQuestion: ${params.question}` : ""}]`,
      metadata: { source, pendingProvider: true },
    }
  },
}

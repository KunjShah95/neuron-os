import { describe, expect, it } from "bun:test"
import { generateText, jsonSchema } from "ai"
import { MockLanguageModelV3 } from "ai/test"

interface CapturedTool {
  name: string
  description?: string
  inputSchema?: { properties?: Record<string, unknown>; required?: string[] }
}

async function captureTools(toolDef: Record<string, unknown>): Promise<CapturedTool[]> {
  const captured: CapturedTool[] = []
  const model = new MockLanguageModelV3({
    doGenerate: async ({ tools }: { tools?: CapturedTool[] }) => {
      captured.push(...(tools ?? []))
      return {
        content: [{ type: "text", text: "ok" }],
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        warnings: [],
      }
    },
  })
  await generateText({ model, prompt: "hi", tools: toolDef as never })
  return captured
}

describe("AI SDK tool schema wiring", () => {
  it("sends the tool parameter schema to the model (not an empty schema)", async () => {
    const schema = {
      type: "object",
      properties: { path: { type: "string", description: "file path" } },
      required: ["path"],
    }

    const tools = await captureTools({
      mytool: {
        description: "does a thing",
        inputSchema: jsonSchema(schema as never),
        execute: async () => "ok",
      },
    })

    expect(tools.length).toBe(1)
    expect(tools[0]!.name).toBe("mytool")
    expect(tools[0]!.inputSchema?.properties).toBeDefined()
    expect(Object.keys(tools[0]!.inputSchema?.properties ?? {})).toEqual(["path"])
    expect(tools[0]!.inputSchema?.required).toEqual(["path"])
  })

  it("reproduces the v5 'parameters' field problem: the model gets an empty schema", async () => {
    const schema = {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    }

    const tools = await captureTools({
      legacy: {
        description: "legacy",
        parameters: jsonSchema(schema as never),
        execute: async () => "ok",
      },
    })

    expect(tools[0]!.inputSchema?.properties).toEqual({})
  })
})

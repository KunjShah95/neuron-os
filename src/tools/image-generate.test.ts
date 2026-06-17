/**
 * Image generation tool tests — parameter validation only (no API keys required).
 * Tests that fail fast without making any actual API calls.
 */

import { describe, it, expect } from "bun:test"
import { imageGenerateTool } from "./image-generate"
import { toolRegistry } from "./registry"

if (!toolRegistry.get("image_generate")) {
  toolRegistry.register(imageGenerateTool)
}

const mockCtx = {
  agentId: "test-img-gen",
  cwd: process.cwd(),
  permissions: [{ name: "image_generate", allow: true }],
}

describe("Image Generate Tool — registration & validation", () => {
  it("should be registered with correct metadata", () => {
    const tool = toolRegistry.get("image_generate")
    expect(tool).toBeDefined()
    expect(tool!.name).toBe("image_generate")
    expect(tool!.parameters.length).toBe(4)
  })

  it("should have the required 'prompt' parameter", () => {
    const promptParam = imageGenerateTool.parameters.find((p) => p.name === "prompt")
    expect(promptParam).toBeDefined()
    expect(promptParam!.required).toBe(true)
    expect(promptParam!.type).toBe("string")
  })

  it("should have size parameter with default", () => {
    const sizeParam = imageGenerateTool.parameters.find((p) => p.name === "size")
    expect(sizeParam).toBeDefined()
    expect(sizeParam!.required).toBe(false)
  })

  it("should have num_images parameter with default", () => {
    const numParam = imageGenerateTool.parameters.find((p) => p.name === "num_images")
    expect(numParam).toBeDefined()
    expect(numParam!.required).toBe(false)
    expect(numParam!.type).toBe("number")
  })

  it("should reject empty prompt", async () => {
    const result = await imageGenerateTool.execute({ prompt: "" }, mockCtx)
    expect(result.success).toBe(false)
    expect(result.error).toContain("prompt is required")
  })

  it("should reject missing prompt", async () => {
    const result = await imageGenerateTool.execute({}, mockCtx)
    expect(result.success).toBe(false)
    expect(result.error).toContain("prompt is required")
  })

  it("should return 'no key' error when no API key is configured", async () => {
    // Save original env
    const origFal = process.env.FAL_KEY
    const origRepl = process.env.REPLICATE_API_TOKEN
    const origStab = process.env.STABILITY_API_KEY

    // Clear them
    delete process.env.FAL_KEY
    delete process.env.REPLICATE_API_TOKEN
    delete process.env.STABILITY_API_KEY

    const result = await imageGenerateTool.execute(
      { prompt: "a cat" },
      mockCtx,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain("No image generation API key configured")

    // Restore env
    if (origFal) process.env.FAL_KEY = origFal
    if (origRepl) process.env.REPLICATE_API_TOKEN = origRepl
    if (origStab) process.env.STABILITY_API_KEY = origStab
  })

  it("should reject unknown backend", async () => {
    // Set a fake key so it passes the 'no key configured' check
    process.env.FAL_KEY = "test-key-for-validation"

    const result = await imageGenerateTool.execute(
      { prompt: "a cat", backend: "nonexistent_backend_xyz" },
      mockCtx,
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain("Unknown backend")

    // Clean up
    delete process.env.FAL_KEY
  })

  it("should default size to 1024x1024 when not specified", () => {
    const sizeParam = imageGenerateTool.parameters.find((p) => p.name === "size")
    expect(sizeParam).toBeDefined()
    expect(sizeParam!.required).toBe(false)
  })

  it("should clamp num_images to 1-4 range", () => {
    const numParam = imageGenerateTool.parameters.find((p) => p.name === "num_images")
    expect(numParam).toBeDefined()
    expect(numParam!.type).toBe("number")
  })
})

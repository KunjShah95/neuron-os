/**
 * image_generate — AI image generation tool.
 *
 * Supports multiple backends with auto-detection:
 *   - FAL.ai (FAL_KEY) — primary, same backend Hermes uses
 *   - Replicate (REPLICATE_API_TOKEN)
 *   - Stability AI (STABILITY_API_KEY)
 *
 * Follows the same multi-backend pattern as web_search.ts.
 */

import type { Tool, ToolResult } from "./registry"

// ── Backend detection ────────────────────────────────────────────────

type ImageBackend = "fal" | "replicate" | "stability" | "none"

function detectBackend(): ImageBackend {
  if (process.env.FAL_KEY) return "fal"
  if (process.env.REPLICATE_API_TOKEN) return "replicate"
  if (process.env.STABILITY_API_KEY) return "stability"
  return "none"
}

// ── FAL.ai backend ───────────────────────────────────────────────────

async function generateFal(
  prompt: string,
  size: string,
  numImages: number,
): Promise<ToolResult> {
  const apiKey = process.env.FAL_KEY ?? ""

  // Map size string to FAL dimensions
  const sizes: Record<string, { width: number; height: number }> = {
    "256x256": { width: 256, height: 256 },
    "512x512": { width: 512, height: 512 },
    "1024x1024": { width: 1024, height: 1024 },
    "1024x768": { width: 1024, height: 768 },
    "768x1024": { width: 768, height: 1024 },
    "1280x720": { width: 1280, height: 720 },
    "720x1280": { width: 720, height: 1280 },
  }
  const dims = sizes[size] ?? { width: 1024, height: 1024 }

  try {
    // FAL fast-sdxl endpoint
    const res = await fetch("https://fal.run/fal-ai/fast-sdxl", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${apiKey}`,
      },
      body: JSON.stringify({
        prompt,
        image_size: `${dims.width}x${dims.height}`,
        num_images: Math.min(numImages, 4),
        sync_mode: true,
      }),
      signal: AbortSignal.timeout(60000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        success: false,
        output: "",
        error: `FAL.ai returned HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      }
    }

    const body = (await res.json()) as {
      images?: { url?: string }[]
      detail?: string
    }

    if (!body.images || body.images.length === 0) {
      return {
        success: false,
        output: "",
        error: body.detail || "FAL.ai returned no images",
      }
    }

    const imageUrls = body.images.map((img) => img.url ?? "").filter(Boolean)
    if (imageUrls.length === 0) {
      return { success: false, output: "", error: "FAL.ai returned images with no URLs" }
    }

    return {
      success: true,
      output: imageUrls.join("\n"),
      metadata: {
        count: imageUrls.length,
        backend: "fal",
        model: "fast-sdxl",
        size,
        urls: imageUrls,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, output: "", error: `FAL.ai failed: ${message}` }
  }
}

// ── Replicate backend ────────────────────────────────────────────────

async function generateReplicate(
  prompt: string,
  size: string,
  numImages: number,
): Promise<ToolResult> {
  const apiToken = process.env.REPLICATE_API_TOKEN ?? ""

  const sizes: Record<string, { width: number; height: number }> = {
    "256x256": { width: 256, height: 256 },
    "512x512": { width: 512, height: 512 },
    "1024x1024": { width: 1024, height: 1024 },
    "1024x768": { width: 1024, height: 768 },
    "768x1024": { width: 768, height: 1024 },
    "1280x720": { width: 1280, height: 720 },
    "720x1280": { width: 720, height: 1280 },
  }
  const dims = sizes[size] ?? { width: 1024, height: 1024 }

  try {
    // Use stability-ai/sdxl (model version from https://replicate.com/stability-ai/sdxl/versions)
    const createRes = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        version:
          "2b017d9b67edd2ee1401238df49e75f70c8a4d5e0a46a1c6cbbfcc9b0e7bf5c2",
        input: {
          prompt,
          width: dims.width,
          height: dims.height,
          num_outputs: Math.min(numImages, 4),
        },
      }),
      signal: AbortSignal.timeout(15000),
    })

    if (!createRes.ok) {
      const text = await createRes.text().catch(() => "")
      return {
        success: false,
        output: "",
        error: `Replicate creation returned HTTP ${createRes.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      }
    }

    const prediction = (await createRes.json()) as {
      id: string
      status: string
      output?: string[] | null
      error?: string | null
    }

    // Poll for completion
    const maxPolls = 30
    for (let i = 0; i < maxPolls; i++) {
      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        {
          headers: { Authorization: `Bearer ${apiToken}` },
          signal: AbortSignal.timeout(10000),
        },
      )

      if (!pollRes.ok) {
        return {
          success: false,
          output: "",
          error: `Replicate polling returned HTTP ${pollRes.status}`,
        }
      }

      const pollData = (await pollRes.json()) as {
        status: string
        output?: string[] | null
        error?: string | null
      }

      if (pollData.status === "succeeded" && pollData.output) {
        const urls = pollData.output
        return {
          success: true,
          output: urls.join("\n"),
          metadata: {
            count: urls.length,
            backend: "replicate",
            model: "stability-ai/sdxl",
            size,
            urls,
          },
        }
      }

      if (pollData.status === "failed") {
        return {
          success: false,
          output: "",
          error: `Replicate prediction failed: ${pollData.error || "unknown error"}`,
        }
      }

      // Wait 2 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    return {
      success: false,
      output: "",
      error: "Replicate prediction timed out after 60 seconds",
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, output: "", error: `Replicate failed: ${message}` }
  }
}

// ── Stability AI backend ─────────────────────────────────────────────

async function generateStability(
  prompt: string,
  size: string,
  _numImages: number,
): Promise<ToolResult> {
  const apiKey = process.env.STABILITY_API_KEY ?? ""

  const sizes: Record<string, string> = {
    "256x256": "256x256",
    "512x512": "512x512",
    "1024x1024": "1024x1024",
    "1024x768": "1024x768" as const,
    "768x1024": "768x1024" as const,
    "1280x720": "1280x720" as const,
    "720x1280": "720x1280" as const,
  }
  const aspectRatio = sizes[size] ?? "1024x1024"

  try {
    const formData = new URLSearchParams()
    formData.append("prompt", prompt)
    formData.append("output_format", "png")
    formData.append("aspect_ratio", aspectRatio)

    const res = await fetch(
      "https://api.stability.ai/v2beta/stable-image/generate/sd3",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "image/*",
        },
        body: formData.toString(),
        signal: AbortSignal.timeout(60000),
      },
    )

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return {
        success: false,
        output: "",
        error: `Stability AI returned HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
      }
    }

    const imageBuffer = await res.arrayBuffer()
    const base64 = Buffer.from(imageBuffer).toString("base64")
    const dataUrl = `data:image/png;base64,${base64}`

    return {
      success: true,
      output: dataUrl,
      metadata: {
        count: 1,
        backend: "stability",
        model: "sd3",
        size,
        format: "png",
        sizeBytes: imageBuffer.byteLength,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { success: false, output: "", error: `Stability AI failed: ${message}` }
  }
}

// ── Tool export ──────────────────────────────────────────────────────

export const imageGenerateTool: Tool = {
  name: "image_generate",
  description:
    "Generate an image from a text description. Supports FAL.ai (FAL_KEY, default), Replicate (REPLICATE_API_TOKEN), and Stability AI (STABILITY_API_KEY) backends. Returns image URLs (FAL/Replicate) or a base64 data URL (Stability).",
  parameters: [
    {
      name: "prompt",
      type: "string",
      description: "Text description of the image to generate",
      required: true,
    },
    {
      name: "size",
      type: "string",
      description:
        "Image size: 256x256, 512x512, 1024x1024, 1024x768, 768x1024, 1280x720, 720x1280 (default: 1024x1024)",
      required: false,
    },
    {
      name: "num_images",
      type: "number",
      description: "Number of images to generate (1-4, default: 1). Replicate supports up to 4.",
      required: false,
    },
    {
      name: "backend",
      type: "string",
      description:
        "Force a specific backend: fal, replicate, stability (default: auto-detect from env vars)",
      required: false,
    },
  ],

  async execute(params, _ctx): Promise<ToolResult> {
    const prompt = params.prompt as string
    if (!prompt) {
      return { success: false, output: "", error: "prompt is required" }
    }

    const size = (params.size as string) || "1024x1024"
    const numImages = Math.min(Math.max(1, (params.num_images as number) || 1), 4)
    const forcedBackend = params.backend as ImageBackend | undefined

    const backend = forcedBackend || detectBackend()

    if (backend === "none") {
      return {
        success: false,
        output: "",
        error:
          "No image generation API key configured. Set one of: FAL_KEY, REPLICATE_API_TOKEN, or STABILITY_API_KEY",
      }
    }

    try {
      switch (backend) {
        case "fal":
          return await generateFal(prompt, size, numImages)
        case "replicate":
          return await generateReplicate(prompt, size, numImages)
        case "stability":
          return await generateStability(prompt, size, numImages)
        default:
          return {
            success: false,
            output: "",
            error: `Unknown backend: ${backend}`,
          }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, output: "", error: `Image generation failed: ${message}` }
    }
  },
}

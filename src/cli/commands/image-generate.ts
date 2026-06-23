/**
 * image-generate — CLI command for AI image generation.
 *
 * Usage: aegis image-generate --prompt "cat in space" [--size 1024x1024] [--count 2] [--backend fal]
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { toolRegistry } from "../../tools"

export function registerImageGenerate(program: Command) {
  program
    .command("image-generate")
    .alias("img")
    .alias("imggen")
    .description("Generate an image from a text prompt using AI (FAL/Replicate/Stability)")
    .requiredOption("-p, --prompt <text>", "Text description of the image to generate")
    .option("-s, --size <size>", "Image size (256x256, 512x512, 1024x1024, 1024x768, 768x1024, 1280x720, 720x1280)", "1024x1024")
    .option("-n, --count <n>", "Number of images (1-4)", "1")
    .option("-b, --backend <backend>", "Force specific backend (fal, replicate, stability)")
    .option("--save <path>", "Save image to file (Stability AI only, saves base64 to PNG)")
    .option("--open", "Open the first image URL in the browser", false)
    .action(handleImageGenerate)
}

async function handleImageGenerate(opts: {
  prompt: string
  size?: string
  count?: string
  backend?: string
  save?: string
  open?: boolean
}) {
  const tool = toolRegistry.get("image_generate")
  if (!tool) {
    console.log(theme.error("  Image generation tool not registered."))
    process.exit(1)
  }

  showBanner()
  console.log()

  const params: Record<string, unknown> = {
    prompt: opts.prompt,
    size: opts.size || "1024x1024",
    num_images: Math.min(Math.max(1, parseInt(opts.count || "1", 10)), 4),
  }
  if (opts.backend) params.backend = opts.backend

  const ctx = {
    agentId: "cli-image-gen",
    cwd: process.cwd(),
    permissions: [{ name: "image_generate", allow: true }],
  }

  console.log(`  ${theme.info("Generating image...")}`)
  console.log(`  ${theme.muted(`Prompt: ${opts.prompt.slice(0, 100)}${opts.prompt.length > 100 ? "..." : ""}`)}`)
  console.log(`  ${theme.muted(`Size: ${params.size} · Count: ${params.num_images}${opts.backend ? ` · Backend: ${opts.backend}` : ""}`)}`)
  console.log()

  const startTime = Date.now()
  const result = await tool.execute(params, ctx)
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  if (!result.success) {
    console.log(`  ${theme.error(`✗ Generation failed (${elapsed}s): ${result.error}`)}`)
    process.exit(1)
  }

  const metadata = result.metadata as Record<string, unknown> | undefined
  const count = (metadata?.count as number) || 1
  const backend = (metadata?.backend as string) || "unknown"

  console.log(`  ${theme.success(`✓ Generated ${count} image(s) using ${backend} (${elapsed}s)`)}`)
  console.log()

  if (metadata?.urls) {
    const urls = metadata.urls as string[]
    for (let i = 0; i < urls.length; i++) {
      console.log(`  ${theme.bold(`Image ${i + 1}:`)} ${theme.info(urls[i]!)}`)
    }
  } else if (result.output.startsWith("data:image")) {
    // Base64 data URL from Stability AI
    console.log(`  ${theme.muted("Image received as base64 data URL.")}`)
    if (opts.save) {
      const { writeFileSync } = await import("node:fs")
      const b64 = result.output.replace(/^data:image\/\w+;base64,/, "")
      writeFileSync(opts.save, Buffer.from(b64, "base64"))
      console.log(`  ${theme.success(`✓ Saved to ${opts.save}`)}`)
    }
  } else {
    const lines = result.output.split("\n").filter(Boolean)
    for (let i = 0; i < lines.length; i++) {
      console.log(`  ${theme.bold(`Image ${i + 1}:`)} ${theme.info(lines[i]!)}`)
    }
  }

  console.log()
  if (opts.open && metadata?.urls) {
    const urls = metadata.urls as string[]
    if (urls[0]) {
      const { execSync } = await import("node:child_process")
      const platform = process.platform
      try {
        if (platform === "darwin") execSync(`open "${urls[0]}"`, { timeout: 5000 })
        else if (platform === "win32") execSync(`start "" "${urls[0]}"`, { timeout: 5000, shell: true })
        else execSync(`xdg-open "${urls[0]}"`, { timeout: 5000 })
        console.log(`  ${theme.muted("Opened in browser.")}`)
      } catch {
        console.log(`  ${theme.muted("Could not open browser automatically.")}`)
      }
    }
  }
}

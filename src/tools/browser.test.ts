/**
 * Browser automation tool tests.
 *
 * Validation tests (parameter checking) run without launching a browser.
 * Browser-based tests check if Playwright/Chromium is available and skip
 * gracefully if not (e.g., on systems where Windows Defender blocks launch).
 *
 * Each browser test uses a unique agentId so tests don't interfere
 * when run in parallel.
 */

import { describe, it, expect, beforeAll } from "bun:test"
import { browserTool } from "./browser"
import { toolRegistry } from "./registry"

// Register the tool if not already registered
if (!toolRegistry.get("browser")) {
  toolRegistry.register(browserTool)
}

// ── Helpers ──────────────────────────────────────────────────────────

function makeCtx(sessionId: string) {
  return {
    agentId: sessionId,
    cwd: process.cwd(),
    permissions: [{ name: "browser", allow: true }],
  }
}

/** Check if Playwright can launch a browser on this system */
async function isBrowserAvailable(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright")
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox"],
      timeout: 15000, // Quick check
    })
    await browser.close()
    return true
  } catch {
    return false
  }
}

let browserAvailable = false

beforeAll(async () => {
  try {
    const { existsSync } = await import("node:fs")
    const { join } = await import("node:path")
    const { homedir } = await import("node:os")
    const { readdirSync } = await import("node:fs")
    const base = join(homedir(), "AppData", "Local", "ms-playwright")
    const entries = readdirSync(base)
    browserAvailable = entries.some((e) => e.startsWith("chromium-") && !e.includes("headless"))
  } catch {
    browserAvailable = false
  }

  if (!browserAvailable) {
    console.warn("⚠ Chromium not found — skipping live browser tests. Install with: bunx playwright install chromium")
  }
})

// ── Static tests (no browser launch needed) ──────────────────────────

describe("Browser Tool — parameter validation", () => {
  it("should be registered with correct metadata", () => {
    const tool = toolRegistry.get("browser")
    expect(tool).toBeDefined()
    expect(tool!.name).toBe("browser")
    expect(tool!.parameters.length).toBeGreaterThanOrEqual(9)
  })

  it("should have the required 'action' parameter", () => {
    const actionParam = browserTool.parameters.find((p) => p.name === "action")
    expect(actionParam).toBeDefined()
    expect(actionParam!.required).toBe(true)
    expect(actionParam!.type).toBe("string")
  })

  it("should reject unknown action (no browser needed)", async () => {
    const result = await browserTool.execute(
      { action: "nonexistent_action_xyz" },
      makeCtx("test-param-unknown"),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("Unknown browser action")
  })

  it("should reject navigate without url (no browser needed)", async () => {
    const result = await browserTool.execute(
      { action: "navigate" },
      makeCtx("test-param-no-url"),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("url is required")
  })

  it("should reject click without selector or coordinate (no browser needed)", async () => {
    const result = await browserTool.execute(
      { action: "click" },
      makeCtx("test-param-no-click"),
    )
    expect(result.success).toBe(false)
    // Validation happens before browser launch, so this is fast
    expect(result.error).toContain("selector or coordinate is required")
  })

  it("should reject type without text (no browser needed)", async () => {
    const result = await browserTool.execute(
      { action: "type" },
      makeCtx("test-param-no-type"),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("text is required")
  })

  it("should reject evaluate without code (no browser needed)", async () => {
    const result = await browserTool.execute(
      { action: "evaluate" },
      makeCtx("test-param-no-eval"),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain("text parameter is required")
  })
})

// ── Browser-based tests (skip if browser unavailable) ────────────────

describe("Browser Tool — live browser interaction", () => {
  it("should navigate to a URL and return metadata", async () => {
    if (!browserAvailable) return // Skip gracefully

    const ctx = makeCtx("test-live-nav")
    const result = await browserTool.execute(
      { action: "navigate", url: "https://example.com", timeout: 30000 },
      ctx,
    )
    expect(result.success).toBe(true)
    expect(result.output).toContain("Example Domain")
    expect(result.metadata?.title).toBe("Example Domain")
    expect(result.metadata?.url).toBe("https://example.com/")

    // Cleanup
    await browserTool.execute({ action: "close" }, ctx)
  })

  it("should get page HTML after navigation", async () => {
    if (!browserAvailable) return

    const ctx = makeCtx("test-live-html")
    await browserTool.execute(
      { action: "navigate", url: "https://example.com", timeout: 30000 },
      ctx,
    )
    const result = await browserTool.execute({ action: "get_html" }, ctx)
    expect(result.success).toBe(true)
    expect(result.output).toContain("Example Domain")
    expect((result.metadata?.length as number) > 100).toBe(true)
    await browserTool.execute({ action: "close" }, ctx)
  })

  it("should get HTML for a specific selector", async () => {
    if (!browserAvailable) return

    const ctx = makeCtx("test-live-selector")
    await browserTool.execute(
      { action: "navigate", url: "https://example.com", timeout: 30000 },
      ctx,
    )
    const result = await browserTool.execute(
      { action: "get_html", selector: "h1" },
      ctx,
    )
    expect(result.success).toBe(true)
    expect(result.output).toContain("Example Domain")
    await browserTool.execute({ action: "close" }, ctx)
  })

  it("should take a screenshot and return base64 PNG", async () => {
    if (!browserAvailable) return

    const ctx = makeCtx("test-live-ss")
    await browserTool.execute(
      { action: "navigate", url: "https://example.com", timeout: 30000 },
      ctx,
    )
    const result = await browserTool.execute(
      { action: "screenshot", full_page: false },
      ctx,
    )
    expect(result.success).toBe(true)
    expect(result.output).toContain("data:image/png;base64,")
    expect(result.metadata?.format).toBe("png")
    expect((result.metadata?.sizeBytes as number) > 0).toBe(true)
    await browserTool.execute({ action: "close" }, ctx)
  })

  it("should get a page snapshot with title and visible text", async () => {
    if (!browserAvailable) return

    const ctx = makeCtx("test-live-snap")
    await browserTool.execute(
      { action: "navigate", url: "https://example.com", timeout: 30000 },
      ctx,
    )
    const result = await browserTool.execute({ action: "snapshot" }, ctx)
    expect(result.success).toBe(true)
    expect(result.output).toContain("Example Domain")
    expect(result.metadata?.title).toBe("Example Domain")
    expect((result.metadata?.visibleTextLength as number) > 0).toBe(true)
    await browserTool.execute({ action: "close" }, ctx)
  })

  it("should evaluate JavaScript in page context", async () => {
    if (!browserAvailable) return

    const ctx = makeCtx("test-live-eval")
    await browserTool.execute(
      { action: "navigate", url: "https://example.com", timeout: 30000 },
      ctx,
    )
    const result = await browserTool.execute(
      { action: "evaluate", text: "document.title" },
      ctx,
    )
    expect(result.success).toBe(true)
    expect(result.output).toContain("Example Domain")
    await browserTool.execute({ action: "close" }, ctx)
  })

  it("should scroll the page", async () => {
    if (!browserAvailable) return

    const ctx = makeCtx("test-live-scroll")
    await browserTool.execute(
      { action: "navigate", url: "https://example.com", timeout: 30000 },
      ctx,
    )
    const result = await browserTool.execute(
      { action: "scroll", scroll_y: 500 },
      ctx,
    )
    expect(result.success).toBe(true)
    expect(result.output).toContain("Scrolled by (0, 500)")
    await browserTool.execute({ action: "close" }, ctx)
  })

  it("should support close action", async () => {
    if (!browserAvailable) return

    const ctx = makeCtx("test-live-close")
    await browserTool.execute(
      { action: "navigate", url: "https://example.com", timeout: 30000 },
      ctx,
    )
    const result = await browserTool.execute({ action: "close" }, ctx)
    expect(result.success).toBe(true)
    expect(result.output).toContain("closed")
  })
})

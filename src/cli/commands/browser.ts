/**
 * browser — Browser automation CLI command.
 *
 * Provides `aegis browser` for status and a quick interactive browser session.
 * The browser tool itself is available to agents via the tool registry.
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { toolRegistry } from "../../tools"

export function registerBrowser(program: Command) {
  program
    .command("browser")
    .alias("br")
    .description("Browser automation — manage browser sessions, open URLs, take screenshots")
    .option("-u, --url <url>", "URL to navigate to")
    .option("-s, --screenshot [path]", "Take a screenshot and save to file (optional path, default: screenshot.png)")
    .option("--html [selector]", "Get page HTML (optional CSS selector)")
    .option("--console", "Get browser console logs")
    .option("--snapshot", "Get page text snapshot (title + visible text)")
    .option("--close", "Close the browser session")
    .action(handleBrowser)
}

async function handleBrowser(opts: {
  url?: string
  screenshot?: string | boolean
  html?: string | boolean
  console?: boolean
  snapshot?: boolean
  close?: boolean
}) {
  const tool = toolRegistry.get("browser")
  if (!tool) {
    console.log(theme.error("  Browser tool not registered."))
    process.exit(1)
  }

  showBanner()
  console.log()

  // If just status (no actions), show info
  if (!opts.url && !opts.screenshot && !opts.html && !opts.console && !opts.snapshot && !opts.close) {
    console.log(`  ${theme.success("● Browser automation available")}`)
    console.log()
    console.log(`  ${theme.heading("Actions")}`)
    console.log(`  ${theme.dim("navigate     — open a URL in the browser")}`)
    console.log(`  ${theme.dim("click        — click an element by CSS selector or coordinate")}`)
    console.log(`  ${theme.dim("type         — type text into an input field")}`)
    console.log(`  ${theme.dim("screenshot   — take a viewport or full-page screenshot")}`)
    console.log(`  ${theme.dim("scroll       — scroll the page horizontally or vertically")}`)
    console.log(`  ${theme.dim("evaluate     — run JavaScript code in the page context")}`)
    console.log(`  ${theme.dim("get_html     — get the page or element HTML content")}`)
    console.log(`  ${theme.dim("get_console  — retrieve collected browser console logs")}`)
    console.log(`  ${theme.dim("snapshot     — get title and visible text of the page")}`)
    console.log(`  ${theme.dim("close        — close the browser session")}`)
    console.log()
    console.log(`  ${theme.muted("Browser sessions persist across calls — agents can browse multiple pages")}`)
    console.log(`  ${theme.muted("Available to: build and debug agent types by default")}`)
    console.log()
    console.log(`  ${theme.muted("Examples:")}`)
    console.log(`  ${theme.muted("  aegis browser --url https://example.com")}`)
    console.log(`  ${theme.muted("  aegis browser --url https://example.com --screenshot")}`)
    console.log(`  ${theme.muted("  aegis browser --snapshot")}`)
    console.log(`  ${theme.muted("  aegis browser --console")}`)
    console.log(`  ${theme.muted("  aegis browser --close")}`)
    console.log()
    return
  }

  // Execute the requested action
  const ctx = {
    agentId: "cli-browser",
    cwd: process.cwd(),
    permissions: [{ name: "browser", allow: true }],
  }

  try {
    // Navigate to URL
    if (opts.url) {
      const navResult = await tool.execute({ action: "navigate", url: opts.url }, ctx)
      if (!navResult.success) {
        console.log(`  ${theme.error(`Navigation failed: ${navResult.error}`)}`)
        process.exit(1)
      }
      console.log(`  ${theme.success("✓ " + navResult.output)}`)
      console.log()
    }

    // Take screenshot
    if (opts.screenshot) {
      const ssResult = await tool.execute({ action: "screenshot", full_page: true }, ctx)
      if (!ssResult.success) {
        console.log(`  ${theme.error(`Screenshot failed: ${ssResult.error}`)}`)
        process.exit(1)
      }

      const savePath = typeof opts.screenshot === "string" ? opts.screenshot : "screenshot.png"
      const { writeFileSync } = await import("node:fs")
      const b64 = ssResult.output.replace(/^data:image\/png;base64,/, "")
      writeFileSync(savePath, Buffer.from(b64, "base64"))
      console.log(`  ${theme.success(`✓ Screenshot saved to ${savePath}`)}`)
      console.log()
    }

    // Get HTML
    if (opts.html) {
      const selector = typeof opts.html === "string" ? opts.html : undefined
      const htmlResult = await tool.execute({ action: "get_html", selector }, ctx)
      if (!htmlResult.success) {
        console.log(`  ${theme.error(`Failed to get HTML: ${htmlResult.error}`)}`)
        process.exit(1)
      }
      console.log(`  ${theme.heading("Page HTML:")}`)
      console.log(`  ${htmlResult.output.slice(0, 5000)}`)
      if (htmlResult.output.length > 5000) {
        console.log(`  ${theme.muted(`… [truncated, ${htmlResult.output.length - 5000} more chars]`)}`)
      }
      console.log()
    }

    // Get console logs
    if (opts.console) {
      const consoleResult = await tool.execute({ action: "get_console" }, ctx)
      console.log(`  ${theme.heading("Browser Console:")}`)
      console.log(`  ${consoleResult.output}`)
      console.log()
    }

    // Get snapshot
    if (opts.snapshot) {
      const snapResult = await tool.execute({ action: "snapshot" }, ctx)
      if (!snapResult.success) {
        console.log(`  ${theme.error(`Snapshot failed: ${snapResult.error}`)}`)
        process.exit(1)
      }
      console.log(`  ${theme.heading("Page Snapshot:")}`)
      for (const line of snapResult.output.split("\n")) {
        console.log(`  ${line}`)
      }
      console.log()
    }

    // Close browser
    if (opts.close) {
      const closeResult = await tool.execute({ action: "close" }, ctx)
      console.log(`  ${theme.muted(closeResult.output)}`)
      console.log()
    }
  } catch (err) {
    console.log(`  ${theme.error(`Browser error: ${err instanceof Error ? err.message : String(err)}`)}`)
    process.exit(1)
  }
}

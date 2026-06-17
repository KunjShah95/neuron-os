/**
 * browser — Full browser automation tool using Playwright.
 *
 * Manages a persistent Chromium browser context per agent session.
 * Supports: navigate, click, type, screenshot, scroll, evaluate JS,
 * get HTML, get console logs, and close.
 *
 * Inspired by Hermes Agent's browser capability set.
 */

import type { Tool, ToolResult } from "./registry"
import { chromium, type Browser, type BrowserContext, type Page } from "playwright"
import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

// ── Constants ────────────────────────────────────────────────────────

/** Max concurrent browser sessions */
const MAX_SESSIONS = 20
/** Session idle TTL in ms (30 minutes) */
const SESSION_TTL_MS = 30 * 60 * 1000

/**
 * Try to find the Playwright Chromium executable.
 * Falls back to Playwright default discovery.
 */
function findChromiumExecutable(): string | undefined {
  // Common Playwright browser install locations
  const candidates = [
    join(homedir(), "AppData", "Local", "ms-playwright"),
    join(homedir(), ".cache", "ms-playwright"),
    "/root/.cache/ms-playwright",
    join(homedir(), ".cache", "ms-playwright"),
  ]
  for (const base of candidates) {
    if (!existsSync(base)) continue
    try {
      const entries = readdirSync(base)
      const chromes = entries.filter((e) => e.startsWith("chromium-") && !e.includes("headless"))
      if (chromes.length === 0) continue
      // Pick the highest version
      chromes.sort().reverse()
      const chromeDir = join(base, chromes[0]!)
      // Look for chrome executable
      for (const subdir of ["chrome-win64", "chrome-linux", "chrome-mac"]) {
        const exePath = join(chromeDir, subdir, subdir.includes("win") ? "chrome.exe" : "chrome")
        if (existsSync(exePath)) return exePath
      }
    } catch {
      continue
    }
  }
  return undefined
}

const CHROMIUM_EXECUTABLE = findChromiumExecutable()

// ── Session map — one browser per agent session ──────────────────────

interface BrowserSession {
  browser: Browser
  context: BrowserContext
  page: Page
  consoleLogs: string[]
  createdAt: number
  lastUsedAt: number
}

const sessions = new Map<string, BrowserSession>()

/** Evict stale sessions when the map is full or a session is older than TTL */
function evictStaleSessions(): void {
  const now = Date.now()
  // Remove expired sessions
  for (const [id, session] of sessions) {
    if (now - session.lastUsedAt > SESSION_TTL_MS) {
      sessions.delete(id)
      session.browser.close().catch(() => {})
    }
  }
  // If still over capacity, remove oldest
  if (sessions.size >= MAX_SESSIONS) {
    const sorted = [...sessions.entries()].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)
    const toRemove = sorted.slice(0, sessions.size - MAX_SESSIONS + 1)
    for (const [id, session] of toRemove) {
      sessions.delete(id)
      session.browser.close().catch(() => {})
    }
  }
}

async function getOrCreateSession(sessionId: string): Promise<BrowserSession> {
  evictStaleSessions()

  const existing = sessions.get(sessionId)
  if (existing) {
    try {
      // Quick health check with a short timeout
      await existing.page.evaluate("1")
      existing.lastUsedAt = Date.now()
      return existing
    } catch {
      // Page is dead, close and recreate
      await cleanupSession(sessionId)
    }
  }

  const launchOpts: Parameters<typeof chromium.launch>[0] = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1920,1080",
    ],
  }
  if (CHROMIUM_EXECUTABLE) {
    launchOpts.executablePath = CHROMIUM_EXECUTABLE
  }
  const browser = await chromium.launch(launchOpts)

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    locale: "en-US",
    timezoneId: "America/New_York",
  })

  const page = await context.newPage()

  // Collect console logs (trim to last 500 to prevent unbounded growth)
  const consoleLogs: string[] = []
  page.on("console", (msg) => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
    if (consoleLogs.length > 500) consoleLogs.splice(0, 100)
  })
  page.on("pageerror", (err) => {
    consoleLogs.push(`[pageerror] ${err.message}`)
    if (consoleLogs.length > 500) consoleLogs.splice(0, 100)
  })

  const now = Date.now()
  const session: BrowserSession = { browser, context, page, consoleLogs, createdAt: now, lastUsedAt: now }
  sessions.set(sessionId, session)
  return session
}

async function cleanupSession(sessionId: string): Promise<void> {
  const existing = sessions.get(sessionId)
  if (existing) {
    try {
      await existing.browser.close()
    } catch {
      // Ignore close errors
    }
    sessions.delete(sessionId)
  }
}

/** Clean up all sessions (called on process shutdown) */
function cleanupAllSessions(): void {
  for (const [id, session] of sessions) {
    sessions.delete(id)
    session.browser.close().catch(() => {})
  }
}

// ── Helper: Truncate long strings for output ─────────────────────────

function truncate(text: string, maxLen = 2000): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + `\n… [truncated ${text.length - maxLen} more chars]`
}

// ── Tool definition ──────────────────────────────────────────────────

export const browserTool: Tool = {
  name: "browser",
  description:
    "Full browser automation: navigate to URLs, click elements by CSS selector, type text into inputs, take screenshots, scroll, run JavaScript, get page HTML, get console logs, and close the browser session. The browser persists across calls within the same agent session.",
  parameters: [
    {
      name: "action",
      type: "string",
      description:
        "Action to perform: navigate, click, type, screenshot, scroll, evaluate, get_html, get_console, snapshot, close",
      required: true,
    },
    {
      name: "url",
      type: "string",
      description: "URL to navigate to (for navigate action)",
      required: false,
    },
    {
      name: "selector",
      type: "string",
      description: "CSS selector to target (for click, type actions)",
      required: false,
    },
    {
      name: "text",
      type: "string",
      description: "Text to type (for type action) or JavaScript code (for evaluate action)",
      required: false,
    },
    {
      name: "coordinate",
      type: "array",
      description: "[x, y] pixel coordinate for click at position (alternative to selector)",
      required: false,
    },
    {
      name: "scroll_x",
      type: "number",
      description: "Horizontal scroll amount in pixels",
      required: false,
    },
    {
      name: "scroll_y",
      type: "number",
      description: "Vertical scroll amount in pixels",
      required: false,
    },
    {
      name: "full_page",
      type: "boolean",
      description: "Capture full-page screenshot (default: viewport only)",
      required: false,
    },
    {
      name: "timeout",
      type: "number",
      description: "Navigation/action timeout in milliseconds (default: 30000)",
      required: false,
    },
    {
      name: "wait_until",
      type: "string",
      description:
        "Navigation wait condition: load, domcontentloaded, networkidle (default: load)",
      required: false,
    },
  ],

  async execute(params, ctx): Promise<ToolResult> {
    const action = params.action as string
    const agentId = ctx.agentId
    const sessionId = agentId || "default-browser"
    const timeout = (params.timeout as number) || 30000

    try {
      switch (action) {
        // ── Navigate ────────────────────────────────────────────
        case "navigate": {
          const url = params.url as string
          if (!url) {
            return { success: false, output: "", error: "url is required for navigate action" }
          }
          const session = await getOrCreateSession(sessionId)
          const waitUntil = (params.wait_until as string) || "load"
          await session.page.goto(url, {
            waitUntil: waitUntil as "load" | "domcontentloaded" | "networkidle",
            timeout,
          })
          const title = await session.page.title()
          const currentUrl = session.page.url()
          return {
            success: true,
            output: `Navigated to ${currentUrl}\nTitle: ${title}`,
            metadata: { url: currentUrl, title },
          }
        }

        // ── Click ───────────────────────────────────────────────
        case "click": {
          const coord = params.coordinate as [number, number] | undefined
          const selector = params.selector as string
          if (!coord && !selector) {
            return {
              success: false,
              output: "",
              error: "selector or coordinate is required for click action",
            }
          }
          const session = await getOrCreateSession(sessionId)
          if (coord) {
            await session.page.mouse.click(coord[0], coord[1])
            return { success: true, output: `Clicked at position (${coord[0]}, ${coord[1]})` }
          }
          await session.page.click(selector, { timeout })
          return { success: true, output: `Clicked element: ${selector}` }
        }

        // ── Type ────────────────────────────────────────────────
        case "type": {
          const text = params.text as string
          if (!text) {
            return { success: false, output: "", error: "text is required for type action" }
          }
          const selector = params.selector as string
          const session = await getOrCreateSession(sessionId)
          if (selector) {
            // Use fill() which clears existing content and types in one call
            await session.page.fill(selector, text)
          } else {
            // Type at current focus position
            await session.page.keyboard.type(text, { delay: 10 })
          }
          return {
            success: true,
            output: `Typed "${text.slice(0, 100)}${text.length > 100 ? "…" : ""}"${selector ? ` into ${selector}` : ""}`,
          }
        }

        // ── Screenshot ───────────────────────────────────────────
        case "screenshot": {
          const session = await getOrCreateSession(sessionId)
          const fullPage = params.full_page as boolean | undefined
          const screenshotBuf = await session.page.screenshot({
            type: "png",
            fullPage: fullPage ?? false,
          })
          const b64 = screenshotBuf.toString("base64")
          return {
            success: true,
            output: `data:image/png;base64,${b64}`,
            metadata: {
              width: 1920,
              height: fullPage ? "full" : 1080,
              format: "png",
              sizeBytes: screenshotBuf.length,
            },
          }
        }

        // ── Scroll ───────────────────────────────────────────────
        case "scroll": {
          const session = await getOrCreateSession(sessionId)
          const x = (params.scroll_x as number) || 0
          const y = (params.scroll_y as number) || 0
          // Use string-based evaluate to avoid DOM type issues
          await session.page.evaluate(`window.scrollBy(${x}, ${y})`)
          // Wait a brief moment for any lazy-loaded content
          await session.page.waitForTimeout(300)
          return { success: true, output: `Scrolled by (${x}, ${y}) pixels` }
        }

        // ── Evaluate JavaScript ──────────────────────────────────
        case "evaluate": {
          const jsCode = params.text as string
          if (!jsCode) {
            return {
              success: false,
              output: "",
              error: "text parameter is required with JavaScript code for evaluate action",
            }
          }
          const session = await getOrCreateSession(sessionId)
          const result = await session.page.evaluate(jsCode)
          const resultStr = typeof result === "undefined" ? "undefined" : JSON.stringify(result, null, 2)
          return {
            success: true,
            output: truncate(resultStr, 5000),
            metadata: { resultType: typeof result },
          }
        }

        // ── Get HTML ─────────────────────────────────────────────
        case "get_html": {
          const session = await getOrCreateSession(sessionId)
          const html = await session.page.content()
          const selector = params.selector as string | undefined
          if (selector) {
            try {
              const element = await session.page.$(selector)
              if (element) {
                // Use string-based evaluate to avoid HTMLElement type issue
                const outerHtml = await element.evaluate<string>('el => el.outerHTML')
                return {
                  success: true,
                  output: truncate(outerHtml, 10000),
                  metadata: { selector, length: outerHtml.length },
                }
              }
              return { success: false, output: "", error: `Element not found: ${selector}` }
            } catch (err) {
              return {
                success: false,
                output: "",
                error: `Failed to get HTML for selector ${selector}: ${err instanceof Error ? err.message : String(err)}`,
              }
            }
          }
          return {
            success: true,
            output: truncate(html, 10000),
            metadata: { length: html.length },
          }
        }

        // ── Get Console Logs ─────────────────────────────────────
        case "get_console": {
          const session = sessions.get(sessionId)
          if (!session) {
            return { success: true, output: "No browser session active. No console logs available." }
          }
          const logs = session.consoleLogs.slice(-200)
          // Trim the stored logs — keep only the most recent 100
          session.consoleLogs.splice(0, Math.max(0, session.consoleLogs.length - 100))
          if (logs.length === 0) {
            return { success: true, output: "No new console logs since last check." }
          }
          return {
            success: true,
            output: truncate(logs.join("\n"), 10000),
            metadata: { count: logs.length },
          }
        }

        // ── Snapshot (page summary with visible text) ─────────────
        case "snapshot": {
          const session = await getOrCreateSession(sessionId)
          const title = await session.page.title()
          const url = session.page.url()
          // Use string-based evaluate to avoid DOM type issues
          const visibleText = await session.page.evaluate<string>(`
            (() => {
              const body = document.body;
              if (!body) return "";
              const clone = body.cloneNode(true);
              const scripts = clone.querySelectorAll("script, style, noscript, svg");
              scripts.forEach(s => s.remove());
              return (clone.innerText || "").slice(0, 8000);
            })()
          `)
          return {
            success: true,
            output: truncate(
              `URL: ${url}\nTitle: ${title}\n\nVisible content:\n${visibleText}`,
              12000,
            ),
            metadata: { url, title, visibleTextLength: visibleText.length },
          }
        }

        // ── Close ────────────────────────────────────────────────
        case "close": {
          await cleanupSession(sessionId)
          return { success: true, output: "Browser session closed and cleaned up." }
        }

        default:
          return {
            success: false,
            output: "",
            error: `Unknown browser action: ${action}. Available: navigate, click, type, screenshot, scroll, evaluate, get_html, get_console, snapshot, close`,
          }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // If browser crashed, clean up the session so next call re-launches
      if (
        message.includes("Target closed") ||
        message.includes("browser") ||
        message.includes("Connection")
      ) {
        await cleanupSession(sessionId)
      }
      return { success: false, output: "", error: message }
    }
  },
}

// ── Auto-cleanup on process shutdown ─────────────────────────────────

process.on("beforeExit", () => {
  cleanupAllSessions()
})

process.on("SIGINT", () => {
  cleanupAllSessions()
  process.exit(0)
})

process.on("SIGTERM", () => {
  cleanupAllSessions()
  process.exit(0)
})

import ansiEscapes from "ansi-escapes"
import { showBanner } from "../cli/banner"
import type { Mode } from "./types"

export const dashboardMode: Mode = {
  id: "dashboard",
  name: "Dashboard",
  description: "Live agent status TUI",

  async run() {
    if (!process.stdout.isTTY) {
      console.error("Dashboard requires a TTY terminal")
      return "back"
    }
    showBanner()
    const { startDashboard } = await import("../tui/renderer")
    await startDashboard()
    return "quit"
  },
}

export const chatMode: Mode = {
  id: "chat",
  name: "Chat",
  description: "Talk to an AI agent with default tools",

  async run() {
    if (!process.stdout.isTTY) {
      console.error("Chat requires a TTY terminal")
      return "back"
    }
    showBanner()
    const { startChat } = await import("../chat/renderer")
    await startChat()
    return "quit"
  },
}

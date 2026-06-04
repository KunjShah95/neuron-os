import ansiEscapes from "ansi-escapes"
import type { Mode } from "./types"

export const setupMode: Mode = {
  id: "setup",
  name: "Setup",
  description: "Configure Aegis workspace (interactive wizard)",

  async run() {
    if (!process.stdout.isTTY) {
      console.error("Setup requires a TTY terminal")
      return "back"
    }

    const wasRaw = process.stdin.isRaw
    process.stdin.setRawMode(false)
    process.stdout.write(ansiEscapes.exitAlternativeScreen)

    try {
      const { runSetupFlow } = await import("../wizard/flows/setup")
      const { createClackPrompter } = await import("../wizard/clack-prompter")
      const prompter = createClackPrompter()
      await runSetupFlow(prompter)
    } catch (err) {
      console.error("Setup failed:", err)
    }

    try {
      process.stdin.setRawMode(wasRaw ?? false)
    } catch {
      // Best-effort restore — stdin may already be in a clean state
    }

    return "back"
  },
}

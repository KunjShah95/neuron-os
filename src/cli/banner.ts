import { existsSync } from "fs"
import { readdirSync } from "fs"
import { join } from "path"
import { getVersion } from "../version"
import { theme } from "./theme"
import { bannerFor } from "./figlet-banner"

let bannerEmitted = false

function countInstalledSkills(): number {
  const skillsDir = join(process.cwd(), "skills")
  if (!existsSync(skillsDir)) return 0
  return readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).length
}

export function showBanner(opts?: { version?: string; tagline?: string; title?: string }) {
  // Suppress banner when spawned from the wakeup menu (child process)
  if (process.env.AEGIS_SPAWNED) return
  if (bannerEmitted) return
  bannerEmitted = true

  if (process.stdout.isTTY && !process.argv.includes("--plain") && !process.argv.includes("--json")) {
    const text = bannerFor(opts?.title ?? "Neuron OS")
    const colored = text
      .split("\n")
      .map((l) => theme.accent(l))
      .join("\n")
    console.log(colored)
    const version = opts?.version ?? `v${getVersion()}`

    const tagline = opts?.tagline ?? "The Operating System for Autonomous AI Agents"
    console.log(theme.muted(`${version} — ${tagline}`))

    const skillCount = countInstalledSkills()
    if (skillCount > 0) {
      console.log(theme.muted(`${skillCount} skill${skillCount > 1 ? "s" : ""} loaded`))
    }
    console.log("")
  }
}

export function resetBanner() {
  bannerEmitted = false
}

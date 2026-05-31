import { theme } from "../cli/theme"
import { showInfoScreen } from "./info-screen"
import { toolRegistry } from "../tools"
import type { Mode } from "./types"

export const computerMode: Mode = {
  id: "computer",
  name: "Computer",
  description: "Computer use status and control",

  async run() {
    const tool = toolRegistry.get("computer")
    const available = tool !== undefined
    const lines: string[] = [""]

    if (!available) {
      lines.push(`  ${theme.warn("Computer tool not registered")}`)
      lines.push("")
      lines.push(`  ${theme.muted("Check tools/index.ts registration")}`)
    } else {
      lines.push(`  ${theme.success("● Computer control available")}`)
      lines.push("")
      lines.push(`  ${theme.heading("Platform")}`)
      lines.push(`  ${theme.dim(process.platform)}`)
      lines.push("")
      lines.push(`  ${theme.heading("Actions")}`)
      lines.push(`  ${theme.dim("screenshot, mouse_move, left_click, right_click")}`)
      lines.push(`  ${theme.dim("double_click, drag, type, keypress, scroll")}`)
      lines.push("")
      lines.push(`  ${theme.muted("Computer tool is available to agents with 'computer' permission")}`)
      lines.push(`  ${theme.muted("Only build and debug agents have it by default")}`)
    }

    return showInfoScreen("Computer", lines, { back: true })
  },
}

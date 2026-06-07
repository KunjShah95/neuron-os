import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"
import { toolRegistry } from "../../tools"

export function registerComputer(program: Command) {
  program.command("computer").alias("pc").description("Computer use status and control").action(handleComputer)
}

async function handleComputer() {
  showBanner()

  const tool = toolRegistry.get("computer")
  const available = tool !== undefined

  console.log()
  if (!available) {
    console.log(`  ${theme.warn("Computer tool not registered")}`)
    console.log(`  ${theme.muted("Check tools/index.ts registration")}`)
  } else {
    console.log(`  ${theme.success("● Computer control available")}`)
    console.log()
    console.log(`  ${theme.heading("Platform")}`)
    console.log(`  ${theme.dim(process.platform)}`)
    console.log()
    console.log(`  ${theme.heading("Actions")}`)
    console.log(`  ${theme.dim("screenshot, mouse_move, left_click, right_click")}`)
    console.log(`  ${theme.dim("double_click, drag, type, keypress, scroll")}`)
    console.log()
    console.log(`  ${theme.muted("Computer tool is available to agents with 'computer' permission")}`)
    console.log(`  ${theme.muted("Only build and debug agents have it by default")}`)
  }
  console.log()
}

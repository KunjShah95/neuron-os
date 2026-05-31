import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

export function registerPlan(program: Command) {
  program
    .command("plan")
    .description("Generate a step-by-step implementation plan")
    .argument("<goal>", "What you want to accomplish")
    .action(handlePlan)
}

async function handlePlan(goal: string) {
  showBanner()

  console.log(theme.info(`\n  📋 Generating plan for: ${goal}\n`))

  try {
    const { runPlanOrchestrator } = await import("../../modes/plan")
    const plan = await runPlanOrchestrator(goal)
    console.log(plan)
    console.log()
  } catch (err: any) {
    console.error(theme.error(`\n  ✗ Error: ${err.message ?? String(err)}\n`))
    process.exit(1)
  }
}

/**
 * plan/selection — interactive step selection with complexity coloring.
 * Ported from chaicodeclaw-build.
 */

import { multiselect, isCancel } from "@clack/prompts"
import chalk from "chalk"
import type { Plan, PlanStep } from "./types"
import { renderTerminalMarkdown } from "../../tui/terminal-md"

const COMPLEXITY_COLOR: Record<NonNullable<PlanStep["complexity"]>, string> = {
  low: chalk.green("low"),
  medium: chalk.yellow("medium"),
  high: chalk.red("high"),
}

export function printPlan(plan: Plan): void {
  if (plan.researchSummary?.trim()) {
    console.log(chalk.bold("\n🔍 Research summary"))
    console.log(renderTerminalMarkdown(plan.researchSummary))
  }

  console.log(chalk.bold("\n📋 Generated Plan\n"))

  for (const [i, s] of plan.steps.entries()) {
    const tag = s.complexity ? `[${COMPLEXITY_COLOR[s.complexity]}]` : ""
    console.log(`  ${chalk.cyan(`Step ${String(i + 1).padStart(2)}`)}. ${chalk.bold(s.title)} ${tag}`)
  }

  console.log()
}

export async function selectSteps(plan: Plan): Promise<PlanStep[]> {
  const options = plan.steps.map((s) => ({
    value: s.id,
    label: s.title,
    hint: s.complexity ?? "",
  }))

  const picked = await multiselect<string>({
    message: "Select steps to execute (space toggles, enter confirms)",
    options,
    initialValues: plan.steps.map((s) => s.id),
    required: false,
  })

  if (isCancel(picked)) return []
  const set = new Set<string>(picked)
  return plan.steps.filter((s) => set.has(s.id))
}

/**
 * telegram/plan-session — interactive plan step selection via inline keyboards.
 * Ported from chaicodeclaw-build.
 */

import { Markup } from "telegraf"
import type { Plan } from "../plan/types"

export interface PlanSession {
  plan: Plan
  selected: Set<string>
}

/** Per-chat plan sessions (keyed by Telegram chat ID). */
export const planSessions = new Map<number, PlanSession>()

const CHECKED = "✅"
const UNCHECKED = "⬜"

/**
 * Build the plan message text showing steps with their selection status.
 */
export function planMessage(session: PlanSession): string {
  const lines: string[] = [`*📋 Plan: ${session.plan.goal.slice(0, 80)}*`, ""]

  if (session.plan.researchSummary) {
    lines.push(`*Research:* ${session.plan.researchSummary.slice(0, 200)}`)
    lines.push("")
  }

  for (const [i, step] of session.plan.steps.entries()) {
    const checked = session.selected.has(step.id) ? CHECKED : UNCHECKED
    const complexity = step.complexity ? ` [${step.complexity}]` : ""
    lines.push(`${checked} *Step ${i + 1}:* ${step.title}${complexity}`)
    lines.push(`  ${step.description.slice(0, 200)}`)
    lines.push("")
  }

  lines.push(`_${session.selected.size}/${session.plan.steps.length} steps selected_`)

  return lines.join("\n")
}

/**
 * Build the inline keyboard for plan step selection.
 */
export function planKeyboard(session: PlanSession) {
  const rows: Array<{ text: string; callback_data: string }[]> = []

  for (const [i, step] of session.plan.steps.entries()) {
    const checked = session.selected.has(step.id) ? CHECKED : UNCHECKED
    rows.push([Markup.button.callback(`${checked} Step ${i + 1}`, `plan_toggle:${step.id}`)])
  }

  rows.push([Markup.button.callback("✅ All", "plan_all"), Markup.button.callback("⬜ None", "plan_none")])

  rows.push([Markup.button.callback("🚀 Execute Selected", "plan_proceed")])

  return Markup.inlineKeyboard(rows)
}

/**
 * Refresh the plan UI message with updated selection state.
 */
export async function refreshPlanUi(
  ctx: { editMessageText: (text: string, opts?: object) => Promise<unknown>; answerCbQuery: () => Promise<unknown> },
  session: PlanSession,
) {
  await ctx.editMessageText(planMessage(session), {
    parse_mode: "Markdown",
    ...planKeyboard(session),
  })
}

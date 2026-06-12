import type { Telegraf } from "telegraf"
import type { ApprovalCallbacks } from "./messages"

export function registerCallbacks(bot: Telegraf, approvalCallbacks: ApprovalCallbacks): void {
  bot.action(/^plan_toggle:(.+)$/, async (ctx) => {
    const { planSessions, refreshPlanUi } = await import("../../modes/telegram/plan-session")
    const s = planSessions.get(ctx.chat?.id ?? 0)
    if (!s) return ctx.answerCbQuery("No active plan session")

    const id = ctx.match[1] ?? ""
    if (s.selected.has(id)) s.selected.delete(id)
    else s.selected.add(id)

    await refreshPlanUi(ctx, s)
    await ctx.answerCbQuery()
  })

  bot.action("plan_all", async (ctx) => {
    const { planSessions, refreshPlanUi } = await import("../../modes/telegram/plan-session")
    const s = planSessions.get(ctx.chat?.id ?? 0)
    if (!s) return ctx.answerCbQuery("No active plan session")

    for (const step of s.plan.steps) s.selected.add(step.id)
    await refreshPlanUi(ctx, s)
    await ctx.answerCbQuery()
  })

  bot.action("plan_none", async (ctx) => {
    const { planSessions, refreshPlanUi } = await import("../../modes/telegram/plan-session")
    const s = planSessions.get(ctx.chat?.id ?? 0)
    if (!s) return ctx.answerCbQuery("No active plan session")

    s.selected.clear()
    await refreshPlanUi(ctx, s)
    await ctx.answerCbQuery()
  })

  bot.action("plan_proceed", async (ctx) => {
    const { planSessions } = await import("../../modes/telegram/plan-session")
    const { runPlanSteps } = await import("../../modes/telegram/agent-run")
    const s = planSessions.get(ctx.chat?.id ?? 0)
    if (!s) return ctx.answerCbQuery("No active plan session")

    const steps = s.plan.steps.filter((step) => s.selected.has(step.id))
    if (steps.length === 0) return ctx.answerCbQuery("No steps selected")

    const { plan } = s
    const chatId = ctx.chat?.id ?? 0
    planSessions.delete(chatId)

    const list = steps.map((step, i) => `${i + 1}. ${step.title}`).join("\n")
    await ctx.editMessageText(`🚀 Executing ${steps.length} step(s)…\n\n${list}`)
    await ctx.answerCbQuery()

    void runPlanSteps(ctx, chatId, plan, steps).catch((err: unknown) => {
      ctx.reply(`❌ Execution error: ${err instanceof Error ? err.message : String(err)}`)
    })
  })

  bot.action(/agent_diff:(\d+)/, async (ctx) => {
    await ctx.answerCbQuery("Generating diff...")
    await ctx.reply("📋 Diff view would be shown here (requires storing staged actions per session)")
  })

  bot.action(/agent_accept:(\d+)/, async (ctx) => {
    const msgId = parseInt(ctx.match[1] ?? "", 10)
    const entry = approvalCallbacks.get(msgId)
    if (entry) {
      entry.resolve(true)
      approvalCallbacks.delete(msgId)
      await ctx.answerCbQuery("Changes approved!")
      await ctx.editMessageText("✅ Changes approved. Applying...", { parse_mode: "Markdown" })
    } else {
      await ctx.answerCbQuery("Session expired or already resolved")
    }
  })

  bot.action(/agent_reject:(\d+)/, async (ctx) => {
    const msgId = parseInt(ctx.match[1] ?? "", 10)
    const entry = approvalCallbacks.get(msgId)
    if (entry) {
      entry.resolve(false)
      approvalCallbacks.delete(msgId)
      await ctx.answerCbQuery("Changes rejected")
      await ctx.editMessageText("❌ Changes rejected. No files were modified.", { parse_mode: "Markdown" })
    } else {
      await ctx.answerCbQuery("Session expired or already resolved")
    }
  })

  bot.action("approval_diff", async (ctx) => {
    const { approvalSessions, approvalDiff } = await import("../../modes/telegram/approval-session")
    const s = approvalSessions.get(ctx.chat?.id ?? 0)
    if (!s) return ctx.answerCbQuery("No active approval session")

    await ctx.answerCbQuery()
    const diff = approvalDiff(s.pending)
    await ctx.reply(diff || "(no diff available)")
  })

  bot.action("approval_accept", async (ctx) => {
    const { approvalSessions } = await import("../../modes/telegram/approval-session")
    const s = approvalSessions.get(ctx.chat?.id ?? 0)
    if (!s) return ctx.answerCbQuery("No active approval session")

    approvalSessions.delete(ctx.chat?.id ?? 0)
    for (const a of s.pending) s.tracker.approve(a.id)
    s.executor.applyApproved()
    s.executor.clearStaging()

    await ctx.editMessageText("✅ All changes applied.")
    await ctx.answerCbQuery("Applied!")
  })

  bot.action("approval_reject", async (ctx) => {
    const { approvalSessions } = await import("../../modes/telegram/approval-session")
    const s = approvalSessions.get(ctx.chat?.id ?? 0)
    if (!s) return ctx.answerCbQuery("No active approval session")

    approvalSessions.delete(ctx.chat?.id ?? 0)
    for (const a of s.pending) s.tracker.reject(a.id)
    s.executor.clearStaging()

    await ctx.editMessageText("❌ All changes rejected. Nothing was applied.")
    await ctx.answerCbQuery("Rejected")
  })
}

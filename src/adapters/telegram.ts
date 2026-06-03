/**
 * Telegram adapter — powered by telegraf with inline keyboard approval flow.
 *
 * Commands:
 *   /start       — Welcome message with available commands
 *   /ask <q>     — Read-only research question about the codebase
 *   /agent <g>   — Let the agent modify your codebase (with approval)
 *   /plan <g>    — Generate a step-by-step plan
 *   /status      — Check agent status
 *
 * When mutations are staged via /agent, inline keyboards let the user
 * approve, reject, or view the diff before changes are applied.
 */

import { Telegraf, Markup } from "telegraf"
import type { PlatformAdapter, PlatformSendOptions } from "./types"
interface TelegramConfig {
  botToken: string
  allowedUserIds?: string[]
}

const WELCOME_MSG = [
  "👋 *Welcome to Neuron OS Bot!*",
  "",
  "I'm your AI development assistant. Here's what I can do:",
  "",
  "/ask `<question>` — Ask about the codebase",
  "/agent `<goal>` — Let the AI modify your codebase",
  "/plan `<goal>` — Generate a step-by-step plan",
  "/status — Check agent system status",
  "",
  "Use /help for more details.",
].join("\n")

const HELP_MSG = [
  "*Available Commands:*",
  "",
  "*/ask* — Read-only research mode",
  "  Ask questions about your codebase structure, patterns, and logic.",
  "  No files will be modified. Example:",
  "  `/ask How is the agent system structured?`",
  "",
  "*/agent* — AI agent mode",
  "  The agent can read, create, modify, and delete files.",
  "  *All mutations are staged for your approval* before being applied.",
  "  Example: `/agent Add a health check endpoint to the API`",
  "",
  "*/plan* — Planning mode",
  "  Generate a detailed step-by-step implementation plan without",
  "  making any changes. Example:",
  "  `/plan Add user authentication with JWT`",
  "",
  "*/status* — Check system status",
  "  Shows the current state of agents, memory, and tools.",
].join("\n")

/** Clip long messages to Telegram's 4096 char limit */
function clip(text: string, max = 4000): string {
  return text.length <= max ? text : text.slice(0, max) + "\n…[truncated]"
}

/** Get text after /command */
function commandArg(text: string, command: string): string {
  return text.replace(new RegExp(`^/${command}\\s*`, "i"), "").trim()
}

export function createTelegramAdapter(config: TelegramConfig): PlatformAdapter {
  const bot = new Telegraf(config.botToken)

  // ── Auth middleware ────────────────────────────────────────────────
  bot.use(async (ctx, next) => {
    if (!ctx.from) return
    const userId = String(ctx.from.id)
    if (
      config.allowedUserIds &&
      config.allowedUserIds.length > 0 &&
      !config.allowedUserIds.includes(userId)
    ) {
      await ctx.reply("⛔ Unauthorized. Your user ID is not allowed to use this bot.")
      return
    }
    await next()
  })

  // ── /start ─────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    await ctx.reply(WELCOME_MSG, { parse_mode: "Markdown" })
  })

  // ── /help ──────────────────────────────────────────────────────────
  bot.help(async (ctx) => {
    await ctx.reply(HELP_MSG, { parse_mode: "Markdown" })
  })

  // ── /ask ───────────────────────────────────────────────────────────
  bot.command("ask", async (ctx) => {
    const question = commandArg(ctx.message.text, "ask")
    if (!question) {
      await ctx.reply(
        "Usage: `/ask <question>`\n\nExample: `/ask How does the agent system work?`",
        { parse_mode: "Markdown" },
      )
      return
    }

    const statusMsg = await ctx.reply("🔍 Researching your question...")

    try {
      // Import dynamically to avoid circular deps
      const { runAskOrchestrator } = await import("../modes/ask")
      const answer = await runAskOrchestrator(question)

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        clip(answer, 4000),
        { parse_mode: "Markdown" },
      )
    } catch (err: any) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        `❌ Error: ${err.message ?? String(err)}`,
      )
    }
  })

  // ── /agent ─────────────────────────────────────────────────────────
  bot.command("agent", async (ctx) => {
    const goal = commandArg(ctx.message.text, "agent")
    if (!goal) {
      await ctx.reply(
        "Usage: `/agent <goal>`\n\nExample: `/agent Add a health check endpoint`",
        { parse_mode: "Markdown" },
      )
      return
    }

    const statusMsg = await ctx.reply("🤖 Starting agent session...")

    try {
      const { runAgentOrchestrator } = await import("../modes/agent-run")
      const result = await runAgentOrchestrator(goal, {
        onStaged: async (pending) => {
          // Send summary with inline approval keyboard
          const summary = pending
            .map((a) => {
              if (a.type === "tool_execute") return `🖥  Shell: ${a.details.command}`
              return `📄 ${a.type.replace(/_/g, " ")}: ${a.path}`
            })
            .join("\n")

          await ctx.telegram.editMessageText(
            ctx.chat!.id,
            statusMsg.message_id,
            undefined,
            `📋 *${pending.length} Change(s) Staged*\n\n${clip(summary, 2000)}\n\nReview and approve:`,
            {
              parse_mode: "Markdown",
              ...Markup.inlineKeyboard([
                [Markup.button.callback("📋 Show Diff", `agent_diff:${ctx.message.message_id}`)],
                [
                  Markup.button.callback("✅ Accept All", `agent_accept:${ctx.message.message_id}`),
                  Markup.button.callback("❌ Reject All", `agent_reject:${ctx.message.message_id}`),
                ],
              ]),
            },
          )

          // Wait for user decision (handled by callback queries below)
          return new Promise<boolean>((resolve) => {
            // Store the resolver in a session map
            approvalCallbacks.set(ctx.message.message_id, resolve)
          })
        },
      })

      // Send final result
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        `✅ *Done*\n\n${clip(result, 3500)}`,
        { parse_mode: "Markdown" },
      )
    } catch (err: any) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        `❌ Error: ${err.message ?? String(err)}`,
      )
    }
  })

  // ── /plan ──────────────────────────────────────────────────────────
  bot.command("plan", async (ctx) => {
    const goal = commandArg(ctx.message.text, "plan")
    if (!goal) {
      await ctx.reply(
        "Usage: `/plan <goal>`\n\nExample: `/plan Add user authentication`",
        { parse_mode: "Markdown" },
      )
      return
    }

    const statusMsg = await ctx.reply("📋 Generating plan...")

    try {
      const { runPlanOrchestrator } = await import("../modes/plan")
      const plan = await runPlanOrchestrator(goal)

      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        clip(plan, 4000),
        { parse_mode: "Markdown" },
      )
    } catch (err: any) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        `❌ Error: ${err.message ?? String(err)}`,
      )
    }
  })

  // ── /status ────────────────────────────────────────────────────────
  bot.command("status", async (ctx) => {
    const { agentManager } = await import("../agent/manager")
    const agents = agentManager.list()
    const lines = [
      "*🤖 Agent System Status*",
      "",
      `Running agents: ${agents.filter((a) => a.status === "running").length}`,
      `Total agents: ${agents.length}`,
      "",
    ]
    for (const a of agents.slice(0, 10)) {
      lines.push(`• \`${a.id}\` — ${a.status} (${a.def.name})`)
    }
    await ctx.reply(lines.join("\n"), { parse_mode: "Markdown" })
  })

  // ── Inline keyboard callbacks ──────────────────────────────────────
  const approvalCallbacks = new Map<number, (approved: boolean) => void>()

  bot.action(/agent_diff:(\d+)/, async (ctx) => {
    // Fetch the staged summary and show more detail
    await ctx.answerCbQuery("Generating diff...")
    await ctx.reply("📋 Diff view would be shown here (requires storing staged actions per session)")
  })

  bot.action(/agent_accept:(\d+)/, async (ctx) => {
    const msgId = parseInt(ctx.match[1]!, 10)
    const resolve = approvalCallbacks.get(msgId)
    if (resolve) {
      resolve(true)
      approvalCallbacks.delete(msgId)
      await ctx.answerCbQuery("Changes approved!")
      await ctx.editMessageText(
        "✅ Changes approved. Applying...",
        { parse_mode: "Markdown" },
      )
    } else {
      await ctx.answerCbQuery("Session expired or already resolved")
    }
  })

  bot.action(/agent_reject:(\d+)/, async (ctx) => {
    const msgId = parseInt(ctx.match[1]!, 10)
    const resolve = approvalCallbacks.get(msgId)
    if (resolve) {
      resolve(false)
      approvalCallbacks.delete(msgId)
      await ctx.answerCbQuery("Changes rejected")
      await ctx.editMessageText(
        "❌ Changes rejected. No files were modified.",
        { parse_mode: "Markdown" },
      )
    } else {
      await ctx.answerCbQuery("Session expired or already resolved")
    }
  })

  // ── Error handler ──────────────────────────────────────────────────
  bot.catch((err, ctx) => {
    console.error(`[telegram] Error for ${ctx.updateType}:`, err)
  })

  // ── PlatformAdapter interface ──────────────────────────────────────
  return {
    name: "telegram",

    async start() {
      await bot.launch()
      console.log("[telegram] Telegraf bot started")
    },

    async stop() {
      bot.stop()
      console.log("[telegram] Telegraf bot stopped")
    },

    async send(opts: PlatformSendOptions) {
      await bot.telegram.sendMessage(opts.channelId, opts.text, {
        parse_mode: "Markdown",
      })
    },
  }
}

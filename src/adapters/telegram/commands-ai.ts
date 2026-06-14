import { Markup, type Telegraf } from "telegraf"
import type { SearchScope } from "../../modes/search"
import type { AIProvider } from "../../ai"
import { clip } from "../bot-commands"
import { commandArg, type ApprovalCallbacks, type TelegramConfig } from "./messages"

export function registerAiCommands(bot: Telegraf, config: TelegramConfig, approvalCallbacks: ApprovalCallbacks): void {
  bot.command("ask", async (ctx) => {
    const question = commandArg(ctx.message.text, "ask")
    if (!question) {
      await ctx.reply("Usage: `/ask <question>`\n\nExample: `/ask How does the agent system work?`", {
        parse_mode: "Markdown",
      })
      return
    }

    const statusMsg = await ctx.reply("🔍 Researching your question...")

    try {
      const { runAskOrchestrator } = await import("../../modes/ask")
      const answer = await runAskOrchestrator(question, undefined, config.project)

      await ctx.telegram.editMessageText(ctx.chat?.id ?? 0, statusMsg.message_id, undefined, clip(answer, 4000), {
        parse_mode: "Markdown",
      })
    } catch (err: unknown) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id ?? 0,
        statusMsg.message_id,
        undefined,
        `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  })

  bot.command("agent", async (ctx) => {
    const goal = commandArg(ctx.message.text, "agent")
    if (!goal) {
      await ctx.reply("Usage: `/agent <goal>`\n\nExample: `/agent Add a health check endpoint`", {
        parse_mode: "Markdown",
      })
      return
    }

    const statusMsg = await ctx.reply("🤖 Starting agent session...")

    try {
      const { runAgentOrchestrator } = await import("../../modes/agent-run")
      const result = await runAgentOrchestrator(
        goal,
        {
          onStaged: async (pending) => {
            const summary = pending
              .map((a) => {
                if (a.type === "tool_execute") return `🖥  Shell: ${a.details.command}`
                return `📄 ${a.type.replace(/_/g, " ")}: ${a.path}`
              })
              .join("\n")

            await ctx.telegram.editMessageText(
              ctx.chat?.id ?? 0,
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

            return new Promise<boolean>((resolve) => {
              approvalCallbacks.set(ctx.message.message_id, {
                resolve,
                createdAt: Date.now(),
              })
            })
          },
        },
        config.project,
      )

      await ctx.telegram.editMessageText(
        ctx.chat?.id ?? 0,
        statusMsg.message_id,
        undefined,
        `✅ *Done*\n\n${clip(result, 3500)}`,
        { parse_mode: "Markdown" },
      )
    } catch (err: unknown) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id ?? 0,
        statusMsg.message_id,
        undefined,
        `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  })

  bot.command("memory", async (ctx) => {
    const query = commandArg(ctx.message.text, "memory")

    if (!query) {
      await ctx.reply(
        "Usage: `/memory <query>`\n\nExample: `/memory database caching decisions`\n\nSearches through long-term memory, extracted facts, daily logs, and vector storage.",
        { parse_mode: "Markdown" },
      )
      return
    }

    const statusMsg = await ctx.reply("🧠 Searching memory...")

    try {
      const { runSearch } = await import("../../modes/search")
      const result = await runSearch({ scope: "memory", query, maxResults: 5 })

      await ctx.telegram.editMessageText(ctx.chat?.id ?? 0, statusMsg.message_id, undefined, clip(result, 4000), {
        parse_mode: "Markdown",
      })
    } catch (err: unknown) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id ?? 0,
        statusMsg.message_id,
        undefined,
        `❌ Memory search error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  })

  bot.command("search", async (ctx) => {
    const raw = commandArg(ctx.message.text, "search")

    if (!raw) {
      await ctx.reply(
        "Usage: `/search <query>` — searches codebase, memory, and web\n" +
          "Use `/search code <q>` for codebase only\n" +
          "Use `/search memory <q>` for memory & facts only\n" +
          "Use `/search web <q>` for web search only\n\n" +
          "Examples:\n" +
          "`/search web latest AI news`\n" +
          "`/search memory agent manager`\n" +
          "`/search code database`\n" +
          "`/search How does the agent system work?`",
        { parse_mode: "Markdown" },
      )
      return
    }

    const scopeMatch = raw.match(/^(code|memory|web|all)\s+(.+)/i)
    const scope = (scopeMatch?.[1]?.toLowerCase() as SearchScope) || "all"
    const query = scopeMatch?.[2] || raw

    const statusMsg = await ctx.reply("🔎 Searching...")

    try {
      const { runSearch } = await import("../../modes/search")
      const result = await runSearch({ scope, query, maxResults: 8 })

      await ctx.telegram.editMessageText(ctx.chat?.id ?? 0, statusMsg.message_id, undefined, clip(result, 4000), {
        parse_mode: "Markdown",
      })
    } catch (err: unknown) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id ?? 0,
        statusMsg.message_id,
        undefined,
        `❌ Search error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  })

  bot.command("plan", async (ctx) => {
    const goal = commandArg(ctx.message.text, "plan")
    if (!goal) {
      await ctx.reply(
        "Usage: `/plan <goal>`\n\nExample: `/plan Add user authentication`" +
          "\n\nThis generates a structured plan with selectable steps.",
      )
      return
    }

    const statusMsg = await ctx.reply("🧭 Generating structured plan...")

    try {
      const { generatePlanForGoal } = await import("../../modes/plan/orchestrator")
      const { planMessage, planKeyboard, planSessions } = await import("../../modes/telegram/plan-session")

      const { plan } = await generatePlanForGoal(goal)

      const session = {
        plan,
        selected: new Set(plan.steps.map((s) => s.id)),
      }

      await ctx.telegram.editMessageText(ctx.chat?.id ?? 0, statusMsg.message_id, undefined, planMessage(session), {
        parse_mode: "Markdown",
        ...planKeyboard(session),
      })

      planSessions.set(ctx.chat?.id ?? 0, session)
    } catch (err: unknown) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id ?? 0,
        statusMsg.message_id,
        undefined,
        `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  })

  bot.command("chat", async (ctx) => {
    const msg = commandArg(ctx.message.text, "chat")
    if (!msg) {
      await ctx.reply(
        "Usage: `/chat <message>`\n\nOne-off AI chat without active session. Example:\n`/chat Explain the difference between Map and WeakMap`",
        { parse_mode: "Markdown" },
      )
      return
    }

    const statusMsg = await ctx.reply("💬 Thinking...")

    try {
      const { AIProviderManager, resolveAutoAIConfig } = await import("../../ai")
      const ai = new AIProviderManager(resolveAutoAIConfig({
        ...(process.env.AEGIS_AI_PROVIDER ? { provider: process.env.AEGIS_AI_PROVIDER as AIProvider } : {}),
        ...(process.env.AEGIS_AI_MODEL ? { model: process.env.AEGIS_AI_MODEL } : {}),
        baseUrl: process.env.AEGIS_AI_BASE_URL,
        temperature: 0.7,
      }))

      const { generateText } = await import("ai")
      const result = await generateText({
        model: ai.getModel(),
        prompt: msg,
        system:
          "You are a helpful AI assistant integrated into a development tool called Neuron OS. Answer concisely and accurately.",
      })

      await ctx.telegram.editMessageText(ctx.chat?.id ?? 0, statusMsg.message_id, undefined, clip(result.text, 4000), {
        parse_mode: "Markdown",
      })
    } catch (err: unknown) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id ?? 0,
        statusMsg.message_id,
        undefined,
        `❌ Chat error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  })

  bot.command("research", async (ctx) => {
    const raw = commandArg(ctx.message.text, "research")

    if (!raw) {
      await ctx.reply(
        "Usage: `/research <goal>`\n\n" +
          "Launches a Karpathy-style autonomous research loop that:\n" +
          "1. Explores the codebase and proposes changes\n" +
          "2. Implements and tests them\n" +
          "3. Keeps only changes that improve the outcome (ratchet mechanism)\n" +
          "4. Reverts changes that degrade it\n\n" +
          "Examples:\n" +
          "`/research Optimize the database query layer`\n" +
          "`/research Add comprehensive error handling to the API`\n" +
          "`/research Improve the test coverage for the agent module`\n\n" +
          "*Requires:* AI provider API key",
        { parse_mode: "Markdown" },
      )
      return
    }

    const statusMsg = await ctx.reply("🧪 Initializing autonomous research loop...")

    try {
      const { runResearchLoop } = await import("../../modes/research")

      const startTime = Date.now()

      const result = await runResearchLoop(
        {
          goal: raw,
          successCriteria: raw,
          maxIterations: 5,
        },
        (progress) => {
          const elapsed = Math.floor((Date.now() - startTime) / 1000)
          const progressMsg = `🧪 Research in progress...\n\n${progress.slice(0, 200)}\n\n⏱ ${elapsed}s elapsed`
          ctx.telegram
            .editMessageText(ctx.chat?.id ?? 0, statusMsg.message_id, undefined, clip(progressMsg, 4000), {
              parse_mode: "Markdown",
            })
            .catch(() => {})
        },
      )

      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      const summary = [
        `*🧬 Research Complete*`,
        ``,
        `**Goal:** ${raw.slice(0, 100)}`,
        `**Duration:** ${elapsed}s`,
        `**Iterations:** ${result.iterations.length}`,
        `**Converged:** ${result.converged ? "✅ Yes" : "❌ No"}`,
        ``,
        `### Iterations`,
        ...result.iterations.map(
          (it) =>
            `- ${it.outcome === "improved" ? "✅" : it.outcome === "degraded" ? "↩️" : "➖"} Iter ${it.iteration}: ${it.summary.slice(0, 150)}`,
        ),
      ].join("\n")

      await ctx.telegram.editMessageText(ctx.chat?.id ?? 0, statusMsg.message_id, undefined, clip(summary, 4000), {
        parse_mode: "Markdown",
      })
    } catch (err: unknown) {
      await ctx.telegram.editMessageText(
        ctx.chat?.id ?? 0,
        statusMsg.message_id,
        undefined,
        `❌ Research error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  })
}

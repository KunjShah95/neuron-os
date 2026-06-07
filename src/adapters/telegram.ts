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
import type { SearchScope } from "../modes/search"
import { clip } from "./bot-commands"

interface TelegramConfig {
  botToken: string
  allowedUserIds?: string[]
  project?: string
}

const WELCOME_MSG = [
  "👋 *Welcome to Neuron OS Bot!*",
  "",
  "I'm your AI development assistant. Here's what I can do:",
  "",
  "/ask `<question>` — Ask about the codebase via AI",
  "/search `<query>` — Multi-source search (code + memory + web)",
  "/agents — List running agents",
  "/config — System configuration",
  "/cron — List scheduled cron jobs",
  "/skill — List installed skills",
  "/models — List available AI providers & models",
  "/memory `<query>` — Recall facts and memories",
  "/logs `<name>` — View agent logs",
  "/agent `<goal>` — Let the AI modify your codebase",
  "/plan `<goal>` — Generate a step-by-step plan",
  "/chat `<message>` — One-off AI chat (requires AI key)",
  "/docs `<topic>` — Pull documentation from docs/",
  "/history — View command history",
  "/research `<goal>` — ✴️ Launch autonomous research loop (requires AI key)",
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
  "  *Requires:* AI provider API key",
  "",
  "*/search* — Multi-source search mode",
  "  Search across the codebase, memory, web, and facts.",
  "  *No AI provider needed.*",
  "  Examples:",
  "  `/search memory authentication` — Search memory & facts",
  "  `/search code database schema` — Search codebase source",
  "  `/search web latest AI news` — Search the web",
  "  `/search all agent manager` — Search everything at once",
  "",
  "*/agent* — AI agent mode",
  "  The agent can read, create, modify, and delete files.",
  "  *All mutations are staged for your approval* before being applied.",
  "  Example: `/agent Add a health check endpoint to the API`",
  "  *Requires:* AI provider API key",
  "",
  "*/plan* — Planning mode",
  "  Generate a detailed step-by-step implementation plan without",
  "  making any changes. Example:",
  "  `/plan Add user authentication with JWT`",
  "  *Requires:* AI provider API key",
  "",
  "*/agents* — List running agents",
  "  Shows all active agent processes with status, PID, and uptime.",
  "  *No AI provider needed.*",
  "",
  "*/config* — System configuration",
  "  Shows vault status, configured API keys, telemetry, and tools.",
  "  *No AI provider needed.*",
  "",
  "*/models* — List available AI providers",
  "  Shows all configured AI providers with their available models.",
  "  *No AI provider needed.*",
  "",
  "*/memory* — Quick memory recall",
  "  Search through long-term memory, facts, and daily logs.",
  "  Example: `/memory database caching decisions`",
  "  *No AI provider needed.*",
  "",
  "*/cron* — List scheduled cron jobs",
  "  Shows all cron jobs with their schedule intervals.",
  "  *No AI provider needed.*",
  "",
  "*/skill* — List installed skills",
  "  Shows all skills installed locally from ./skills/ or ~/.aegis/skills/.",
  "  *No AI provider needed.*",
  "",
  "*/logs* — View agent logs",
  "  Shows recent log entries for a specific agent.",
  "  Example: `/logs cron-health`",
  "  *No AI provider needed.*",
  "",
  "*/chat* — One-off AI chat",
  "  Send a message to the AI without an active session.",
  "  Example: `/chat Explain closures in JavaScript`",
  "  *Requires:* AI provider API key",
  "",
  "*/docs* — Pull documentation",
  "  Read documentation from the project's docs/ directory.",
  "  Example: `/docs telegram` or `/docs all` to list docs.",
  "  *No AI provider needed.*",
  "",
  "*/history* — View command history",
  "",
  "*/research* — Autonomous research loop",
  "  Launches a Karpathy-style autonomous research agent that iterates on",
  "  your codebase, keeping only changes that improve a measured outcome.",
  "  Example: `/research Optimize the database query performance`",
  "  *Requires:* AI provider API key",
  "  Shows recent CLI commands executed on this system.",
  "  *No AI provider needed.*",
  "",
  "*/status* — Check system status",
  "  Shows the current state of agents, memory, and tools.",
  "  *No AI provider needed.*",
].join("\n")

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
    if (config.allowedUserIds && config.allowedUserIds.length > 0 && !config.allowedUserIds.includes(userId)) {
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
      await ctx.reply("Usage: `/ask <question>`\n\nExample: `/ask How does the agent system work?`", {
        parse_mode: "Markdown",
      })
      return
    }

    const statusMsg = await ctx.reply("🔍 Researching your question...")

    try {
      // Import dynamically to avoid circular deps
      const { runAskOrchestrator } = await import("../modes/ask")
      const answer = await runAskOrchestrator(question, undefined, config.project)

      await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, clip(answer, 4000), {
        parse_mode: "Markdown",
      })
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
      await ctx.reply("Usage: `/agent <goal>`\n\nExample: `/agent Add a health check endpoint`", {
        parse_mode: "Markdown",
      })
      return
    }

    const statusMsg = await ctx.reply("🤖 Starting agent session...")

    try {
      const { runAgentOrchestrator } = await import("../modes/agent-run")
      const result = await runAgentOrchestrator(
        goal,
        {
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
            // Entries are auto-evicted after 5 minutes via cleanup interval
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

  // ── /models ───────────────────────────────────────────────────────
  bot.command("models", async (ctx) => {
    const { MODEL_REFERENCES } = await import("../ai/models")
    const { listProviders } = await import("../ai/providers")

    const registered = listProviders()
    const lines: string[] = ["*🤖 Available AI Providers*", ""]

    for (const provider of registered) {
      const refs = (MODEL_REFERENCES as Record<string, any>)[provider]
      const models = refs?.length
        ? refs
            .slice(0, 4)
            .map((m: any) => `  • \`${m.id}\` — ${m.label}`)
            .join("\n")
        : "  • (custom models)"
      lines.push(`*${provider.charAt(0).toUpperCase() + provider.slice(1)}*`)
      lines.push(models)
      lines.push("")
    }

    lines.push(`_${registered.length} providers registered_`)
    lines.push("")
    lines.push("Configure keys: `aegis setup-keys`")

    await ctx.reply(clip(lines.join("\n"), 4000), { parse_mode: "Markdown" })
  })

  // ── /memory ────────────────────────────────────────────────────────
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
      // Reuse the search orchestrator (no AI provider needed)
      const { runSearch } = await import("../modes/search")
      const result = await runSearch({ scope: "memory", query, maxResults: 5 })

      await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, clip(result, 4000), {
        parse_mode: "Markdown",
      })
    } catch (err: any) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        `❌ Memory search error: ${err.message ?? String(err)}`,
      )
    }
  })

  // ── /search ────────────────────────────────────────────────────────
  bot.command("search", async (ctx) => {
    // Parse: /search [scope] <query>
    // Scope can be: code, memory, web, or all (default: all)
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

    // Detect scope prefix
    const scopeMatch = raw.match(/^(code|memory|web|all)\s+(.+)/i)
    const scope = (scopeMatch?.[1]?.toLowerCase() as SearchScope) || "all"
    const query = scopeMatch?.[2] || raw

    const statusMsg = await ctx.reply("🔎 Searching...")

    try {
      const { runSearch } = await import("../modes/search")
      const result = await runSearch({ scope, query, maxResults: 8 })

      await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, clip(result, 4000), {
        parse_mode: "Markdown",
      })
    } catch (err: any) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        `❌ Search error: ${err.message ?? String(err)}`,
      )
    }
  })

  // ── /plan ──────────────────────────────────────────────────────────
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
      // Use the new plan system with structured steps
      const { generatePlanForGoal } = await import("../modes/plan/orchestrator")
      const { planMessage, planKeyboard, planSessions } = await import("../modes/telegram/plan-session")

      const { plan } = await generatePlanForGoal(goal)

      // Create session with all steps initially selected
      const session = {
        plan,
        selected: new Set(plan.steps.map((s: any) => s.id)),
      }

      await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, planMessage(session), {
        parse_mode: "Markdown",
        ...planKeyboard(session),
      })

      planSessions.set(ctx.chat!.id, session)
    } catch (err: any) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        `❌ Error: ${err.message ?? String(err)}`,
      )
    }
  })

  // ── /chat ─────────────────────────────────────────────────────────
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
      const { AIProviderManager } = await import("../ai")
      const ai = new AIProviderManager({
        provider: (process.env.AEGIS_AI_PROVIDER ?? "openai") as any,
        model: process.env.AEGIS_AI_MODEL ?? "gpt-4o",
        apiKey: process.env.AEGIS_AI_API_KEY,
        baseUrl: process.env.AEGIS_AI_BASE_URL,
        temperature: 0.7,
      })

      const { generateText } = await import("ai")
      const result = await generateText({
        model: ai.getModel(),
        prompt: msg,
        system:
          "You are a helpful AI assistant integrated into a development tool called Neuron OS. Answer concisely and accurately.",
      })

      await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, clip(result.text, 4000), {
        parse_mode: "Markdown",
      })
    } catch (err: any) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        `❌ Chat error: ${err.message ?? String(err)}`,
      )
    }
  })

  // ── /docs ─────────────────────────────────────────────────────────
  bot.command("docs", async (ctx) => {
    const topic = commandArg(ctx.message.text, "docs")

    if (!topic) {
      await ctx.reply(
        "Usage: `/docs <topic>`\n\nPull documentation from the project docs directory.\n\nExample:\n`/docs telegram` — shows Telegram docs\n`/docs architecture` — shows architecture docs\n`/docs all` — lists all available docs",
        { parse_mode: "Markdown" },
      )
      return
    }

    try {
      const { readFile, readdir } = await import("node:fs/promises")
      const { resolve } = await import("node:path")
      const { existsSync } = await import("node:fs")

      const docsDir = resolve(process.cwd(), "docs")

      if (topic === "all" || topic === "list") {
        if (!existsSync(docsDir)) {
          await ctx.reply("📚 No docs directory found.")
          return
        }
        const files = await readdir(docsDir)
        const mdFiles = files.filter((f: string) => f.endsWith(".md"))

        if (mdFiles.length === 0) {
          await ctx.reply("📚 No `.md` files found in the docs directory.")
          return
        }

        const lines = ["*📚 Available Documentation*", ""]
        for (const file of mdFiles) {
          const name = file.replace(/\.md$/, "")
          lines.push(`• \`/docs ${name}\``)
        }

        await ctx.reply(clip(lines.join("\n"), 4000), { parse_mode: "Markdown" })
        return
      }

      // Try exact match and case-insensitive match
      const filePath = resolve(docsDir, `${topic}.md`)
      let content: string | null = null

      if (existsSync(filePath)) {
        content = await readFile(filePath, "utf-8")
      } else {
        // Case-insensitive search
        if (existsSync(docsDir)) {
          const files = await readdir(docsDir)
          const match = files.find((f: string) => f.toLowerCase() === `${topic.toLowerCase()}.md`)
          if (match) {
            content = await readFile(resolve(docsDir, match), "utf-8")
          }
        }
      }

      if (!content) {
        await ctx.reply(`❌ Documentation for "${topic}" not found.\nUse \`/docs all\` to see available docs.`)
        return
      }

      // Strip frontmatter if present
      const cleanContent = content.replace(/^---[\s\S]*?---\n*/, "")

      await ctx.reply(clip(cleanContent, 4000), { parse_mode: "Markdown" })
    } catch (err: any) {
      await ctx.reply(`❌ Docs error: ${err.message ?? String(err)}`)
    }
  })

  // ── /research ────────────────────────────────────────────────────
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
      const { runResearchLoop } = await import("../modes/research")

      const startTime = Date.now()

      // Run the research loop with progress updates via edit
      const result = await runResearchLoop(
        {
          goal: raw,
          successCriteria: raw,
          maxIterations: 5,
        },
        (progress) => {
          // Send progress update via edit the status message (limited to ~10 updates)
          const elapsed = Math.floor((Date.now() - startTime) / 1000)
          const progressMsg = `🧪 Research in progress...\n\n${progress.slice(0, 200)}\n\n⏱ ${elapsed}s elapsed`
          ctx.telegram
            .editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, clip(progressMsg, 4000), {
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

      await ctx.telegram.editMessageText(ctx.chat!.id, statusMsg.message_id, undefined, clip(summary, 4000), {
        parse_mode: "Markdown",
      })
    } catch (err: any) {
      await ctx.telegram.editMessageText(
        ctx.chat!.id,
        statusMsg.message_id,
        undefined,
        `❌ Research error: ${err.message ?? String(err)}`,
      )
    }
  })

  // ── /history ──────────────────────────────────────────────────────
  bot.command("history", async (ctx) => {
    try {
      // Show recently used commands from config/session store
      const { readFile } = await import("node:fs/promises")
      const { resolve } = await import("node:path")
      const { existsSync } = await import("node:fs")

      const historyFile = resolve(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "command-history.json")

      if (!existsSync(historyFile)) {
        await ctx.reply(
          "*📜 Command History*\n\nNo command history recorded yet.\n\nYour recent commands will appear here as you use the CLI.",
          { parse_mode: "Markdown" },
        )
        return
      }

      const raw = await readFile(historyFile, "utf-8")
      const entries: Array<{ command: string; timestamp: string; args?: string }> = JSON.parse(raw)

      if (entries.length === 0) {
        await ctx.reply("*📜 Command History*\n\nNo commands recorded yet.", { parse_mode: "Markdown" })
        return
      }

      const lines = [`*📜 Command History (last ${Math.min(entries.length, 20)})*`, ""]

      const recent = entries.slice(-20).reverse()
      for (const entry of recent) {
        const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString().slice(0, 16) : ""
        const cmd = entry.args ? `${entry.command} ${entry.args}` : entry.command
        lines.push(`• \`${time}\` — \`${cmd.slice(0, 60)}\``)
      }

      await ctx.reply(clip(lines.join("\n"), 4000), { parse_mode: "Markdown" })
    } catch (err: any) {
      await ctx.reply(`❌ History error: ${err.message ?? String(err)}`)
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

  // ── /config ────────────────────────────────────────────────────────
  bot.command("config", async (ctx) => {
    try {
      const { credentialVault } = await import("../vault/manager")
      const { getTelemetryStats } = await import("../telemetry/index")
      const { toolRegistry } = await import("../tools/registry")

      const allEntries = await credentialVault.list()
      const globalEntries = allEntries.filter((e) => e.scope === "global")
      const telemetry = getTelemetryStats()
      const tools = toolRegistry.list()

      // Show env var keys (mask values) for global entries
      const envLines =
        globalEntries.length > 0
          ? globalEntries.map((e) => `  • \`${e.key}\` — set`).join("\n")
          : "  • (none configured)"

      const lines = [
        "*⚙️ System Configuration*",
        "",
        "*Credential Vault*",
        `  • Encrypted: ${credentialVault.isEncrypted() ? "✅ Yes (AES-256-GCM)" : "⚠️ No"}`,
        `  • Global entries: ${globalEntries.length}`,
        `  • Total entries: ${allEntries.length}`,
        "",
        "*API Keys Configured*",
        envLines,
        "",
        "*Telemetry*",
        `  • Opted in: ${telemetry.optedIn ? "✅ Yes" : "❌ No"}`,
        `  • Queue: ${telemetry.queueSize} events pending`,
        "",
        "*Tools*",
        `  • ${tools.length} tools registered`,
        tools
          .slice(0, 10)
          .map((t) => `  • \`${t.name}\` — ${t.description}`)
          .join("\n"),
        "",
        "_Configure: `aegis setup-keys`_",
      ].join("\n")

      await ctx.reply(clip(lines, 4000), { parse_mode: "Markdown" })
    } catch (err: any) {
      await ctx.reply(`❌ Config error: ${err.message ?? String(err)}`)
    }
  })

  // ── /cron ──────────────────────────────────────────────────────────
  bot.command("cron", async (ctx) => {
    try {
      const { listActiveJobs } = await import("../cron/engine")
      const jobs = await listActiveJobs()

      if (jobs.length === 0) {
        await ctx.reply(
          "*⏰ Cron Jobs*\n\nNo cron jobs scheduled.\n\nAdd one with:\n`aegis cron add <name> <schedule> <goal>`\n\nSchedules: `30m`, `1h`, `6h`, `12h`, `1d`",
          { parse_mode: "Markdown" },
        )
        return
      }

      const lines = [`*⏰ Cron Jobs (${jobs.length})*`, ""]
      for (const job of jobs) {
        const typeInfo = job.agentType ? ` [${job.agentType}]` : ""
        lines.push(`*${job.name}* — every \`${job.schedule}\`${typeInfo}`)
        lines.push(`  ${job.goal.slice(0, 120)}`)
        lines.push("")
      }

      await ctx.reply(clip(lines.join("\n"), 4000), { parse_mode: "Markdown" })
    } catch (err: any) {
      await ctx.reply(`❌ Cron error: ${err.message ?? String(err)}`)
    }
  })

  // ── /skill ─────────────────────────────────────────────────────────
  bot.command("skill", async (ctx) => {
    try {
      const { skillRegistry } = await import("../skills/registry")
      const manifest = skillRegistry.getManifest()

      if (manifest.length === 0) {
        await ctx.reply(
          "*🧩 Installed Skills*\n\nNo skills installed.\n\nSkills go in `./skills/<name>/SKILL.md` or at `~/.aegis/skills/<name>/SKILL.md`.\n\nBrowse the registry: https://skills.sh",
          { parse_mode: "Markdown" },
        )
        return
      }

      const lines = [`*🧩 Installed Skills (${manifest.length})*`, ""]
      for (const skill of manifest) {
        const desc = skill.description ? ` — ${skill.description}` : ""
        lines.push(`• *${skill.name}*${desc}`)
      }

      await ctx.reply(clip(lines.join("\n"), 4000), { parse_mode: "Markdown" })
    } catch (err: any) {
      await ctx.reply(`❌ Skill error: ${err.message ?? String(err)}`)
    }
  })

  // ── /agents ────────────────────────────────────────────────────────
  bot.command("agents", async (ctx) => {
    try {
      const { agentManager } = await import("../agent/manager")
      const agents = agentManager.list()

      if (agents.length === 0) {
        await ctx.reply(
          "*🤖 Running Agents*\n\nNo agents running.\n\nSpawn with `/agent <goal>` or via `aegis agent spawn`.",
          { parse_mode: "Markdown" },
        )
        return
      }

      const lines = [`*🤖 Running Agents (${agents.length})*`, ""]

      for (const a of agents) {
        const emoji =
          a.status === "running"
            ? "🟢"
            : a.status === "spawning"
              ? "🟡"
              : a.status === "idle"
                ? "🔵"
                : a.status === "busy"
                  ? "🟠"
                  : a.status === "error"
                    ? "🔴"
                    : "⚪"
        const uptime = a.spawnTime ? `${Math.floor((Date.now() - a.spawnTime) / 1000)}s` : "-"
        const typeInfo = a.def.agentType ? ` [${a.def.agentType}]` : ""
        const tagInfo = a.def.tags?.length ? ` \`${a.def.tags.join("` `")}\`` : ""
        lines.push(`• \`${a.def.name}\`${typeInfo}`)
        lines.push(`  ${emoji} \`${a.status}\` · pid \`${a.pid}\` · uptime ${uptime}${tagInfo}`)
        lines.push("")
      }

      lines.push("Use `/logs <name>` to see agent logs.")

      await ctx.reply(clip(lines.join("\n"), 4000), { parse_mode: "Markdown" })
    } catch (err: any) {
      await ctx.reply(`❌ Agents error: ${err.message ?? String(err)}`)
    }
  })

  // ── /logs ──────────────────────────────────────────────────────────
  bot.command("logs", async (ctx) => {
    const arg = commandArg(ctx.message.text, "logs")

    if (!arg) {
      await ctx.reply(
        "Usage: `/logs <agent-name>`\n\nShows the last 10 log entries for a running agent.\nUse `/agents` to see active agent names.\n\nExamples:\n`/logs cron-health` — shows logs for that agent",
        { parse_mode: "Markdown" },
      )
      return
    }

    try {
      const { agentManager } = await import("../agent/manager")

      // Try to find agent by name first, then by id
      let target = agentManager.findAgentByName(arg)
      if (!target) {
        const all = agentManager.list()
        target = all.find((a) => a.id === arg || a.def.name === arg)
      }

      if (!target) {
        await ctx.reply(`❌ Agent "${arg}" not found.\nUse \`/agents\` to see running agents.`, {
          parse_mode: "Markdown",
        })
        return
      }

      const logs = agentManager.getLogs(target.id, { tail: 15 })

      if (logs.length === 0) {
        await ctx.reply(`*📋 Logs for \`${target.def.name}\`*\n\nNo log entries yet.`, { parse_mode: "Markdown" })
        return
      }

      const lines = [`*📋 Logs for \`${target.def.name}\`*`, `Status: \`${target.status}\``, ""]

      for (const entry of logs) {
        const levelEmoji =
          entry.level === "error" ? "🔴" : entry.level === "warn" ? "🟡" : entry.level === "success" ? "🟢" : "⚪"
        const time = entry.timestamp ? new Date(entry.timestamp).toISOString().slice(11, 19) : ""
        lines.push(`${levelEmoji} \`${time}\` ${entry.text.slice(0, 200)}`)
      }

      await ctx.reply(clip(lines.join("\n"), 4000), { parse_mode: "Markdown" })
    } catch (err: any) {
      await ctx.reply(`❌ Logs error: ${err.message ?? String(err)}`)
    }
  })

  // ── Inline keyboard callbacks ──────────────────────────────────────
  // Stores approval resolvers keyed by Telegram message_id.
  // Entries older than 5 minutes are automatically evicted to prevent
  // memory leaks from abandoned sessions.
  const approvalCallbacks = new Map<number, { resolve: (approved: boolean) => void; createdAt: number }>()

  // Periodic cleanup every 60s to evict stale callback entries
  const TTL_MS = 5 * 60 * 1000
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [msgId, entry] of approvalCallbacks) {
      if (now - entry.createdAt > TTL_MS) {
        approvalCallbacks.delete(msgId)
      }
    }
  }, 60_000)

  // ── Plan step selection callbacks ────────────────────────────────
  bot.action(/^plan_toggle:(.+)$/, async (ctx) => {
    const { planSessions, refreshPlanUi } = await import("../modes/telegram/plan-session")
    const s = planSessions.get(ctx.chat!.id)
    if (!s) return ctx.answerCbQuery("No active plan session")

    const id = ctx.match[1]!
    if (s.selected.has(id)) s.selected.delete(id)
    else s.selected.add(id)

    await refreshPlanUi(ctx, s)
    await ctx.answerCbQuery()
  })

  bot.action("plan_all", async (ctx) => {
    const { planSessions, refreshPlanUi } = await import("../modes/telegram/plan-session")
    const s = planSessions.get(ctx.chat!.id)
    if (!s) return ctx.answerCbQuery("No active plan session")

    for (const step of s.plan.steps) s.selected.add(step.id)
    await refreshPlanUi(ctx, s)
    await ctx.answerCbQuery()
  })

  bot.action("plan_none", async (ctx) => {
    const { planSessions, refreshPlanUi } = await import("../modes/telegram/plan-session")
    const s = planSessions.get(ctx.chat!.id)
    if (!s) return ctx.answerCbQuery("No active plan session")

    s.selected.clear()
    await refreshPlanUi(ctx, s)
    await ctx.answerCbQuery()
  })

  bot.action("plan_proceed", async (ctx) => {
    const { planSessions } = await import("../modes/telegram/plan-session")
    const { runPlanSteps } = await import("../modes/telegram/agent-run")
    const s = planSessions.get(ctx.chat!.id)
    if (!s) return ctx.answerCbQuery("No active plan session")

    const steps = s.plan.steps.filter((step: any) => s.selected.has(step.id))
    if (steps.length === 0) return ctx.answerCbQuery("No steps selected")

    const { plan } = s
    planSessions.delete(ctx.chat!.id)

    const list = steps.map((step: any, i: number) => `${i + 1}. ${step.title}`).join("\n")
    await ctx.editMessageText(`🚀 Executing ${steps.length} step(s)…\n\n${list}`)
    await ctx.answerCbQuery()

    void runPlanSteps(ctx, ctx.chat!.id, plan, steps).catch((err: any) => {
      ctx.reply(`❌ Execution error: ${err.message ?? String(err)}`)
    })
  })

  // ── Agent approval callbacks ─────────────────────────────────────
  bot.action(/agent_diff:(\d+)/, async (ctx) => {
    await ctx.answerCbQuery("Generating diff...")
    await ctx.reply("📋 Diff view would be shown here (requires storing staged actions per session)")
  })

  bot.action(/agent_accept:(\d+)/, async (ctx) => {
    const msgId = parseInt(ctx.match[1]!, 10)
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
    const msgId = parseInt(ctx.match[1]!, 10)
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

  // ── Approval session callbacks (for approval-session.ts) ───────────
  bot.action("approval_diff", async (ctx) => {
    const { approvalSessions, approvalDiff } = await import("../modes/telegram/approval-session")
    const s = approvalSessions.get(ctx.chat!.id)
    if (!s) return ctx.answerCbQuery("No active approval session")

    await ctx.answerCbQuery()
    const diff = approvalDiff(s.pending)
    await ctx.reply(diff || "(no diff available)")
  })

  bot.action("approval_accept", async (ctx) => {
    const { approvalSessions } = await import("../modes/telegram/approval-session")
    const s = approvalSessions.get(ctx.chat!.id)
    if (!s) return ctx.answerCbQuery("No active approval session")

    approvalSessions.delete(ctx.chat!.id)
    for (const a of s.pending) s.tracker.approve(a.id)
    s.executor.applyApproved()
    s.executor.clearStaging()

    await ctx.editMessageText("✅ All changes applied.")
    await ctx.answerCbQuery("Applied!")
  })

  bot.action("approval_reject", async (ctx) => {
    const { approvalSessions } = await import("../modes/telegram/approval-session")
    const s = approvalSessions.get(ctx.chat!.id)
    if (!s) return ctx.answerCbQuery("No active approval session")

    approvalSessions.delete(ctx.chat!.id)
    for (const a of s.pending) s.tracker.reject(a.id)
    s.executor.clearStaging()

    await ctx.editMessageText("❌ All changes rejected. Nothing was applied.")
    await ctx.answerCbQuery("Rejected")
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
      clearInterval(cleanupInterval)
      approvalCallbacks.clear()
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

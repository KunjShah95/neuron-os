/**
 * Shared bot command handlers — platform-agnostic command execution.
 *
 * Each handler takes (args, project?) and returns display text.
 * Platform adapters (Telegram, Discord, Slack, etc.) call these handlers
 * and render the results using their own APIs.
 */

import type { SearchScope } from "../modes/search"

// ── Text Constants ───────────────────────────────────────────────────────

export const WELCOME_MSG = [
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

export const HELP_MSG = [
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

// ── Utility Functions ─────────────────────────────────────────────────────

/** Clip long messages to a character limit */
export function clip(text: string, max = 4000, suffix = "\n…[truncated]"): string {
  return text.length <= max ? text : text.slice(0, max) + suffix
}

/**
 * Clip text for Twilio-based platforms (SMS, WhatsApp).
 * Strips markdown bold markers and clips to a reasonable length.
 */
export function clipTwilio(text: string, max = 1600): string {
  const cleaned = text.replace(/\*([^*]+)\*/g, "$1")
  return cleaned.length <= max ? cleaned : cleaned.slice(0, max) + "\n…[truncated]"
}

/** Get text after /command */
export function commandArg(text: string, command: string): string {
  return text.replace(new RegExp(`^/${command}\\s*`, "i"), "").trim()
}

// ── Command Handler Results ──────────────────────────────────────────────

export interface CommandResult {
  /** Text to display */
  text: string
  /** Optional messageId if the result is an edit of a previous status message */
  editMessageId?: string
}

// ── Command Handlers ─────────────────────────────────────────────────────

/** /ask — Read-only research question about the codebase */
export async function handleAsk(question: string, project?: string): Promise<CommandResult> {
  if (!question) {
    return {
      text: "Usage: `/ask <question>`\n\nExample: `/ask How does the agent system work?`",
    }
  }

  try {
    const { runAskOrchestrator } = await import("../modes/ask")
    const answer = await runAskOrchestrator(question, undefined, project)
    return { text: clip(answer, 4000) }
  } catch (err: unknown) {
    return { text: `❌ Error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/**
 * /agent — Let the agent modify your codebase.
 *
 * ⚠️ For non-Telegram platforms, this auto-APPROVES all file changes.
 * Platform-specific adapters (Telegram) should implement their own
 * onStaged handler with inline approval UI for security.
 */
export async function handleAgent(goal: string, project?: string): Promise<CommandResult> {
  if (!goal) {
    return {
      text: "Usage: `/agent <goal>`\n\nExample: `/agent Add a health check endpoint`",
    }
  }

  try {
    const { runAgentOrchestrator } = await import("../modes/agent-run")
    const result = await runAgentOrchestrator(
      goal,
      {
        onStaged: async (_pending) => {
          // ⚠️ AUTO-APPROVAL: All staged changes are automatically applied.
          // This is the default for text-only platforms (Discord, Slack, etc.)
          // that cannot render interactive approval UIs.
          // Each adapter can override handleAgent to implement platform-specific
          // approval flows (e.g., Telegram's inline keyboards).
          return true
        },
      },
      project,
    )
    return { text: `✅ *Done*\n\n${clip(result, 3500)}` }
  } catch (err: unknown) {
    return { text: `❌ Error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /models — List available AI providers and models */
export async function handleModels(): Promise<CommandResult> {
  const { MODEL_REFERENCES } = await import("../ai/models")
  const { listProviders } = await import("../ai/providers")

  const registered = listProviders()
  const lines: string[] = ["*🤖 Available AI Providers*", ""]

  for (const provider of registered) {
    const refs = (MODEL_REFERENCES as Record<string, { id: string; label: string }[]>)[provider]
    const models = refs?.length
      ? refs
          .slice(0, 4)
          .map((m) => `  • \`${m.id}\` — ${m.label}`)
          .join("\n")
      : "  • (custom models)"
    lines.push(`*${provider.charAt(0).toUpperCase() + provider.slice(1)}*`)
    lines.push(models)
    lines.push("")
  }

  lines.push(`_${registered.length} providers registered_`)
  lines.push("")
  lines.push("Configure keys: `aegis setup-keys`")

  return { text: clip(lines.join("\n"), 4000) }
}

/** /memory — Search through long-term memory */
export async function handleMemory(query: string): Promise<CommandResult> {
  if (!query) {
    return {
      text: "Usage: `/memory <query>`\n\nExample: `/memory database caching decisions`\n\nSearches through long-term memory, extracted facts, daily logs, and vector storage.",
    }
  }

  try {
    const { runSearch } = await import("../modes/search")
    const result = await runSearch({ scope: "memory", query, maxResults: 5 })
    return { text: clip(result, 4000) }
  } catch (err: unknown) {
    return { text: `❌ Memory search error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /search — Multi-source search (code, memory, web) */
export async function handleSearch(raw: string): Promise<CommandResult> {
  if (!raw) {
    return {
      text:
        "Usage: `/search <query>` — searches codebase, memory, and web\n" +
        "Use `/search code <q>` for codebase only\n" +
        "Use `/search memory <q>` for memory & facts only\n" +
        "Use `/search web <q>` for web search only\n\n" +
        "Examples:\n" +
        "`/search web latest AI news`\n" +
        "`/search memory agent manager`\n" +
        "`/search code database`\n" +
        "`/search How does the agent system work?`",
    }
  }

  const scopeMatch = raw.match(/^(code|memory|web|all)\s+(.+)/i)
  const scope = (scopeMatch?.[1]?.toLowerCase() as SearchScope) || "all"
  const query = scopeMatch?.[2] || raw

  try {
    const { runSearch } = await import("../modes/search")
    const result = await runSearch({ scope, query, maxResults: 8 })
    return { text: clip(result, 4000) }
  } catch (err: unknown) {
    return { text: `❌ Search error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /plan — Generate a structured implementation plan */
export async function handlePlan(goal: string): Promise<CommandResult> {
  if (!goal) {
    return {
      text: "Usage: `/plan <goal>`\n\nExample: `/plan Add user authentication`\n\nThis generates a structured plan with selectable steps.",
    }
  }

  try {
    const { generatePlanForGoal } = await import("../modes/plan/orchestrator")
    const { plan } = await generatePlanForGoal(goal)

    const steps = plan.steps.map((s, i: number) => `${i + 1}. *${s.description || "(step)"}*`).join("\n\n")

    return {
      text: `*📋 Plan: ${plan.goal}*\n\n${steps}\n\n_${plan.steps.length} steps generated_`,
    }
  } catch (err: unknown) {
    return { text: `❌ Error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /chat — One-off AI chat */
export async function handleChat(msg: string): Promise<CommandResult> {
  if (!msg) {
    return {
      text: "Usage: `/chat <message>`\n\nOne-off AI chat without active session. Example:\n`/chat Explain the difference between Map and WeakMap`",
    }
  }

  try {
    const { AIProviderManager } = await import("../ai")
    const ai = new AIProviderManager({
      provider: (process.env.AEGIS_AI_PROVIDER ?? "openai") as import("../ai").AIProvider,
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

    return { text: clip(result.text, 4000) }
  } catch (err: unknown) {
    return { text: `❌ Chat error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /docs — Pull documentation from the docs/ directory */
export async function handleDocs(topic: string): Promise<CommandResult> {
  if (!topic) {
    return {
      text: "Usage: `/docs <topic>`\n\nPull documentation from the project docs directory.\n\nExample:\n`/docs telegram` — shows Telegram docs\n`/docs architecture` — shows architecture docs\n`/docs all` — lists all available docs",
    }
  }

  try {
    const { readFile, readdir } = await import("node:fs/promises")
    const { resolve } = await import("node:path")
    const { existsSync } = await import("node:fs")

    const docsDir = resolve(process.cwd(), "docs")

    if (topic === "all" || topic === "list") {
      if (!existsSync(docsDir)) {
        return { text: "📚 No docs directory found." }
      }
      const files = await readdir(docsDir)
      const mdFiles = files.filter((f: string) => f.endsWith(".md"))

      if (mdFiles.length === 0) {
        return { text: "📚 No `.md` files found in the docs directory." }
      }

      const lines = ["*📚 Available Documentation*", ""]
      for (const file of mdFiles) {
        const name = file.replace(/\.md$/, "")
        lines.push(`• \`/docs ${name}\``)
      }

      return { text: clip(lines.join("\n"), 4000) }
    }

    const filePath = resolve(docsDir, `${topic}.md`)
    let content: string | null = null

    if (existsSync(filePath)) {
      content = await readFile(filePath, "utf-8")
    } else if (existsSync(docsDir)) {
      const files = await readdir(docsDir)
      const match = files.find((f: string) => f.toLowerCase() === `${topic.toLowerCase()}.md`)
      if (match) {
        content = await readFile(resolve(docsDir, match), "utf-8")
      }
    }

    if (!content) {
      return {
        text: `❌ Documentation for "${topic}" not found.\nUse \`/docs all\` to see available docs.`,
      }
    }

    const cleanContent = content.replace(/^---[\s\S]*?---\n*/, "")
    return { text: clip(cleanContent, 4000) }
  } catch (err: unknown) {
    return { text: `❌ Docs error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /research — Launch autonomous research loop */
export async function handleResearch(raw: string): Promise<CommandResult> {
  if (!raw) {
    return {
      text:
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
    }
  }

  try {
    const { runResearchLoop } = await import("../modes/research")
    const startTime = Date.now()

    const result = await runResearchLoop(
      {
        goal: raw,
        successCriteria: raw,
        maxIterations: 5,
      },
      () => {
        // Progress updates are platform-specific; basic text response below
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

    return { text: clip(summary, 4000) }
  } catch (err: unknown) {
    return { text: `❌ Research error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /history — View command history */
export async function handleHistory(): Promise<CommandResult> {
  try {
    const { readFile } = await import("node:fs/promises")
    const { resolve } = await import("node:path")
    const { existsSync } = await import("node:fs")

    const historyFile = resolve(process.env.HOME || process.env.USERPROFILE || "~", ".aegis", "command-history.json")

    if (!existsSync(historyFile)) {
      return {
        text: "*📜 Command History*\n\nNo command history recorded yet.\n\nYour recent commands will appear here as you use the CLI.",
      }
    }

    const raw = await readFile(historyFile, "utf-8")
    const entries: Array<{ command: string; timestamp: string; args?: string }> = JSON.parse(raw)

    if (entries.length === 0) {
      return { text: "*📜 Command History*\n\nNo commands recorded yet." }
    }

    const lines = [`*📜 Command History (last ${Math.min(entries.length, 20)})*`, ""]

    const recent = entries.slice(-20).reverse()
    for (const entry of recent) {
      const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString().slice(0, 16) : ""
      const cmd = entry.args ? `${entry.command} ${entry.args}` : entry.command
      lines.push(`• \`${time}\` — \`${cmd.slice(0, 60)}\``)
    }

    return { text: clip(lines.join("\n"), 4000) }
  } catch (err: unknown) {
    return { text: `❌ History error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /status — Check agent system status */
export async function handleStatus(): Promise<CommandResult> {
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
  return { text: lines.join("\n") }
}

/** /config — Show system configuration */
export async function handleConfig(): Promise<CommandResult> {
  try {
    const { credentialVault } = await import("../vault/manager")
    const { getTelemetryStats } = await import("../telemetry/index")
    const { toolRegistry } = await import("../tools/registry")

    const allEntries = await credentialVault.list()
    const globalEntries = allEntries.filter((e) => e.scope === "global")
    const telemetry = getTelemetryStats()
    const tools = toolRegistry.list()

    const envLines =
      globalEntries.length > 0 ? globalEntries.map((e) => `  • \`${e.key}\` — set`).join("\n") : "  • (none configured)"

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

    return { text: clip(lines, 4000) }
  } catch (err: unknown) {
    return { text: `❌ Config error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /cron — List scheduled cron jobs */
export async function handleCron(): Promise<CommandResult> {
  try {
    const { listActiveJobs } = await import("../cron/engine")
    const jobs = await listActiveJobs()

    if (jobs.length === 0) {
      return {
        text: "*⏰ Cron Jobs*\n\nNo cron jobs scheduled.\n\nAdd one with:\n`aegis cron add <name> <schedule> <goal>`\n\nSchedules: `30m`, `1h`, `6h`, `12h`, `1d`",
      }
    }

    const lines = [`*⏰ Cron Jobs (${jobs.length})*`, ""]
    for (const job of jobs) {
      const typeInfo = job.agentType ? ` [${job.agentType}]` : ""
      lines.push(`*${job.name}* — every \`${job.schedule}\`${typeInfo}`)
      lines.push(`  ${job.goal.slice(0, 120)}`)
      lines.push("")
    }

    return { text: clip(lines.join("\n"), 4000) }
  } catch (err: unknown) {
    return { text: `❌ Cron error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /skill — List installed skills */
export async function handleSkill(): Promise<CommandResult> {
  try {
    const { skillRegistry } = await import("../skills/registry")
    const manifest = skillRegistry.getManifest()

    if (manifest.length === 0) {
      return {
        text: "*🧩 Installed Skills*\n\nNo skills installed.\n\nSkills go in `./skills/<name>/SKILL.md` or at `~/.aegis/skills/<name>/SKILL.md`.\n\nBrowse the registry: https://skills.sh",
      }
    }

    const lines = [`*🧩 Installed Skills (${manifest.length})*`, ""]
    for (const skill of manifest) {
      const desc = skill.description ? ` — ${skill.description}` : ""
      lines.push(`• *${skill.name}*${desc}`)
    }

    return { text: clip(lines.join("\n"), 4000) }
  } catch (err: unknown) {
    return { text: `❌ Skill error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /agents — List running agent processes */
export async function handleAgents(): Promise<CommandResult> {
  try {
    const { agentManager } = await import("../agent/manager")
    const agents = agentManager.list()

    if (agents.length === 0) {
      return {
        text: "*🤖 Running Agents*\n\nNo agents running.\n\nSpawn with `/agent <goal>` or via `aegis agent spawn`.",
      }
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
    return { text: clip(lines.join("\n"), 4000) }
  } catch (err: unknown) {
    return { text: `❌ Agents error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** /logs — View agent logs */
export async function handleLogs(arg: string): Promise<CommandResult> {
  if (!arg) {
    return {
      text: "Usage: `/logs <agent-name>`\n\nShows the last 10 log entries for a running agent.\nUse `/agents` to see active agent names.\n\nExamples:\n`/logs cron-health` — shows logs for that agent",
    }
  }

  try {
    const { agentManager } = await import("../agent/manager")

    let target = agentManager.findAgentByName(arg)
    if (!target) {
      const all = agentManager.list()
      target = all.find((a) => a.id === arg || a.def.name === arg)
    }

    if (!target) {
      return {
        text: `❌ Agent "${arg}" not found.\nUse \`/agents\` to see running agents.`,
      }
    }

    const logs = agentManager.getLogs(target.id, { tail: 15 })

    if (logs.length === 0) {
      return {
        text: `*📋 Logs for \`${target.def.name}\`*\n\nNo log entries yet.`,
      }
    }

    const lines = [`*📋 Logs for \`${target.def.name}\`*`, `Status: \`${target.status}\``, ""]

    for (const entry of logs) {
      const levelEmoji =
        entry.level === "error" ? "🔴" : entry.level === "warn" ? "🟡" : entry.level === "success" ? "🟢" : "⚪"
      const time = entry.timestamp ? new Date(entry.timestamp).toISOString().slice(11, 19) : ""
      lines.push(`${levelEmoji} \`${time}\` ${entry.text.slice(0, 200)}`)
    }

    return { text: clip(lines.join("\n"), 4000) }
  } catch (err: unknown) {
    return { text: `❌ Logs error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ── Command Router ───────────────────────────────────────────────────────

export type CommandHandler = (args: string, project?: string) => Promise<CommandResult>

const commandHandlers: Record<string, CommandHandler> = {
  ask: handleAsk,
  agent: handleAgent,
  models: handleModels,
  memory: handleMemory,
  search: handleSearch,
  plan: handlePlan,
  chat: handleChat,
  docs: handleDocs,
  research: handleResearch,
  history: handleHistory,
  status: handleStatus,
  config: handleConfig,
  cron: handleCron,
  skill: handleSkill,
  agents: handleAgents,
  logs: handleLogs,
}

/** Get the handler for a given command name */
export function getCommandHandler(command: string): CommandHandler | undefined {
  return commandHandlers[command.toLowerCase()]
}

/** Get the list of all supported command names */
export function getCommandList(): string[] {
  return Object.keys(commandHandlers)
}

// ── Shared Dispatch Helpers ──────────────────────────────────────────────

/** Parse a slash command from raw message text. Returns null if not a command. */
export function parseCommand(text: string): { command: string; args: string } | null {
  if (!text.startsWith("/")) return null
  const spaceIdx = text.indexOf(" ")
  const command = spaceIdx === -1 ? text.slice(1).toLowerCase() : text.slice(1, spaceIdx).toLowerCase()
  const args = spaceIdx === -1 ? "" : text.slice(spaceIdx + 1).trim()
  return { command, args }
}

/** Returns true if userId is authorized (no allow-list = open access). */
export function checkAuth(userId: string, allowedUserIds?: string[]): boolean {
  if (!allowedUserIds || allowedUserIds.length === 0) return true
  return allowedUserIds.includes(userId)
}

/**
 * Route a parsed command to the appropriate handler.
 * Calls sendReply with response text — caller is responsible for clipping.
 */
export async function routeCommand(
  command: string,
  args: string,
  sendReply: (text: string) => Promise<void>,
  project?: string,
): Promise<void> {
  if (command === "help") {
    await sendReply(HELP_MSG)
    return
  }
  if (command === "start") {
    await sendReply(WELCOME_MSG)
    return
  }
  const handler = getCommandHandler(command)
  if (!handler) return
  try {
    const result = await handler(args, project)
    await sendReply(result.text)
  } catch (err: unknown) {
    await sendReply(`❌ Error: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── Twilio Webhook Handler ───────────────────────────────────────────────

/**
 * Configuration for the shared Twilio webhook handler.
 */
export interface TwilioWebhookConfig {
  allowedUserIds?: string[]
  project?: string
  fromNumber: string
}

/**
 * Options for platform-specific webhook behavior.
 *
 * Text clipping is handled by the adapter's `sendReply` callback,
 * not by this shared handler, to avoid double-clipping.
 */
export interface TwilioWebhookOptions {
  /**
   * Optional prefix to strip from the `From` field (e.g. "whatsapp:").
   * The stripped value is used for auth checks.
   */
  stripPrefix?: string
  /**
   * If true, validates that `body.To` matches `config.fromNumber`.
   * Useful for WhatsApp where multiple numbers may hit the same webhook.
   */
  validateTo?: boolean
}

/**
 * Shared webhook handler for Twilio-based platforms (WhatsApp, SMS).
 *
 * Parses Twilio form data, validates auth, extracts commands,
 * routes to the appropriate command handler, and sends replies.
 *
 * Text clipping is the responsibility of the adapter's `sendReply` callback,
 * not this handler, to avoid double-clipping.
 *
 * @param req - The incoming HTTP request
 * @param config - Platform configuration (allowed users, project, from number)
 * @param sendReply - Callback to send a reply message (handles clipping)
 * @param opts - Platform-specific options (prefix stripping, To validation)
 * @returns A Response (always 200 OK to acknowledge Twilio)
 */
export async function handleTwilioWebhook(
  req: Request,
  config: TwilioWebhookConfig,
  sendReply: (to: string, text: string) => Promise<void>,
  opts: TwilioWebhookOptions = {},
): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("OK", { status: 200 })
  }

  const formData = await req.formData()
  const body = Object.fromEntries(formData.entries()) as Record<string, string>

  const rawFrom = body.From || ""
  const text = body.Body || ""

  // Validate To field if required (e.g., WhatsApp multi-number setup)
  if (opts.validateTo) {
    const to = body.To || ""
    if (to !== config.fromNumber) {
      return new Response("OK", { status: 200 })
    }
  }

  // Strip platform prefix from From number (e.g. "whatsapp:")
  const userId = opts.stripPrefix ? rawFrom.replace(opts.stripPrefix, "") : rawFrom

  // Auth check
  if (config.allowedUserIds && config.allowedUserIds.length > 0 && !config.allowedUserIds.includes(userId)) {
    return new Response("OK", { status: 200 })
  }

  const trimmed = text.trim()

  // Only respond to commands starting with /
  if (!trimmed.startsWith("/")) {
    return new Response("OK", { status: 200 })
  }

  // Extract command and args
  const spaceIdx = trimmed.indexOf(" ")
  const command = spaceIdx === -1 ? trimmed.slice(1).toLowerCase() : trimmed.slice(1, spaceIdx).toLowerCase()
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim()

  // Handle built-in commands (sendReply handles clipping)
  if (command === "help") {
    await sendReply(rawFrom, HELP_MSG)
    return new Response("OK", { status: 200 })
  }
  if (command === "start") {
    await sendReply(rawFrom, WELCOME_MSG)
    return new Response("OK", { status: 200 })
  }

  // Route to command handler
  const handler = getCommandHandler(command)
  if (handler) {
    try {
      const result = await handler(args, config.project)
      await sendReply(rawFrom, result.text)
    } catch (err: unknown) {
      await sendReply(rawFrom, `❌ Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return new Response("OK", { status: 200 })
}

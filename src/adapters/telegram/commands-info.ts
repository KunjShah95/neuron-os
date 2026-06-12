import type { Telegraf } from "telegraf"
import { clip } from "../bot-commands"
import { commandArg } from "./messages"

export function registerInfoCommands(bot: Telegraf): void {
  bot.command("models", async (ctx) => {
    const { MODEL_REFERENCES } = await import("../../ai/models")
    const { listProviders } = await import("../../ai/providers")

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

    await ctx.reply(clip(lines.join("\n"), 4000), { parse_mode: "Markdown" })
  })

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

      const filePath = resolve(docsDir, `${topic}.md`)
      let content: string | null = null

      if (existsSync(filePath)) {
        content = await readFile(filePath, "utf-8")
      } else {
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

      const cleanContent = content.replace(/^---[\s\S]*?---\n*/, "")

      await ctx.reply(clip(cleanContent, 4000), { parse_mode: "Markdown" })
    } catch (err: unknown) {
      await ctx.reply(`❌ Docs error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  bot.command("history", async (ctx) => {
    try {
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
    } catch (err: unknown) {
      await ctx.reply(`❌ History error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  bot.command("status", async (ctx) => {
    const { agentManager } = await import("../../agent/manager")
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

  bot.command("config", async (ctx) => {
    try {
      const { credentialVault } = await import("../../vault/manager")
      const { getTelemetryStats } = await import("../../telemetry/index")
      const { toolRegistry } = await import("../../tools/registry")

      const allEntries = await credentialVault.list()
      const globalEntries = allEntries.filter((e) => e.scope === "global")
      const telemetry = getTelemetryStats()
      const tools = toolRegistry.list()

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
    } catch (err: unknown) {
      await ctx.reply(`❌ Config error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  bot.command("cron", async (ctx) => {
    try {
      const { listActiveJobs } = await import("../../cron/engine")
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
    } catch (err: unknown) {
      await ctx.reply(`❌ Cron error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  bot.command("skill", async (ctx) => {
    try {
      const { skillRegistry } = await import("../../skills/registry")
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
    } catch (err: unknown) {
      await ctx.reply(`❌ Skill error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  bot.command("agents", async (ctx) => {
    try {
      const { agentManager } = await import("../../agent/manager")
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
    } catch (err: unknown) {
      await ctx.reply(`❌ Agents error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

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
      const { agentManager } = await import("../../agent/manager")

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
    } catch (err: unknown) {
      await ctx.reply(`❌ Logs error: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
}

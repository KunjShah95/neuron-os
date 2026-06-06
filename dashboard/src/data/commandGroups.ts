// ── Dashboard command groups ─────────────────────────────────────────
// Mechanical facts (name, alias, description, options) are sourced from
// shared/commands.json. This file is the human-curated layer that adds
// icon, tag set, and category grouping for the dashboard UI.
// See: docs/superpowers/specs/2026-06-06-docs-section-update-design.md

import commandsJson from "../../../shared/commands.json"

export interface CommandDef {
  name: string
  sub?: string
  desc: string
  usage: string
  options?: { flag: string; desc: string }[]
}

export interface CommandGroup {
  name: string
  icon: string
  tags: string[]
  commands: CommandDef[]
}

interface ExtractedOption {
  flag: string
  description: string
  required: boolean
  defaultValue?: string | boolean | number
}

interface ExtractedCommand {
  name: string
  parent?: string
  alias?: string
  description: string
  options: ExtractedOption[]
  sourceFile: string
}

const allCommands = (commandsJson.commands as ExtractedCommand[])
  .filter((c) => c.name !== "completion") // skip default commander command if any
  .map((c): CommandDef => {
    const usage = c.alias ? `aegis ${c.name}  (alias: ${c.alias})` : `aegis ${c.name}`
    return {
      name: c.name,
      ...(c.alias ? { sub: c.alias } : {}),
      desc: c.description,
      usage,
      ...(c.options.length > 0
        ? {
            options: c.options.map((o) => ({ flag: o.flag, desc: o.description })),
          }
        : {}),
    }
  })

const byRoot = (root: string) =>
  allCommands.filter((c) => c.name === root || c.name.startsWith(root + " "))

// Group definitions: hand-curated ordering, icons, and tag sets.
// `commands` arrays are derived from shared/commands.json.
const groups: Array<{ name: string; icon: string; tags: string[]; roots: string[] }> = [
  { name: "system", icon: "◈", tags: ["system"], roots: ["wakeup", "dashboard", "status", "doctor", "completion"] },
  { name: "setup", icon: "⚡", tags: ["system", "config"], roots: ["setup", "setup-keys", "config"] },
  { name: "agents", icon: "⬡", tags: ["agent"], roots: ["agent", "chat", "agent-run", "pool", "supervise"] },
  { name: "orchestration", icon: "⊛", tags: ["agent", "research"], roots: ["plan", "orchestrate", "mesh", "research", "ask"] },
  { name: "memory", icon: "◇", tags: ["memory"], roots: ["memory", "agentmemory", "experience", "reflect"] },
  { name: "knowledge", icon: "◆", tags: ["system", "info"], roots: ["skills", "harness", "bench", "audit"] },
  { name: "schedule", icon: "⏱", tags: ["system", "schedule"], roots: ["cron"] },
  { name: "serve", icon: "↗", tags: ["network", "server"], roots: ["serve", "openapi", "mcp"] },
  { name: "adapters", icon: "⟳", tags: ["network"], roots: ["discord", "slack", "telegram", "whatsapp", "sms", "email", "voice", "webhook"] },
  { name: "sessions", icon: "◯", tags: ["data"], roots: ["session", "project"] },
  { name: "runtime", icon: "◌", tags: ["system"], roots: ["telemetry", "sandbox", "computer"] },
]

export const commandGroups: CommandGroup[] = groups.map((g) => ({
  name: g.name,
  icon: g.icon,
  tags: g.tags,
  commands: g.roots.flatMap((r) => byRoot(r)),
}))

export const allTags = Array.from(new Set(commandGroups.flatMap((g) => g.tags))).sort()

export const totalCommands = commandGroups.reduce((s, g) => s + g.commands.length, 0)

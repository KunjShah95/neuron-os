import type { Command } from "commander"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { theme } from "../theme"
import type { AgentProfile } from "../../profile/types"

function aegisDir(): string {
  return join(homedir(), ".aegis")
}

function configPath(): string {
  return join(aegisDir(), "config.json")
}

function readAegisConfig(): Record<string, unknown> {
  const p = configPath()
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as Record<string, unknown>
  } catch {
    return {}
  }
}

function writeAegisConfig(data: Record<string, unknown>): void {
  const dir = aegisDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(data, null, 2))
}

export function registerProfile(program: Command) {
  const cmd = program.command("profile").description("Manage agent identity profiles")

  cmd
    .command("list")
    .description("List all profiles")
    .action(async () => {
      const { profileStore } = await import("../../profile")
      const profiles = profileStore.list()
      if (profiles.length === 0) {
        console.log(theme.dim("  No profiles found. Use `aegis profile create` to add one."))
        return
      }
      console.log(theme.heading(`  Profiles (${profiles.length}):`))
      console.log()
      const header = "  " + ["ID".padEnd(24), "Name".padEnd(24), "Type".padEnd(20), "Model"].join("  ")
      console.log(theme.dim(header))
      console.log(theme.dim("  " + "-".repeat(80)))
      for (const p of profiles) {
        const row = [
          p.id.padEnd(24),
          p.name.padEnd(24),
          p.agentType.padEnd(20),
          p.model ?? theme.muted("(default)"),
        ].join("  ")
        console.log("  " + row)
      }
    })

  cmd
    .command("create")
    .description("Create a new agent profile")
    .requiredOption("--type <agentType>", "Agent type name")
    .requiredOption("--name <name>", "Display name for the profile")
    .option("--model <model>", "Model override (provider:model-id)")
    .option("--temperature <n>", "Temperature override", (v) => parseFloat(v))
    .option("--budget <usd>", "Budget USD per task", (v) => parseFloat(v))
    .option("--skills <skills>", "Comma-separated skill names")
    .action(
      async (opts: {
        type: string
        name: string
        model?: string
        temperature?: number
        budget?: number
        skills?: string
      }) => {
        const { profileStore } = await import("../../profile")
        const id = opts.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
        const now = new Date().toISOString()
        const profile: AgentProfile = {
          id,
          name: opts.name,
          agentType: opts.type,
          model: opts.model,
          temperature: opts.temperature,
          skills: opts.skills ? opts.skills.split(",").map((s) => s.trim()) : [],
          budgetUsdPerTask: opts.budget,
          createdAt: now,
          updatedAt: now,
        }
        profileStore.save(profile)
        console.log(theme.success(`  ✓ Profile created: ${profile.id}`))
      }
    )

  cmd
    .command("get <id>")
    .description("Print a profile as JSON")
    .action(async (id: string) => {
      const { profileStore } = await import("../../profile")
      const profile = profileStore.get(id)
      if (!profile) {
        console.log(theme.error(`  Profile "${id}" not found`))
        process.exit(1)
      }
      console.log(JSON.stringify(profile, null, 2))
    })

  cmd
    .command("delete <id>")
    .description("Delete a profile")
    .action(async (id: string) => {
      const { profileStore } = await import("../../profile")
      const deleted = profileStore.delete(id)
      if (!deleted) {
        console.log(theme.error(`  Profile "${id}" not found`))
        process.exit(1)
      }
      console.log(theme.success(`  ✓ Profile deleted: ${id}`))
    })

  cmd
    .command("set-default <id>")
    .description("Set a profile as the default for its agent type")
    .action(async (id: string) => {
      const { profileStore } = await import("../../profile")
      const profile = profileStore.get(id)
      if (!profile) {
        console.log(theme.error(`  Profile "${id}" not found`))
        process.exit(1)
      }
      const config = readAegisConfig()
      const defaults = (config.defaultProfiles ?? {}) as Record<string, string>
      defaults[profile.agentType] = id
      config.defaultProfiles = defaults
      writeAegisConfig(config)
      console.log(theme.success(`  ✓ Default for "${profile.agentType}" set to "${id}"`))
    })
}

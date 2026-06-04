import type { Command } from "commander"
import { theme } from "../theme"
import { credentialVault } from "../../vault"
import { showBanner } from "../banner"

export function registerConfig(program: Command) {
  const config = program
    .command("config")
    .alias("cfg")
    .description("Manage credentials and configuration")

  config
    .command("set <key> <value>")
    .description("Store a credential (e.g. API key)")
    .option("--scope <scope>", "Scope: global (default) or agent type name")
    .action(async (key: string, value: string, opts: { scope?: string }) => {
      await credentialVault.initialize()
      const scope = opts.scope ?? "global"
      await credentialVault.set(key, value, scope)
      console.log(theme.success(`  ✓ Stored ${theme.accent(key)} (scope: ${scope})`))
      console.log(theme.dim(`    Credential saved (AES-256-GCM encrypted) to ${credentialVault.vaultFilePath()}`))
    })

  config
    .command("get <key>")
    .description("Retrieve a stored credential")
    .option("--scope <scope>", "Scope")
    .action(async (key: string, opts: { scope?: string }) => {
      await credentialVault.initialize()
      const scope = opts.scope ?? "global"
      const value = await credentialVault.get(key, scope)
      if (value === null) {
        console.log(theme.error(`  ✗ Key "${key}" not found in scope "${scope}"`))
        process.exit(1)
      }
      console.log(value)
    })

  config
    .command("delete <key>")
    .description("Delete a stored credential")
    .option("--scope <scope>", "Scope")
    .action(async (key: string, opts: { scope?: string }) => {
      await credentialVault.initialize()
      const scope = opts.scope ?? "global"
      const deleted = await credentialVault.delete(key, scope)
      if (deleted) {
        console.log(theme.success(`  ✓ Deleted ${theme.accent(key)} (scope: ${scope})`))
      } else {
        console.log(theme.error(`  ✗ Key "${key}" not found`))
      }
    })

  // Default: show status
  config.action(async () => {
    showBanner()
    await credentialVault.initialize()
    const entries = await credentialVault.list()
    console.log()
    if (entries.length === 0) {
      console.log(`  ${theme.warn("No credentials stored")}`)
      console.log(`  ${theme.muted("  Use: aegis config set <key> <value>")}`)
      console.log(`  ${theme.muted("  Vault encrypted with AES-256-GCM")}`)
    } else {
      console.log(`  ${theme.heading(`Credentials (${entries.length})`)}`)
      console.log()
      for (const e of entries) {
        const masked = e.value.length > 8
          ? e.value.slice(0, 4) + "…" + e.value.slice(-4)
          : "…"
        console.log(`  ${theme.accent(e.key.padEnd(30))} ${theme.dim(`[${e.scope}]`)} ${masked}`)
      }
    }
    console.log()
    console.log(`  ${theme.muted("Subcommands: set, get, delete, list")}`)
    console.log()
  })

  config
    .command("list")
    .description("List stored credential keys")
    .option("--scope <scope>", "Filter by scope")
    .action(async (opts: { scope?: string }) => {
      await credentialVault.initialize()
      const entries = await credentialVault.list(opts.scope)
      if (entries.length === 0) {
        console.log(theme.dim("  No credentials stored."))
        return
      }
      console.log(theme.heading("  Stored Credentials:"))
      console.log()
      for (const e of entries) {
        const masked = e.value.length > 8
          ? e.value.slice(0, 4) + "…" + e.value.slice(-4)
          : "…"
        console.log(`  ${theme.accent(e.key.padEnd(30))} ${theme.dim(`[${e.scope}]`)} ${masked}`)
      }
    })

  config
    .command("validate")
    .description("Validate config file against schema")
    .action(async () => {
      const { AppConfigSchema } = await import("../../config")
      const { existsSync, readFileSync } = await import("fs")
      const { join } = await import("path")
      const { homedir } = await import("os")

      const configPath = join(homedir(), ".aegis", "config.json")
      if (!existsSync(configPath)) {
        console.log(theme.warn("  No config file found at ~/.aegis/config.json"))
        return
      }

      let raw: string
      try {
        raw = readFileSync(configPath, "utf-8")
      } catch (err) {
        console.log(theme.error(`  Failed to read config: ${(err as Error).message}`))
        process.exitCode = 1
        return
      }

      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(raw)
      } catch (err) {
        console.log(theme.error(`  Invalid JSON: ${(err as Error).message}`))
        process.exitCode = 1
        return
      }

      const result = AppConfigSchema.safeParse(parsed)
      if (result.success) {
        console.log(theme.success("  Config is valid"))
      } else {
        console.log(theme.error("  Config validation errors:"))
        for (const issue of result.error.issues) {
          const path = issue.path.length > 0 ? issue.path.join(".") : "(root)"
          console.log(`    ${theme.accent(path)}: ${issue.message}`)
        }
        process.exitCode = 1
      }
    })
}

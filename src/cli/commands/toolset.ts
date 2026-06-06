import type { Command } from "commander"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { toolsetRegistry } from "../../toolsets"
import { ToolsetDef } from "../../toolsets"
import { createLogger } from "../logger"

const log = createLogger("toolset-cli")

const CUSTOM_TOOLSETS_PATH = join(homedir(), ".aegis", "toolsets.json")

function loadCustomToolsets(): void {
  if (!existsSync(CUSTOM_TOOLSETS_PATH)) return
  try {
    const raw = readFileSync(CUSTOM_TOOLSETS_PATH, "utf-8")
    const defs = JSON.parse(raw)
    if (Array.isArray(defs)) {
      for (const def of defs) {
        const parsed = ToolsetDef.safeParse(def)
        if (parsed.success) {
          toolsetRegistry.register(parsed.data)
        } else {
          log.warn("Skipping invalid custom toolset", { name: def.name, errors: parsed.error.issues })
        }
      }
    }
  } catch (err) {
    log.warn("Failed to load custom toolsets", { error: String(err) })
  }
}

function saveCustomToolsets(): void {
  const all = toolsetRegistry.listToolsets()
  // Only save user-defined ones (not bundled)
  const bundledNames = new Set([
    "web", "search", "vision", "code-execution", "delegation",
    "file-ops", "shell", "research", "full-stack", "all",
  ])
  const custom = all.filter((t) => !bundledNames.has(t.name))
  const dir = join(homedir(), ".aegis")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(CUSTOM_TOOLSETS_PATH, JSON.stringify(custom, null, 2), "utf-8")
}

export function registerToolset(program: Command): void {
  loadCustomToolsets()

  const toolset = program
    .command("toolset")
    .alias("ts")
    .description("Manage composable tool groups")

  toolset
    .command("list")
    .description("List all available toolsets")
    .action(() => {
      const all = toolsetRegistry.listToolsets()
      if (all.length === 0) {
        console.log("No toolsets registered.")
        return
      }
      console.log(`\n  Available toolsets (${all.length}):\n`)
      for (const ts of all) {
        try {
          const resolved = toolsetRegistry.resolveToolset(ts.name)
          const toolList = resolved.tools.length > 0 ? resolved.tools.join(", ") : "(empty)"
          console.log(`  ${ts.name}`)
          console.log(`    ${ts.description}`)
          console.log(`    Tools: ${toolList}`)
          if (ts.includes.length > 0) {
            console.log(`    Includes: ${ts.includes.join(", ")}`)
          }
          console.log()
        } catch {
          console.log(`  ${ts.name}`)
          console.log(`    (error resolving — circular dependency?)`)
          console.log()
        }
      }
    })

  toolset
    .command("show <name>")
    .description("Show details for a specific toolset")
    .action((name: string) => {
      try {
        const resolved = toolsetRegistry.resolveToolset(name)
        console.log(`\n  Toolset: ${resolved.name}`)
        console.log(`  Description: ${resolved.description}`)
        console.log(`  Tools (${resolved.tools.length}):`)
        for (const t of resolved.tools) {
          console.log(`    - ${t}`)
        }
        console.log()
      } catch (err) {
        console.error(`Unknown toolset: ${name}`)
        process.exit(1)
      }
    })

  toolset
    .command("new <name>")
    .description("Create a new custom toolset")
    .option("-d, --description <desc>", "Toolset description", "")
    .option("-t, --tools <tools>", "Comma-separated tool names")
    .option("-i, --includes <includes>", "Comma-separated toolset includes")
    .action((name: string, opts: { description?: string; tools?: string; includes?: string }) => {
      const def = {
        name,
        description: opts.description || "",
        tools: opts.tools ? opts.tools.split(",").map((s: string) => s.trim()) : [],
        includes: opts.includes ? opts.includes.split(",").map((s: string) => s.trim()) : [],
      }
      const parsed = ToolsetDef.safeParse(def)
      if (!parsed.success) {
        console.error(`Invalid toolset definition: ${parsed.error.issues.map((i) => i.message).join("; ")}`)
        process.exit(1)
      }
      try {
        toolsetRegistry.resolveToolset(name)
        console.error(`Toolset "${name}" already exists.`)
        process.exit(1)
      } catch {
        // Not found = good, we can create it
      }
      toolsetRegistry.register(parsed.data)
      saveCustomToolsets()
      console.log(`Toolset "${name}" created.`)
    })
}

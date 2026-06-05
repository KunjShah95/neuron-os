/**
 * project — Project workspace management CLI.
 *
 * Manage multiple projects with isolated sessions, memory, and config.
 * Each project gets its own data directory under ~/.aegis/projects/<name>/.
 */

import type { Command } from "commander"
import { theme } from "../theme"
import { showBanner } from "../banner"

// Re-export for use in index.ts
export { getActiveProject } from "../../project/context"
export type { ProjectConfig } from "../../project/context"

export function registerProject(program: Command) {
  const project = program
    .command("project")
    .alias("proj")
    .description("Manage project workspaces (isolated sessions, memory, config)")

  // ── init ──────────────────────────────────────────────────────────
  project
    .command("init <name>")
    .description("Initialize a new project workspace")
    .option("--root <path>", "Project root directory", process.cwd())
    .action(async (name: string, opts: { root?: string }) => {
      showBanner()
      const { initProject, getProjectDataDir } = await import("../../project/context")

      const root = opts.root ?? process.cwd()
      initProject(name, root)
      const dir = getProjectDataDir(name)

      console.log(theme.success(`  ✓ Project "${name}" initialized`))
      console.log(`    root: ${theme.dim(root)}`)
      console.log(`    data: ${theme.dim(dir)}`)
      console.log()
      console.log(theme.dim(`  Use "aegis project switch ${name}" to activate it`))
    })

  // ── list ──────────────────────────────────────────────────────────
  project
    .command("list")
    .alias("ls")
    .description("List all registered projects")
    .action(async () => {
      const { listProjects, getActiveProject } = await import("../../project/context")

      const projects = listProjects()
      const active = getActiveProject()

      if (projects.length === 0) {
        console.log(theme.dim("  No projects registered."))
        console.log(theme.dim('  Use "aegis project init <name>" to create one.'))
        return
      }

      console.log(theme.heading(`  Projects (${projects.length})`))
      console.log()

      for (const p of projects) {
        const isActive = p.name === active
        const marker = isActive ? "●" : "○"
        const date = new Date(p.createdAt).toLocaleDateString()
        console.log(`  ${theme.accent(marker)} ${isActive ? theme.bold(p.name) : p.name}`)
        console.log(`    root: ${theme.dim(p.root)}`)
        console.log(`    created: ${theme.dim(date)}`)
        console.log()
      }
    })

  // ── switch ────────────────────────────────────────────────────────
  project
    .command("switch <name>")
    .alias("use")
    .description("Switch the active project")
    .action(async (name: string) => {
      showBanner()
      const { listProjects, setActiveProject, getProjectDataDir } = await import("../../project/context")

      const projects = listProjects()
      const match = projects.find((p) => p.name === name)

      if (!match) {
        console.log(theme.error(`  Project "${name}" not found.`))
        console.log(theme.dim('  Use "aegis project list" to see available projects.'))
        process.exit(1)
      }

      setActiveProject(name)
      const dir = getProjectDataDir(name)

      console.log(theme.success(`  ✓ Switched to project "${name}"`))
      console.log(`    root: ${theme.dim(match.root)}`)
      console.log(`    data: ${theme.dim(dir)}`)
      console.log()
      console.log(theme.dim("  All session and memory operations will now use this project."))
    })

  // ── remove ────────────────────────────────────────────────────────
  project
    .command("remove <name>")
    .alias("rm")
    .description("Remove a project and all its data")
    .action(async (name: string) => {
      showBanner()

      // Close data stores before removing to avoid EBUSY on Windows
      try {
        const { sessionStore } = await import("../../memory/session-persistence")
        if ((sessionStore as any)?.close) (sessionStore as any).close()
      } catch {}
      try {
        const { auditStore } = await import("../../audit/store")
        if (auditStore) auditStore.close()
      } catch {}
      try {
        const { experienceStore } = await import("../../experience/store")
        if (experienceStore) experienceStore.close()
      } catch {}

      const { removeProject, getActiveProject } = await import("../../project/context")

      if (!removeProject(name)) {
        console.log(theme.error(`  Project "${name}" not found.`))
        process.exit(1)
      }

      const activeAfter = getActiveProject()
      const activeNote = activeAfter !== name ? "" : " (active project reset)"

      console.log(theme.warn(`  ✗ Project "${name}" removed${activeNote}`))
    })

  // ── info (default action) ─────────────────────────────────────────
  project.action(async () => {
    showBanner()
    const { getActiveProject, getProjectDataDir, listProjects } = await import("../../project/context")

    const active = getActiveProject()
    const projects = listProjects()

    console.log()
    if (active) {
      const dir = getProjectDataDir(active)
      const match = projects.find((p) => p.name === active)
      console.log(`  ${theme.bold("Active project:")} ${theme.success(active)}`)
      console.log(`  ${theme.dim("Data directory:")} ${theme.dim(dir)}`)
      if (match) {
        console.log(`  ${theme.dim("Root:")} ${theme.dim(match.root)}`)
      }
    } else {
      console.log(`  ${theme.dim("No active project set.")}`)
      console.log(`  ${theme.dim("Using default (cwd-based) data paths.")}`)
    }

    console.log()
    console.log(`  ${theme.muted(`Subcommands: init, list, switch, remove`)}`)
    console.log()
  })
}

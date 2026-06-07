/**
 * project/context — Project context and workspace management.
 *
 * Provides a consistent way to scope data (sessions, memory, config)
 * to specific projects. Each project gets its own isolated directory
 * under ~/.aegis/projects/<name>/.
 *
 * The "active" project is persisted in ~/.aegis/active-project.
 * When no active project is set, the system falls back to the default
 * behavior (cwd-based paths).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

// ── Types ─────────────────────────────────────────────────────────────

export interface ProjectConfig {
  /** Human-readable project name (also used as the directory name) */
  name: string
  /** Absolute path to the project root on disk */
  root: string
  /** When the project was first registered (Unix timestamp ms) */
  createdAt: number
}

// ── Paths ─────────────────────────────────────────────────────────────

const AEGIS_DIR = join(homedir(), ".aegis")
const PROJECTS_DIR = join(AEGIS_DIR, "projects")
const ACTIVE_PROJECT_FILE = join(AEGIS_DIR, "active-project")

function ensureDirs(): void {
  mkdirSync(PROJECTS_DIR, { recursive: true })
}

/** Get the data directory for a given project name. */
export function getProjectDataDir(name: string): string {
  return join(PROJECTS_DIR, name)
}

/** Get the sessions DB path for a project. */
export function getProjectSessionDb(name: string): string {
  return join(getProjectDataDir(name), "sessions.db")
}

/** Get the memory directory for a project (where .aegis/memory/ lives). */
export function getProjectMemoryDir(name: string): string {
  return join(getProjectDataDir(name), "memory")
}

// ── Active project ────────────────────────────────────────────────────

/** Read the currently active project name, or null if none is set. */
export function getActiveProject(): string | null {
  try {
    if (!existsSync(ACTIVE_PROJECT_FILE)) return null
    const name = readFileSync(ACTIVE_PROJECT_FILE, "utf-8").trim()
    if (!name) return null
    // Verify the project directory actually exists
    const dir = getProjectDataDir(name)
    if (!existsSync(dir)) return null
    return name
  } catch {
    return null
  }
}

/** Set (or clear) the active project. */
export function setActiveProject(name: string | null): void {
  ensureDirs()
  try {
    writeFileSync(ACTIVE_PROJECT_FILE, name ?? "", "utf-8")
  } catch {
    /* best-effort */
  }
}

// ── Project CRUD ──────────────────────────────────────────────────────

/** List all registered projects. */
export function listProjects(): ProjectConfig[] {
  ensureDirs()
  if (!existsSync(PROJECTS_DIR)) return []

  const projects: ProjectConfig[] = []
  for (const entry of readdirSync(PROJECTS_DIR)) {
    const configFile = join(PROJECTS_DIR, entry, "project.json")
    if (existsSync(configFile)) {
      try {
        const raw = readFileSync(configFile, "utf-8")
        projects.push(JSON.parse(raw) as ProjectConfig)
      } catch {
        // Skip malformed projects
      }
    }
  }

  return projects.sort((a, b) => a.name.localeCompare(b.name))
}

/** Initialize a new project with isolated data directories. */
export function initProject(name: string, root: string): ProjectConfig {
  ensureDirs()
  const dir = getProjectDataDir(name)
  mkdirSync(dir, { recursive: true })

  const config: ProjectConfig = {
    name,
    root,
    createdAt: Date.now(),
  }

  writeFileSync(join(dir, "project.json"), JSON.stringify(config, null, 2), "utf-8")

  // Create subdirectories for future use
  mkdirSync(join(dir, "memory"), { recursive: true })

  return config
}

/** Remove a project and all its data. */
export function removeProject(name: string): boolean {
  const dir = getProjectDataDir(name)
  if (!existsSync(dir)) return false

  rmSync(dir, { recursive: true })

  // Clear active project if it was the one removed
  const active = getActiveProject()
  if (active === name) {
    setActiveProject(null)
  }

  return true
}

/**
 * agent-tools — agent tool definitions for the approval-based execution flow.
 *
 * These tools are used by the Agent orchestrator (ask/agent/plan modes)
 * to stage mutations through ActionTracker, then approve/reject them.
 */

import type { ActionTracker } from "./action-tracker"
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"

export interface AgentToolConfig {
  codebasePath: string
  allowFileCreation: boolean
  allowFileModification: boolean
  allowFolderCreation: boolean
  allowShellExecution: boolean
  maxFileSizeToRead: number
  excludePatterns: string[]
}

const DEFAULT_CONFIG: AgentToolConfig = {
  codebasePath: process.cwd(),
  allowFileCreation: true,
  allowFileModification: true,
  allowFolderCreation: true,
  allowShellExecution: true,
  maxFileSizeToRead: 512 * 1024, // 512KB
  excludePatterns: ["node_modules", ".git", "dist", ".next", "bun.lock"],
}

export class AgentToolExecutor {
  private tracker: ActionTracker
  private config: AgentToolConfig
  private overlay = new Map<string, string>()
  private deleted = new Set<string>()

  constructor(tracker: ActionTracker, config?: Partial<AgentToolConfig>) {
    this.tracker = tracker
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  private norm(rel: string): string {
    return path.posix.normalize(rel.split(path.sep).join("/")).replace(/^\.\//, "")
  }

  private resolveSafe(rel: string): string {
    const abs = path.resolve(this.config.codebasePath, rel)
    const root = path.resolve(this.config.codebasePath)
    const relCheck = path.relative(root, abs)
    if (relCheck.startsWith("..") || path.isAbsolute(relCheck)) {
      throw new Error(`Path escapes workspace: ${rel}`)
    }
    return abs
  }

  private excluded(relPath: string): boolean {
    const norm = this.norm(relPath)
    const segments = norm.split("/")
    for (const pat of this.config.excludePatterns) {
      if (pat.endsWith("/*") && norm.startsWith(pat.slice(0, -2))) return true
      if (segments.includes(pat) || norm === pat || norm.startsWith(`${pat}/`)) return true
    }
    return false
  }

  private assertNotExcluded(rel: string, op: string): void {
    if (this.excluded(rel)) {
      throw new Error(`${op}: path is excluded by policy: ${rel}`)
    }
  }

  /** Get the effective content of a file (including staged overlays). */
  getEffectiveText(rel: string): string | undefined {
    const key = this.norm(rel)
    if (this.deleted.has(key)) return undefined
    if (this.overlay.has(key)) return this.overlay.get(key)
    const abs = this.resolveSafe(rel)
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return undefined
    return fs.readFileSync(abs, "utf-8")
  }

  /** Read a file's content (read-only, logged as code_analysis). */
  readFile(rel: string): string {
    this.assertNotExcluded(rel, "read_file")
    const abs = this.resolveSafe(rel)
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
      throw new Error(`File not found: ${rel}`)
    }
    const st = fs.statSync(abs)
    if (st.size > this.config.maxFileSizeToRead) {
      throw new Error(`File too large: ${rel} (${st.size} bytes)`)
    }
    const text = fs.readFileSync(abs, "utf-8")
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rel),
      details: { after: text, toolName: "read_file" },
    })
    return text
  }

  /** Stage a new file creation. */
  createFile(rel: string, content: string): string {
    if (!this.config.allowFileCreation) throw new Error("File creation disabled")
    this.assertNotExcluded(rel, "create_file")
    const key = this.norm(rel)
    const abs = this.resolveSafe(rel)
    if (fs.existsSync(abs) && !this.deleted.has(key)) {
      throw new Error(`create_file: already exists: ${rel}`)
    }
    this.deleted.delete(key)
    this.overlay.set(key, content)
    this.tracker.log({
      type: "file_create",
      path: key,
      details: { after: content },
    })
    return `Staged new file: ${key}`
  }

  /** Stage a file modification. */
  modifyFile(rel: string, content: string): string {
    if (!this.config.allowFileModification) throw new Error("File modification disabled")
    this.assertNotExcluded(rel, "modify_file")
    const before = this.getEffectiveText(rel)
    if (before === undefined) throw new Error(`modify_file: file not found: ${rel}`)
    const key = this.norm(rel)
    this.overlay.set(key, content)
    this.tracker.log({
      type: "file_modify",
      path: key,
      details: { before, after: content },
    })
    return `Staged update: ${key}`
  }

  /** Stage a file deletion. */
  deleteFile(rel: string): string {
    if (!this.config.allowFileModification) throw new Error("File deletion disabled")
    this.assertNotExcluded(rel, "delete_file")
    const before = this.getEffectiveText(rel)
    if (before === undefined) throw new Error(`delete_file: file not found: ${rel}`)
    const key = this.norm(rel)
    this.overlay.delete(key)
    this.deleted.add(key)
    this.tracker.log({
      type: "file_delete",
      path: key,
      details: { before },
    })
    return `Staged delete: ${key}`
  }

  /** Stage a folder creation. */
  createFolder(rel: string): string {
    if (!this.config.allowFolderCreation) throw new Error("Folder creation disabled")
    this.assertNotExcluded(rel, "create_folder")
    const key = this.norm(rel)
    this.tracker.log({
      type: "folder_create",
      path: key,
      details: { after: key },
    })
    return `Staged folder: ${key}`
  }

  /** Stage a shell command for later execution. */
  queueShell(command: string): string {
    if (!this.config.allowShellExecution) throw new Error("Shell execution disabled")
    this.tracker.log({
      type: "tool_execute",
      path: "shell",
      details: { command, toolName: "execute_shell" },
    })
    return `Shell queued: ${command}`
  }

  /** Apply all approved actions from the tracker to disk. */
  applyApproved(): { errors: string[] } {
    const errors: string[] = []
    const all = [...this.tracker.getActions()]

    // Apply folder creations first
    for (const a of all.filter((x) => x.type === "folder_create" && x.status === "approved")) {
      try {
        fs.mkdirSync(this.resolveSafe(a.path), { recursive: true })
      } catch (e) {
        errors.push(String(e))
      }
    }

    // Apply file operations (deduplicated by path, last write wins)
    const fileOps = all
      .filter(
        (a) =>
          (a.type === "file_create" || a.type === "file_modify" || a.type === "file_delete") &&
          a.status === "approved",
      )
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

    const lastByPath = new Map<string, typeof fileOps[0]>()
    for (const a of fileOps) lastByPath.set(this.norm(a.path), a)

    for (const [p, a] of lastByPath) {
      try {
        if (a.type === "file_delete") {
          fs.rmSync(this.resolveSafe(p), { force: true })
        } else {
          const target = this.resolveSafe(p)
          fs.mkdirSync(path.dirname(target), { recursive: true })
          fs.writeFileSync(target, a.details.after ?? "", "utf-8")
        }
      } catch (e) {
        errors.push(String(e))
      }
    }

    // Execute shell commands
    for (const a of all.filter((x) => x.type === "tool_execute" && x.status === "approved")) {
      const cmd = a.details.command
      if (!cmd) continue
      try {
        const r = spawnSync(cmd, {
          shell: true,
          cwd: this.config.codebasePath,
          encoding: "utf8",
          maxBuffer: 16 * 1024 * 1024,
        })
        if (r.status && r.status !== 0) {
          errors.push(`shell exit ${r.status}: ${cmd}\n${r.stderr?.slice(0, 500)}`)
        }
      } catch (e) {
        errors.push(String(e))
      }
    }

    // Mark all approved as executed
    this.tracker.markExecuted()
    return { errors }
  }

  /** List files and directories under a path. */
  listFiles(rel: string, recursive: boolean): string {
    this.assertNotExcluded(rel, "list_files")
    const abs = this.resolveSafe(rel)
    if (!fs.existsSync(abs)) throw new Error(`list_files: not found: ${rel}`)

    const lines: string[] = []
    const walk = (dir: string, prefix: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
      for (const ent of entries) {
        const full = path.join(dir, ent.name)
        const relP = path.relative(this.config.codebasePath, full)
        if (this.excluded(relP)) continue
        if (ent.isDirectory()) {
          lines.push(`${prefix}${ent.name}/`)
          if (recursive) walk(full, `${prefix}${ent.name}/`)
        } else {
          lines.push(`${prefix}${ent.name}`)
        }
      }
    }

    if (fs.statSync(abs).isDirectory()) walk(abs, "")
    else lines.push(path.relative(this.config.codebasePath, abs))

    const out = lines.sort().join("\n")
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rel),
      details: { after: out, toolName: "list_files" },
    })
    return out || "(empty)"
  }

  /** Search files matching a glob pattern with optional content filter. */
  searchFiles(rootRel: string, globPattern: string, contentQuery?: string): string {
    this.assertNotExcluded(rootRel, "search_files")
    const rootAbs = this.resolveSafe(rootRel)
    if (!fs.existsSync(rootAbs)) throw new Error(`search_files: root not found: ${rootRel}`)

    const results: string[] = []

    const regexFromGlob = (g: string): RegExp => {
      const escaped = g
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "§§")
        .replace(/\*/g, "[^/\\\\]*")
        .replace(/§§/g, ".*")
        .replace(/\?/g, ".")
      return new RegExp(`^${escaped}$`, "i")
    }

    const nameRe = regexFromGlob(globPattern.replace(/\\/g, "/"))
    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name)
        const relP = path.relative(this.config.codebasePath, full).split(path.sep).join("/")
        if (this.excluded(relP)) continue
        if (ent.isDirectory()) walk(full)
        else if (nameRe.test(relP) || nameRe.test(ent.name)) {
          if (contentQuery) {
            const text = fs.readFileSync(full, "utf8")
            if (!text.includes(contentQuery)) continue
          }
          results.push(relP)
        }
      }
    }

    if (fs.statSync(rootAbs).isDirectory()) walk(rootAbs)
    else results.push(path.relative(this.config.codebasePath, rootAbs))

    const out = [...new Set(results)].sort().join("\n")
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rootRel),
      details: { after: out || "(no matches)", toolName: "search_files" },
    })
    return out || "(no matches)"
  }

  /** Analyze codebase structure: file counts, size, extensions. */
  analyzeCodebase(rootRel: string): string {
    const rootAbs = this.resolveSafe(rootRel)
    if (!fs.existsSync(rootAbs)) throw new Error(`analyze_codebase: not found: ${rootRel}`)

    let files = 0
    let dirs = 0
    const extCounts = new Map<string, number>()

    const walk = (dir: string) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name)
        const relP = path.relative(this.config.codebasePath, full)
        if (this.excluded(relP)) continue
        if (ent.isDirectory()) {
          dirs++
          walk(full)
        } else {
          files++
          const ext = path.extname(ent.name).toLowerCase() || "(no ext)"
          extCounts.set(ext, (extCounts.get(ext) ?? 0) + 1)
        }
      }
    }

    if (fs.statSync(rootAbs).isDirectory()) walk(rootAbs)
    else files = 1

    const extSummary = [...extCounts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ext, count]) => `${ext}: ${count}`)
      .join(", ")

    const summary = `Files: ${files} | Directories: ${dirs} | Extensions: ${extSummary}`
    this.tracker.log({
      type: "code_analysis",
      path: this.norm(rootRel),
      details: { after: summary, toolName: "analyze_codebase" },
    })
    return summary
  }

  /** Get skill root directories. */
  private skillRoots(): string[] {
    const extra = process.env.SKILLS_DIRS?.split(/[;]/).map((s) => s.trim()).filter(Boolean) ?? []
    return [
      ...extra,
      path.join(process.cwd(), "skills"),
      path.join(process.env.HOME || process.env.USERPROFILE || "~", ".aegis/skills"),
    ]
  }

  /** List all SKILL.md files under skill roots. */
  listSkills(): string {
    const lines: string[] = []
    for (const root of this.skillRoots()) {
      if (!fs.existsSync(root)) continue
      const walk = (dir: string) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name)
          if (ent.isDirectory()) walk(full)
          else if (ent.name === "SKILL.md") lines.push(full)
        }
      }
      walk(root)
    }
    const out = lines.sort().join("\n")
    this.tracker.log({
      type: "code_analysis",
      path: "skills",
      details: { after: out || "(none)", toolName: "list_skills" },
    })
    return out || "(none)"
  }

  /** Read a SKILL.md file. Path must be under skill roots. */
  readSkill(skillPath: string): string {
    const abs = path.isAbsolute(skillPath)
      ? path.normalize(skillPath)
      : path.normalize(path.resolve(this.config.codebasePath, skillPath))

    const allowed = this.skillRoots().some((root) => {
      const r = path.resolve(root)
      return abs === r || abs.startsWith(r + path.sep)
    })
    if (!allowed) throw new Error("read_skill: outside skill roots")

    const text = fs.readFileSync(abs, "utf8")
    this.tracker.log({
      type: "code_analysis",
      path: abs,
      details: { after: text, toolName: "read_skill" },
    })
    return text
  }

  /** Clear staging overlays. */
  clearStaging(): void {
    this.overlay.clear()
    this.deleted.clear()
  }
}

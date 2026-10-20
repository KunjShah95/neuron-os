import { writeFileSync, copyFileSync, existsSync, mkdirSync, renameSync, unlinkSync, readFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path"
import { createLogger } from "../cli/logger"
import type { CodeMutation } from "./types"
import { DEFAULT_EVOLUTION_CONFIG } from "./types"
import { evolutionStore, type EvolutionStore } from "./evolution-store"

const log = createLogger("code-mutator")

export interface CodeMutatorOptions {
  allowedDirs?: string[]
  projectRoot?: string
  backupDir?: string
  writeFile?: (path: string, content: string) => void
}

export class CodeMutator {
  private store: EvolutionStore
  private allowedDirs: string[]
  private projectRoot: string
  private backupDir: string
  private writeFile: (path: string, content: string) => void

  constructor(store: EvolutionStore = evolutionStore, options: CodeMutatorOptions = {}) {
    this.store = store
    this.allowedDirs = options.allowedDirs ? [...options.allowedDirs] : []
    this.projectRoot = resolve(options.projectRoot ?? process.cwd())
    this.backupDir = options.backupDir ?? join(this.projectRoot, "data", "evolve", "backups")
    this.writeFile = options.writeFile ?? ((path, content) => writeFileSync(path, content, "utf-8"))
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true })
    }
  }

  setAllowedDirs(dirs: string[]): void {
    this.allowedDirs = [...dirs]
  }

  getAllowedDirs(): string[] {
    return [...this.allowedDirs]
  }

  applyMutation(mutation: CodeMutation): boolean {
    const filePath = this.resolveTarget(mutation.filePath)

    if (!filePath) {
      log.error(`Refusing to mutate disallowed path: ${mutation.filePath}`)
      this.store.updateMutation(mutation.id, { status: "failed" })
      return false
    }

    if (!existsSync(filePath)) {
      log.error(`File not found: ${mutation.filePath}`)
      this.store.updateMutation(mutation.id, { status: "failed" })
      return false
    }

    let currentContent: string
    try {
      currentContent = readFileSync(filePath, "utf-8")
    } catch (err) {
      log.error(`Failed to read ${mutation.filePath}: ${err instanceof Error ? err.message : String(err)}`)
      this.store.updateMutation(mutation.id, { status: "failed" })
      return false
    }

    if (currentContent !== mutation.oldContent) {
      log.error(
        `Refusing to apply stale mutation ${mutation.id.slice(0, 12)} to ${mutation.filePath}: file changed since the mutation was proposed`,
      )
      this.store.updateMutation(mutation.id, { status: "failed" })
      return false
    }

    try {
      this.backupFile(filePath, mutation.filePath, mutation.id)
    } catch (err) {
      log.error(`Failed to back up ${mutation.filePath}: ${err instanceof Error ? err.message : String(err)}`)
      this.store.updateMutation(mutation.id, { status: "failed" })
      return false
    }

    try {
      this.store.updateMutation(mutation.id, { status: "applying" })
      this.writeAtomic(filePath, mutation.newContent)
      this.store.updateMutation(mutation.id, {
        status: "verifying",
        appliedAt: new Date().toISOString(),
      })
      log.info(`Applied mutation ${mutation.id.slice(0, 12)} → ${mutation.filePath}`)
      return true
    } catch (err) {
      log.error(`Failed to apply mutation ${mutation.id}: ${err instanceof Error ? err.message : String(err)}`)
      this.store.updateMutation(mutation.id, { status: "failed" })
      return false
    }
  }

  rollbackMutation(mutation: CodeMutation): boolean {
    const filePath = this.resolveTarget(mutation.filePath)

    if (!filePath) {
      log.error(`Refusing to roll back disallowed path: ${mutation.filePath}`)
      return false
    }

    const backupPath = this.getBackupPath(mutation.filePath, mutation.id)

    if (!existsSync(backupPath)) {
      log.error(`No backup found for ${mutation.filePath}`)
      return false
    }

    try {
      const original = readFileSync(backupPath, "utf-8")
      this.writeAtomic(filePath, original)
      this.store.updateMutation(mutation.id, {
        status: "rolled-back",
        rollbackAt: new Date().toISOString(),
      })
      log.info(`Rolled back mutation ${mutation.id.slice(0, 12)} → ${mutation.filePath}`)
      return true
    } catch (err) {
      log.error(`Failed to rollback mutation ${mutation.id}: ${err instanceof Error ? err.message : String(err)}`)
      return false
    }
  }

  private resolveTarget(filePath: string): string | null {
    if (!filePath) return null
    if (isAbsolute(filePath)) return null

    const absolute = resolve(this.projectRoot, filePath)
    const rel = relative(this.projectRoot, absolute)

    if (!rel) return null
    if (rel.startsWith("..")) return null
    if (isAbsolute(rel)) return null
    if (!this.isAllowed(rel)) return null

    return absolute
  }

  private isAllowed(relPath: string): boolean {
    if (this.allowedDirs.length === 0) return true

    const normalized = relPath.replace(/\\/g, "/")
    return this.allowedDirs.some((dir) => {
      const cleaned = dir.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "")
      if (!cleaned) return false
      return normalized === cleaned || normalized.startsWith(`${cleaned}/`)
    })
  }

  private writeAtomic(filePath: string, content: string): void {
    const dir = dirname(filePath)
    const tmpPath = join(dir, `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
    try {
      this.writeFile(tmpPath, content)
      renameSync(tmpPath, filePath)
    } catch (err) {
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath)
      } catch {
        // temp file cleanup is best-effort
      }
      throw err
    }
  }

  private backupFile(sourcePath: string, relativePath: string, mutationId: string): void {
    const backupPath = this.getBackupPath(relativePath, mutationId)
    copyFileSync(sourcePath, backupPath)
  }

  private getBackupPath(relativePath: string, mutationId: string): string {
    const safeName = relativePath.replace(/[\\/]/g, "_").replace(/[^a-zA-Z0-9_.-]/g, "_")
    const safeId = mutationId.replace(/[^a-zA-Z0-9_.-]/g, "_")
    return join(this.backupDir, `${safeName}.${safeId}.bak`)
  }
}

export const codeMutator = new CodeMutator(evolutionStore, { allowedDirs: DEFAULT_EVOLUTION_CONFIG.allowedDirs })

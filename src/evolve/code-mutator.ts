import { writeFileSync, copyFileSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { createLogger } from "../cli/logger"
import type { CodeMutation } from "./types"
import { evolutionStore } from "./evolution-store"

const log = createLogger("code-mutator")

export class CodeMutator {
  private backupDir: string

  constructor() {
    this.backupDir = join(process.cwd(), "data", "evolve", "backups")
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true })
    }
  }

  applyMutation(mutation: CodeMutation): boolean {
    const filePath = join(process.cwd(), mutation.filePath)

    if (!existsSync(filePath)) {
      log.error(`File not found: ${mutation.filePath}`)
      evolutionStore.updateMutation(mutation.id, { status: "failed" })
      return false
    }

    this.backupFile(mutation.filePath)

    try {
      evolutionStore.updateMutation(mutation.id, { status: "applying" })
      writeFileSync(filePath, mutation.newContent, "utf-8")
      evolutionStore.updateMutation(mutation.id, {
        status: "verifying",
        appliedAt: new Date().toISOString(),
      })
      log.info(`Applied mutation ${mutation.id.slice(0, 12)} → ${mutation.filePath}`)
      return true
    } catch (err) {
      log.error(`Failed to apply mutation ${mutation.id}: ${err instanceof Error ? err.message : String(err)}`)
      evolutionStore.updateMutation(mutation.id, { status: "failed" })
      return false
    }
  }

  rollbackMutation(mutation: CodeMutation): boolean {
    const filePath = join(process.cwd(), mutation.filePath)
    const backupPath = this.getBackupPath(mutation.filePath)

    if (!existsSync(backupPath)) {
      log.error(`No backup found for ${mutation.filePath}`)
      return false
    }

    try {
      copyFileSync(backupPath, filePath)
      evolutionStore.updateMutation(mutation.id, {
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

  private backupFile(relativePath: string): void {
    const sourcePath = join(process.cwd(), relativePath)
    const backupPath = this.getBackupPath(relativePath)
    copyFileSync(sourcePath, backupPath)
  }

  private getBackupPath(relativePath: string): string {
    const safeName = relativePath.replace(/[\\/]/g, "_").replace(/[^a-zA-Z0-9_.-]/g, "_")
    return join(this.backupDir, `${safeName}.bak`)
  }
}

export const codeMutator = new CodeMutator()

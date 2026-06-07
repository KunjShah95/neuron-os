import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { createLogger } from "../cli/logger"

const log = createLogger("checkpoint")

export class CheckpointManager {
  private checkpointsDir: string

  constructor() {
    this.checkpointsDir = join(process.cwd(), "data", "checkpoints")
    if (!existsSync(this.checkpointsDir)) {
      mkdirSync(this.checkpointsDir, { recursive: true })
    }
  }

  public createCheckpoint(taskId: string, sourceDir: string): string {
    const checkpointId = `${taskId}-${Date.now()}`
    const destDir = join(this.checkpointsDir, checkpointId)

    log.info(`Creating checkpoint for task ${taskId} at ${destDir}`)

    // Copy the entire source directory to the checkpoint directory
    cpSync(sourceDir, destDir, {
      recursive: true,
      filter: (src) => {
        // Skip node_modules and .git for speed/size
        if (src.includes("node_modules") || src.includes(".git")) return false
        return true
      },
    })

    return checkpointId
  }

  public restoreCheckpoint(checkpointId: string, targetDir: string): void {
    const sourceDir = join(this.checkpointsDir, checkpointId)
    if (!existsSync(sourceDir)) {
      throw new Error(`Checkpoint ${checkpointId} does not exist`)
    }

    log.warn(`Restoring checkpoint ${checkpointId} to ${targetDir}`)

    // Clean target directory safely (could be dangerous if targetDir is root!)
    // For safety, we only clean if it's within our managed workspace or just overwrite.
    // Overwriting is safer for a sandbox.
    cpSync(sourceDir, targetDir, { recursive: true, force: true })
  }

  public listCheckpoints(): string[] {
    if (!existsSync(this.checkpointsDir)) return []

    try {
      return readdirSync(this.checkpointsDir)
        .filter((name) => {
          // Only return directories (each checkpoint is a directory)
          return statSync(join(this.checkpointsDir, name)).isDirectory()
        })
        .sort()
        .reverse() // newest first
    } catch (err) {
      log.error(`Failed to list checkpoints: ${err}`)
      return []
    }
  }
}

export const checkpointManager = new CheckpointManager()

import { readFileSync, existsSync } from "node:fs"
import { join, dirname, resolve } from "node:path"
import { parse as parseYaml } from "yaml"
import { getActiveProject, getProjectDataDir } from "./context"

export interface AegisConfig {
  agentTypes?: string[]
  agentModels?: Record<string, {
    provider?: string
    model?: string
    budgetUsd?: number
    maxTokens?: number
  }>
  budgetUsd?: number
  skills?: string[]
  allowedTools?: string[]
  sandbox?: {
    enabled?: boolean
    type?: "none" | "filesystem" | "process" | "docker"
  }
}

const CONFIG_FILENAMES = [
  "aegis.config.ts",
  "aegis.config.json",
  "aegis.config.yaml",
  "aegis.config.yml",
]

export class ConfigLoader {
  static load(projectRoot?: string): AegisConfig | null {
    let searchDir: string | null = null

    if (projectRoot) {
      searchDir = projectRoot
    } else {
      const active = getActiveProject()
      if (active) {
        searchDir = getProjectDataDir(active)
      }
    }

    if (!searchDir) {
      searchDir = process.cwd()
    }

    const configPath = this.findConfig(searchDir)
    if (!configPath) return null

    try {
      const raw = readFileSync(configPath, "utf-8")
      const ext = configPath.split(".").pop()?.toLowerCase()

      let config: Record<string, unknown>
      if (ext === "json") {
        config = JSON.parse(raw) as Record<string, unknown>
      } else if (ext === "yaml" || ext === "yml") {
        config = parseYaml(raw) as Record<string, unknown>
      } else if (ext === "ts") {
        throw new Error(
          "TypeScript config files (aegis.config.ts) require dynamic import — use .json or .yaml instead",
        )
      } else {
        return null
      }

      return config as AegisConfig
    } catch {
      return null
    }
  }

  static findConfig(startDir?: string): string | null {
    let dir = startDir ? resolve(startDir) : process.cwd()

    while (true) {
      for (const filename of CONFIG_FILENAMES) {
        const fullPath = join(dir, filename)
        if (existsSync(fullPath)) {
          return fullPath
        }
      }

      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }

    return null
  }

  static merge(
    config: Partial<AegisConfig>,
    defaults?: Partial<AegisConfig>,
  ): AegisConfig {
    const result: AegisConfig = { ...defaults, ...config } as AegisConfig

    if (defaults?.agentModels || config.agentModels) {
      result.agentModels = {
        ...(defaults?.agentModels ?? {}),
        ...(config.agentModels ?? {}),
      }
    }

    if (defaults?.sandbox || config.sandbox) {
      result.sandbox = {
        ...(defaults?.sandbox ?? {}),
        ...(config.sandbox ?? {}),
      } as AegisConfig["sandbox"]
    }

    return result
  }
}

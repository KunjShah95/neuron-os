import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"

export interface AppConfig {
  apiKey?: string
  provider?: string
  model?: string
  baseUrl?: string
  temperature?: number
  maxTokens?: number
  workspace?: string
  agentName?: string
  startOnBoot?: boolean
}

function configDir(): string {
  return join(homedir(), ".aegis")
}

function configPath(): string {
  return join(configDir(), "config.json")
}

export function loadConfig(): AppConfig {
  const path = configPath()
  if (!existsSync(path)) return {}
  try {
    const raw = readFileSync(path, "utf-8")
    return JSON.parse(raw) as AppConfig
  } catch {
    return {}
  }
}

export function saveConfig(config: AppConfig): void {
  const dir = configDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf-8")
}

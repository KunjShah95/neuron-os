import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { parse, stringify } from "yaml"
import { CiConfig, type RepoConfig } from "./types"

const CONFIG_PATH = join(homedir(), ".aegis", "ci.yaml")

const DEFAULT_CONFIG = { repos: [], port: 7117 }

export function loadCiConfig(): CiConfig {
  if (!existsSync(CONFIG_PATH)) return DEFAULT_CONFIG

  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8")
    const parsed = parse(raw)
    const result = CiConfig.safeParse(parsed || {})
    if (result.success) return result.data
    console.warn("Invalid CI config:", result.error.issues)
    return DEFAULT_CONFIG
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveCiConfig(config: CiConfig): void {
  const dir = join(homedir(), ".aegis")
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(CONFIG_PATH, stringify(config), "utf-8")
}

export function findRepoConfig(config: CiConfig, repo: string): RepoConfig | undefined {
  const [owner, name] = repo.split("/")
  if (!owner || !name) return undefined
  return config.repos.find((r) => r.owner === owner && r.name === name)
}

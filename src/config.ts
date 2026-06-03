import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { homedir } from "os"
import { join } from "path"
import { z } from "zod"
import { createLogger } from "./cli/logger"

const log = createLogger("config")

// ── Zod Schema ────────────────────────────────────────────────────────

/**
 * Configuration schema using Zod for validation.
 * Supports all known configuration keys with proper types and constraints.
 */
export const AppConfigSchema = z.object({
  apiKey: z.string().min(1, "API key cannot be empty").optional(),
  provider: z.string().optional(),
  model: z.string().min(1, "Model name cannot be empty").optional(),
  baseUrl: z.string().url("baseUrl must be a valid URL").optional().or(z.literal("")),
  temperature: z.number().min(0).max(2, "Temperature must be between 0 and 2").optional(),
  maxTokens: z.number().int().positive("maxTokens must be positive").optional(),
  workspace: z.string().min(1, "Workspace path cannot be empty").optional(),
  agentName: z.string().min(1, "Agent name cannot be empty").optional(),
  startOnBoot: z.boolean().optional(),
})

/** Zod inference type for AppConfig */
export type AppConfig = z.infer<typeof AppConfigSchema>

// ── Paths ─────────────────────────────────────────────────────────────

function configDir(): string {
  return join(homedir(), ".aegis")
}

function configPath(): string {
  return join(configDir(), "config.json")
}

// ── Public API ────────────────────────────────────────────────────────

export function loadConfig(): AppConfig {
  const path = configPath()
  if (!existsSync(path)) return {}
  try {
    const raw = readFileSync(path, "utf-8")
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const result = AppConfigSchema.safeParse(parsed)
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      log.warn("Config validation failed, using partial config", { issues })
      // Return what we can salvage — strip invalid fields
      const cleaned: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(parsed)) {          const fieldResult = AppConfigSchema.shape[key as keyof typeof AppConfigSchema.shape]
          if (fieldResult) {
            const fieldCheck = fieldResult.safeParse(value)
            if (fieldCheck.success) {
              cleaned[key as keyof typeof cleaned] = value as never
            }
          }
      }
      return cleaned as AppConfig
    }
    return result.data
  } catch (err) {
    log.warn("Failed to parse config file, returning empty config", { error: String(err) })
    return {}
  }
}

export function saveConfig(config: AppConfig): void {
  const dir = configDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf-8")
}

/**
 * Validate a partial config object against the schema.
 * Returns the validated data or throws with a descriptive error.
 */
export function validateConfig(config: Record<string, unknown>): AppConfig {
  const result = AppConfigSchema.partial().safeParse(config)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
    throw new Error(`Config validation failed:\n${issues}`)
  }
  return result.data as AppConfig
}

import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"

export interface SoulContext {
  agentType?: string
  cwd: string
}

function buildSoulCandidates(ctx: SoulContext): string[] {
  if (!ctx.agentType) return []

  const home = process.env.HOME || process.env.USERPROFILE || ""
  return [
    resolve(ctx.cwd, "skills", ctx.agentType, "SOUL.md"),
    resolve(ctx.cwd, ".aegis", "skills", ctx.agentType, "SOUL.md"),
    home ? resolve(home, ".aegis", "skills", ctx.agentType, "SOUL.md") : "",
  ].filter(Boolean)
}

export async function loadSoul(ctx: SoulContext): Promise<string> {
  for (const candidate of buildSoulCandidates(ctx)) {
    if (!existsSync(candidate)) continue

    try {
      return await readFile(candidate, "utf-8")
    } catch {
      continue
    }
  }

  return ""
}

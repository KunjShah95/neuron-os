/**
 * src/skills/evolution/retirement.ts
 *
 * Retirement logic for the self-evolving skills loop.
 *
 * Skills that fail their regression suite for 7 consecutive days are
 * moved to ~/.aegis/skills/.archive/ and kept for 90 days for forensics.
 *
 * The evolution manifest tracks every retirement so the system can
 * answer "what happened to skill X?" even after it's archived.
 */

import { createLogger } from "../../cli/logger"
import { existsSync, mkdirSync, renameSync, readdirSync, statSync } from "node:fs"
import { rm, mkdir, readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"

const log = createLogger("skill-retirement")

// ── Paths ──────────────────────────────────────────────────────────────

function skillsDir(): string {
  return resolve(process.cwd(), "skills")
}

function archiveDir(): string {
  return resolve(process.cwd(), ".aegis", "skills", ".archive")
}

function manifestPath(): string {
  return resolve(process.cwd(), ".aegis", "skills", ".evolution_manifest.json")
}

// ── Manifest entry type ────────────────────────────────────────────────

interface ManifestEntry {
  version: number
  ts: number
  action: "create" | "approve" | "reject" | "patch" | "retire" | "publish"
  skill_name: string
  detail: string
  evidence_count: number
}

// ── Load evolution manifest ────────────────────────────────────────────

async function loadManifest(): Promise<ManifestEntry[]> {
  try {
    const raw = await readFile(manifestPath(), "utf-8")
    return JSON.parse(raw) as ManifestEntry[]
  } catch {
    return []
  }
}

async function appendManifest(entry: ManifestEntry): Promise<void> {
  const dir = resolve(process.cwd(), ".aegis", "skills")
  await mkdir(dir, { recursive: true })

  let manifest: ManifestEntry[] = []
  try {
    const raw = await readFile(manifestPath(), "utf-8")
    manifest = JSON.parse(raw) as ManifestEntry[]
  } catch {
    manifest = []
  }

  manifest.push(entry)
  await writeFile(manifestPath(), JSON.stringify(manifest, null, 2), "utf-8")
}

// ── Check if a skill should be retired ─────────────────────────────────

export interface RetirementCheck {
  skillName: string
  shouldRetire: boolean
  reason: string
  recentFailures: number
  totalChecks: number
}

export function checkRetirementEligibility(skillName: string, failureDays: number = 7): RetirementCheck {
  const skillDir = join(skillsDir(), skillName)
  if (!existsSync(skillDir)) {
    return { skillName, shouldRetire: false, reason: "skill directory not found", recentFailures: 0, totalChecks: 0 }
  }

  // Look for post_mortems in the last N days
  const postMortemsDir = join(skillDir, ".post_mortems")
  if (!existsSync(postMortemsDir)) {
    return { skillName, shouldRetire: false, reason: "no post-mortems recorded", recentFailures: 0, totalChecks: 0 }
  }

  const now = Date.now()
  const cutoff = now - failureDays * 24 * 60 * 60 * 1000
  const files = readdirSync(postMortemsDir).filter((f) => f.endsWith(".json"))
  const recentFiles = files.filter((f) => {
    try {
      const fPath = join(postMortemsDir, f)
      const stat = statSync(fPath)
      return stat.mtimeMs >= cutoff
    } catch {
      return false
    }
  })

  const totalChecks = recentFiles.length
  const shouldRetire = totalChecks >= 5

  return {
    skillName,
    shouldRetire,
    reason: shouldRetire
      ? `${totalChecks} failures in the last ${failureDays} days`
      : `only ${totalChecks} failures in the last ${failureDays} days (need ≥5)`,
    recentFailures: totalChecks,
    totalChecks,
  }
}

// ── Retire a skill (move to archive) ───────────────────────────────────

export async function retireSkill(skillName: string, reason: string): Promise<boolean> {
  const source = join(skillsDir(), skillName)
  if (!existsSync(source)) {
    log.warn(`cannot retire "${skillName}": source directory not found`)
    return false
  }

  const archive = join(archiveDir(), skillName)
  if (!existsSync(archiveDir())) {
    mkdirSync(archiveDir(), { recursive: true })
  }

  try {
    renameSync(source, archive)
    await appendManifest({
      version: (await loadManifest()).length + 1,
      ts: Date.now(),
      action: "retire",
      skill_name: skillName,
      detail: reason,
      evidence_count: 0,
    })
    log.info(`skill "${skillName}" retired → ${archive}`)
    return true
  } catch (err: unknown) {
    log.error(`failed to retire "${skillName}": ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

// ── Check all skills for retirement ────────────────────────────────────

export async function retireUnderperformers(failureDays: number = 7): Promise<string[]> {
  const skillsBase = skillsDir()
  if (!existsSync(skillsBase)) return []

  const retired: string[] = []
  const entries = readdirSync(skillsBase, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const check = checkRetirementEligibility(entry.name, failureDays)
    if (check.shouldRetire) {
      const ok = await retireSkill(entry.name, check.reason)
      if (ok) retired.push(entry.name)
    }
  }

  if (retired.length > 0) {
    log.info(`retired ${retired.length} underperforming skills: ${retired.join(", ")}`)
  }

  return retired
}

// ── Archive cleanup: delete entries older than retention days ──────────

export async function cleanArchive(retentionDays: number = 90): Promise<number> {
  const archive = archiveDir()
  if (!existsSync(archive)) return 0

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const entries = readdirSync(archive, { withFileTypes: true })
  let deleted = 0

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dirPath = join(archive, entry.name)
    try {
      const stat = statSync(dirPath)
      if (stat.mtimeMs < cutoff) {
        await rm(dirPath, { recursive: true, force: true })
        deleted++
      }
    } catch {
      // skip
    }
  }

  if (deleted > 0) {
    log.info(`cleaned ${deleted} archived skills older than ${retentionDays} days`)
  }

  return deleted
}

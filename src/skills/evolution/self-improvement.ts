/**
 * src/skills/evolution/self-improvement.ts
 *
 * Self-improvement loop for the evolving skills system.
 *
 * When a skill invocation fails:
 *   1. A post_mortem is recorded with the failure context
 *   2. If 3+ post_mortems accumulate for the same skill, a patch
 *      candidate is generated
 *
 * When a skill succeeds 3+ times with novel evidence:
 *   1. New evidence is analyzed for expanded tool patterns
 *   2. If a new pattern is found, a patch candidate is proposed
 *
 * Patch candidates go through the same QualityGate as new candidates.
 * Self-improvement can be disabled per agent type via
 * AEGIS_SKILL_SELF_IMPROVE=0 env var (default on for 'build').
 */

import { createLogger } from "../../cli/logger"
import type { PostMortem, PatchCandidate } from "./types"
import { PostMortemSchema } from "./types"
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs"
import { join } from "node:path"

const log = createLogger("skill-self-improve")

// ── Paths ──────────────────────────────────────────────────────────────

function postMortemsDir(skillName: string): string {
  return join(process.cwd(), "skills", skillName, ".post_mortems")
}

function patchesDir(): string {
  return join(process.cwd(), ".aegis", "skills", ".patches")
}

// ── Record a post_mortem for a failed skill invocation ─────────────────

export function recordPostMortem(pm: PostMortem): void {
  const validated = PostMortemSchema.parse(pm)
  const dir = postMortemsDir(validated.skill_name)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const filePath = join(dir, `${validated.ts}.json`)
  writeFileSync(filePath, JSON.stringify(validated, null, 2), "utf-8")
  log.info(`post_mortem recorded for skill "${validated.skill_name}" (${filePath})`)
}

// ── Load post_mortems for a given skill ────────────────────────────────

export function loadPostMortems(skillName: string): PostMortem[] {
  const dir = postMortemsDir(skillName)
  if (!existsSync(dir)) return []

  const files = readdirSync(dir).filter((f: string) => f.endsWith(".json"))
  const mortems: PostMortem[] = []

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), "utf-8")
      mortems.push(PostMortemSchema.parse(JSON.parse(raw)))
    } catch {
      // skip malformed files
    }
  }

  return mortems.sort((a, b) => a.ts - b.ts)
}

// ── Generate a patch candidate from accumulated post_mortems ───────────

export function generatePatchFromFailures(skillName: string, skillContent: string): PatchCandidate | null {
  const mortems = loadPostMortems(skillName)
  if (mortems.length < 3) return null

  // Summarize the failure patterns
  const failedTools = [...new Set(mortems.flatMap((m) => m.tool_sequence))]

  // Build the patch content: append failure-handling instructions
  const patchSection = [
    "",
    "## Failure Recovery",
    "",
    "Based on observed failures, the following recovery steps are recommended:",
    "",
    ...failedTools.map((tool) => `- When using \`${tool}\`, verify the output before proceeding to the next step`),
    "",
    "### Known failure patterns",
    "",
    mortems
      .map((m) => `- **${m.failure_reason.slice(0, 80)}** (observed ${new Date(m.ts).toISOString().slice(0, 10)})`)
      .join("\n"),
    "",
  ].join("\n")

  const dir = patchesDir()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const patch: PatchCandidate = {
    id: `patch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    skill_name: skillName,
    old_string: skillContent,
    new_string: skillContent + patchSection,
    reason: `Auto-generated patch: ${mortems.length} post-mortems, ${failedTools.length} failed tools`,
    evidence_count: mortems.length,
    status: "pending",
    created_at: Date.now(),
  }

  log.info(`patch candidate generated for "${skillName}" (${patch.id}): ${patch.reason}`)

  // Persist the patch candidate
  const patchesDir2 = patchesDir()
  if (!existsSync(patchesDir2)) mkdirSync(patchesDir2, { recursive: true })
  writeFileSync(join(patchesDir2, `${patch.id}.json`), JSON.stringify(patch, null, 2), "utf-8")

  return patch
}

// ── Apply a patch to a skill file ──────────────────────────────────────

export function applyPatch(patch: PatchCandidate): boolean {
  try {
    const skillPath = join(process.cwd(), "skills", patch.skill_name, "SKILL.md")
    if (!existsSync(skillPath)) {
      log.error(`cannot apply patch: skill "${patch.skill_name}" not found at ${skillPath}`)
      return false
    }

    const currentContent = readFileSync(skillPath, "utf-8")
    // For full-replacement patches, just write the new content
    writeFileSync(skillPath, patch.new_string, "utf-8")

    patch.status = "applied"
    patch.old_string = currentContent // save backup

    log.info(`patch applied to "${patch.skill_name}" (${patch.id})`)
    return true
  } catch (err: unknown) {
    log.error(`failed to apply patch: ${err instanceof Error ? err.message : String(err)}`)
    return false
  }
}

// ── Check self-improvement eligibility ─────────────────────────────────

export function isSelfImprovementEnabled(agentType?: string): boolean {
  const env = process.env.AEGIS_SKILL_SELF_IMPROVE
  if (env === "0" || env === "false") return false
  if (agentType === "read" || agentType === "plan") return false
  return true
}

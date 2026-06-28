/**
 * src/skills/import/index.ts
 *
 * Detect and import skills from other terminal AI assistants the user may
 * already have configured. Each source format is converted to the Aegis
 * SKILL.md format and written into the destination skill search path.
 *
 * Supported sources:
 *  - Claude Code   — CLAUDE.md, ~/.claude/CLAUDE.md, .claude/*.md
 *  - Continue.dev  — ~/.continue/config.json  (customCommands[])
 *  - Cursor        — .cursorrules, .cursor/rules/*.mdc
 *  - Windsurf      — .windsurfrules (project + global)
 *  - Aider         — .aider.conf.yml / ~/.aider.conf.yml  (system-prompt key)
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, basename, resolve } from "node:path"
import { parse as parseYaml } from "yaml"

// ── Types ─────────────────────────────────────────────────────────────────────

export type AssistantKind = "claude-code" | "continue" | "cursor" | "windsurf" | "aider"

export interface ExternalSkillSource {
  kind: AssistantKind
  /** Human-readable label for display */
  label: string
  /** Absolute path of the source file */
  filePath: string
  /** Skills extracted from this source */
  skills: DetectedSkill[]
}

export interface DetectedSkill {
  name: string
  description: string
  content: string
}

export interface ImportResult {
  source: ExternalSkillSource
  skill: DetectedSkill
  destPath: string
  skipped: boolean
  reason?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function safeRead(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf-8")
  } catch {
    return null
  }
}

function safeReaddir(dirPath: string): string[] {
  try {
    return readdirSync(dirPath) as string[]
  } catch {
    return []
  }
}

/** Slugify a string into a valid skill name */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64) || "imported-skill"
}

/** Build a SKILL.md string from parts, with properly escaped YAML values */
function buildSkillMd(name: string, description: string, author: string, body: string): string {
  const escapedDesc = description.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
  return [
    "---",
    `name: ${name}`,
    `description: "${escapedDesc}"`,
    `version: 1.0.0`,
    `author: ${author}`,
    `tags: [imported, ${author}]`,
    "---",
    "",
    body.trim(),
    "",
  ].join("\n")
}

// ── Source detectors ──────────────────────────────────────────────────────────

function detectClaudeCode(cwd: string): ExternalSkillSource[] {
  const sources: ExternalSkillSource[] = []

  const candidates: Array<{ file: string; label: string }> = [
    { file: join(cwd, "CLAUDE.md"), label: "CLAUDE.md (project)" },
    { file: join(homedir(), ".claude", "CLAUDE.md"), label: "CLAUDE.md (global)" },
  ]

  // .claude/*.md files
  const dotClaudeDir = join(cwd, ".claude")
  if (existsSync(dotClaudeDir)) {
    for (const entry of safeReaddir(dotClaudeDir)) {
      if (entry.endsWith(".md") && entry !== "CLAUDE.md") {
        candidates.push({ file: join(dotClaudeDir, entry), label: `.claude/${entry}` })
      }
    }
  }

  for (const { file, label } of candidates) {
    const raw = safeRead(file)
    if (!raw || !raw.trim()) continue

    const name = slugify(`claude-code-${basename(file, ".md")}`)
    const firstLine = raw.split("\n").find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "").trim()
    const description = firstLine || `Imported from ${label}`

    sources.push({
      kind: "claude-code",
      label,
      filePath: file,
      skills: [{ name, description, content: raw }],
    })
  }

  return sources
}

function detectContinue(cwd: string): ExternalSkillSource[] {
  const configPaths = [
    join(homedir(), ".continue", "config.json"),
    join(cwd, ".continue", "config.json"),
  ]

  const sources: ExternalSkillSource[] = []

  for (const configPath of configPaths) {
    const raw = safeRead(configPath)
    if (!raw) continue

    let config: unknown
    try {
      config = JSON.parse(raw)
    } catch {
      continue
    }

    if (!config || typeof config !== "object") continue

    const cmds = (config as Record<string, unknown>)["customCommands"]
    if (!Array.isArray(cmds) || cmds.length === 0) continue

    const skills: DetectedSkill[] = []
    for (const cmd of cmds) {
      if (!cmd || typeof cmd !== "object") continue
      const c = cmd as Record<string, unknown>
      const rawName = typeof c["name"] === "string" ? c["name"] : ""
      const rawDesc = typeof c["description"] === "string" ? c["description"] : ""
      const rawPrompt = typeof c["prompt"] === "string" ? c["prompt"] : ""
      if (!rawName && !rawPrompt) continue

      const name = slugify(`continue-${rawName || "command"}`)
      const description = rawDesc || `Continue.dev custom command: ${rawName}`
      const body = `## Continue.dev Custom Command: ${rawName}\n\n${rawPrompt}`

      skills.push({ name, description, content: body })
    }

    if (skills.length > 0) {
      sources.push({
        kind: "continue",
        label: `Continue.dev config (${configPath})`,
        filePath: configPath,
        skills,
      })
    }
  }

  return sources
}

function detectCursor(cwd: string): ExternalSkillSource[] {
  const sources: ExternalSkillSource[] = []

  // .cursorrules at project root
  const cursorRules = join(cwd, ".cursorrules")
  const raw = safeRead(cursorRules)
  if (raw && raw.trim()) {
    const firstLine = raw.split("\n").find((l) => l.trim())?.trim() || ""
    const description = firstLine.startsWith("#")
      ? firstLine.replace(/^#+\s*/, "")
      : "Imported Cursor project rules"
    sources.push({
      kind: "cursor",
      label: ".cursorrules",
      filePath: cursorRules,
      skills: [{ name: "cursor-rules", description, content: raw }],
    })
  }

  // .cursor/rules/*.mdc
  const rulesDir = join(cwd, ".cursor", "rules")
  if (existsSync(rulesDir)) {
    for (const entry of safeReaddir(rulesDir)) {
      if (!entry.endsWith(".mdc") && !entry.endsWith(".md")) continue
      const filePath = join(rulesDir, entry)
      const content = safeRead(filePath)
      if (!content || !content.trim()) continue

      const baseName = basename(entry, entry.endsWith(".mdc") ? ".mdc" : ".md")
      const name = slugify(`cursor-${baseName}`)
      const firstLine = content.split("\n").find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "").trim()
      const description = firstLine || `Imported Cursor rule: ${baseName}`

      sources.push({
        kind: "cursor",
        label: `.cursor/rules/${entry}`,
        filePath,
        skills: [{ name, description, content }],
      })
    }
  }

  return sources
}

function detectWindsurf(cwd: string): ExternalSkillSource[] {
  const candidates = [
    { file: join(cwd, ".windsurfrules"), label: ".windsurfrules (project)" },
    { file: join(homedir(), ".windsurfrules"), label: ".windsurfrules (global)" },
  ]

  const sources: ExternalSkillSource[] = []
  for (const { file, label } of candidates) {
    const raw = safeRead(file)
    if (!raw || !raw.trim()) continue

    const firstLine = raw.split("\n").find((l) => l.trim())?.trim() || ""
    const description = firstLine.startsWith("#")
      ? firstLine.replace(/^#+\s*/, "")
      : "Imported Windsurf rules"
    sources.push({
      kind: "windsurf",
      label,
      filePath: file,
      skills: [{ name: "windsurf-rules", description, content: raw }],
    })
  }

  return sources
}

function detectAider(cwd: string): ExternalSkillSource[] {
  const candidates = [
    { file: join(cwd, ".aider.conf.yml"), label: ".aider.conf.yml (project)" },
    { file: join(homedir(), ".aider.conf.yml"), label: ".aider.conf.yml (global)" },
  ]

  const sources: ExternalSkillSource[] = []
  for (const { file, label } of candidates) {
    const raw = safeRead(file)
    if (!raw || !raw.trim()) continue

    let parsed: unknown
    try {
      parsed = parseYaml(raw)
    } catch {
      continue
    }

    if (!parsed || typeof parsed !== "object") continue
    const prompt = (parsed as Record<string, unknown>)["system-prompt"]
    if (typeof prompt !== "string" || !prompt.trim()) continue

    sources.push({
      kind: "aider",
      label,
      filePath: file,
      skills: [
        {
          name: "aider-system-prompt",
          description: "Imported Aider system prompt",
          content: `## Aider System Prompt\n\n${prompt.trim()}`,
        },
      ],
    })
  }

  return sources
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scan the working directory and user home paths for skills defined in other
 * terminal AI assistants. Returns all detected sources.
 */
export function detectSources(cwd: string): ExternalSkillSource[] {
  return [
    ...detectClaudeCode(cwd),
    ...detectContinue(cwd),
    ...detectCursor(cwd),
    ...detectWindsurf(cwd),
    ...detectAider(cwd),
  ]
}

/**
 * Write detected skills to destDir as SKILL.md files.
 * Returns one ImportResult per skill.
 */
export function importSources(
  sources: ExternalSkillSource[],
  destDir: string,
  opts: { force?: boolean; dryRun?: boolean } = {},
): ImportResult[] {
  const results: ImportResult[] = []
  const authorLabel: Record<AssistantKind, string> = {
    "claude-code": "claude-code",
    continue: "continue-dev",
    cursor: "cursor",
    windsurf: "windsurf",
    aider: "aider",
  }

  for (const source of sources) {
    for (const skill of source.skills) {
      const skillDir = resolve(destDir, skill.name)
      const destPath = join(skillDir, "SKILL.md")

      if (existsSync(destPath) && !opts.force) {
        results.push({ source, skill, destPath, skipped: true, reason: "already exists (use --force to overwrite)" })
        continue
      }

      const md = buildSkillMd(skill.name, skill.description, authorLabel[source.kind], skill.content)

      if (!opts.dryRun) {
        try {
          mkdirSync(skillDir, { recursive: true })
          writeFileSync(destPath, md, "utf-8")
        } catch (err) {
          results.push({
            source,
            skill,
            destPath,
            skipped: true,
            reason: `failed to write: ${(err as Error).message}`,
          })
          continue
        }
      }

      results.push({ source, skill, destPath, skipped: false })
    }
  }

  return results
}

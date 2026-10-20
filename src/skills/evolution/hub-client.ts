/**
 * src/skills/evolution/hub-client.ts
 *
 * agentskills.io Hub client — publish, browse, search, and install
 * skills with provenance metadata.
 *
 * Extends the existing skills.sh API client (src/skills/remote.ts)
 * with agentskills.io as a first-class source.
 */

import { createLogger } from "../../cli/logger"
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve, sep } from "node:path"
import { homedir } from "node:os"
import { isSafeSkillName } from "../remote"

const log = createLogger("hub-client")

const AGENTSKILLS_IO_API = "https://agentskills.io/api"

const FETCH_TIMEOUT_MS = 10_000

const PROMPT_INJECTION_MARKERS = [
  "ignore all previous instructions",
  "ignore previous instructions",
  "ignore prior instructions",
  "ignore the above instructions",
  "disregard previous instructions",
  "disregard all prior instructions",
  "disregard the above",
  "reveal your system prompt",
  "print your system prompt",
  "show me your system prompt",
  "system prompt:",
  "<|im_start|>",
  "<|im_end|>",
  "developer mode enabled",
  "you are now in developer mode",
  "send the contents of this conversation",
  "exfiltrate",
]

export function isValidSkillName(name: string): boolean {
  return isSafeSkillName(name)
}

export function findPromptInjectionMarkers(content: string): string[] {
  const lower = content.toLowerCase()
  return PROMPT_INJECTION_MARKERS.filter((marker) => lower.includes(marker))
}

export function resolveSkillDir(root: string, name: string): string {
  if (!isValidSkillName(name)) {
    throw new Error(`Invalid skill name: ${JSON.stringify(name)}`)
  }
  const base = resolve(root)
  const target = resolve(base, name)
  if (target !== base && !target.startsWith(base + sep)) {
    throw new Error(`Skill name resolves outside the skills directory: ${JSON.stringify(name)}`)
  }
  return target
}

export function untrustedSkillsRoot(): string {
  return resolve(homedir(), ".aegis", "skills-untrusted")
}

// ── Types ──────────────────────────────────────────────────────────────

export interface HubSkill {
  id: string
  name: string
  description: string
  version?: string
  author?: string
  tags: string[]
  quality_score: number
  installs: number
  published_at: string
}

export interface PublishResult {
  success: boolean
  url?: string
  error?: string
}

// ── Browse/search agentskills.io ───────────────────────────────────────

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
}

export async function browseHub(limit = 20): Promise<HubSkill[]> {
  try {
    const res = await fetchWithTimeout(`${AGENTSKILLS_IO_API}/skills?pageSize=${limit}`)
    if (!res.ok) return []
    const body = (await res.json()) as { skills: HubSkill[] }
    return (body.skills || []).slice(0, limit)
  } catch {
    log.warn("agentskills.io browse failed (network error)")
    return []
  }
}

export async function searchHub(query: string, limit = 10): Promise<HubSkill[]> {
  try {
    const res = await fetchWithTimeout(`${AGENTSKILLS_IO_API}/skills/search?q=${encodeURIComponent(query)}&pageSize=${limit}`)
    if (!res.ok) return []
    const body = (await res.json()) as { skills: HubSkill[] }
    return (body.skills || []).slice(0, limit)
  } catch {
    log.warn("agentskills.io search failed (network error)")
    return []
  }
}

// ── Get skill detail ──────────────────────────────────────────────────

export async function getHubSkillDetail(id: string): Promise<HubSkill | null> {
  try {
    const res = await fetchWithTimeout(`${AGENTSKILLS_IO_API}/skills/${encodeURIComponent(id)}`)
    if (!res.ok) return null
    return (await res.json()) as HubSkill
  } catch {
    return null
  }
}

// ── Publish a skill to agentskills.io ─────────────────────────────────

export interface PublishOptions {
  name: string
  description: string
  tags?: string[]
  version?: string
  author?: string
  provenance: {
    quality_score: number
    evidence_count: number
    judge_verdict: "pass" | "fail" | "skipped"
  }
}

export async function publishToHub(options: PublishOptions): Promise<PublishResult> {
  const apiKey = process.env.AGENTSKILLS_API_KEY
  if (!apiKey) {
    return { success: false, error: "AGENTSKILLS_API_KEY not set" }
  }

  if (!isValidSkillName(options.name)) {
    return { success: false, error: `Invalid skill name: ${JSON.stringify(options.name)}` }
  }

  try {
    // Read the SKILL.md file
    const skillPath = join(process.cwd(), "skills", options.name, "SKILL.md")
    if (!existsSync(skillPath)) {
      return { success: false, error: `SKILL.md not found at ${skillPath}` }
    }

    const content = readFileSync(skillPath, "utf-8")

    // Create a tarball-like payload (in production this would be multipart)
    const payload = {
      name: options.name,
      description: options.description,
      tags: options.tags || [],
      version: options.version || "1.0.0",
      author: options.author,
      content,
      provenance: {
        ...options.provenance,
        evolution_manifest: `${process.cwd()}/.aegis/skills/.evolution_manifest.json`,
      },
    }

    const res = await fetchWithTimeout(`${AGENTSKILLS_IO_API}/skills`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => "unknown error")
      return { success: false, error: `HTTP ${res.status}: ${errBody}` }
    }

    const result = (await res.json()) as { id: string; url: string }
    log.info(`skill "${options.name}" published to agentskills.io: ${result.url}`)
    return { success: true, url: result.url }
  } catch (err: unknown) {
    log.error(`publish failed: ${err instanceof Error ? err.message : String(err)}`)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ── Install from agentskills.io ───────────────────────────────────────

export interface HubInstallOptions {
  skillsRoot?: string
  untrustedRoot?: string
}

export interface HubInstallResult {
  success: boolean
  path?: string
  error?: string
  trusted?: boolean
  status?: "installed" | "untrusted"
}

export async function installFromHub(id: string, options: HubInstallOptions = {}): Promise<HubInstallResult> {
  try {
    const detail = await getHubSkillDetail(id)
    if (!detail) {
      return { success: false, error: `Skill "${id}" not found on agentskills.io` }
    }

    if (!isValidSkillName(detail.name)) {
      log.warn("Rejected agentskills.io skill with an invalid name", { name: detail.name })
      return { success: false, error: `Rejected skill: invalid name "${detail.name}"` }
    }

    const res = await fetchWithTimeout(`${AGENTSKILLS_IO_API}/skills/${encodeURIComponent(id)}/download`)
    if (!res.ok) {
      return { success: false, error: `Download failed: HTTP ${res.status}` }
    }

    const { content } = (await res.json()) as { content: string }
    if (typeof content !== "string" || content.length === 0) {
      return { success: false, error: "Download failed: malformed skill content" }
    }

    const markers = findPromptInjectionMarkers(content)
    if (markers.length > 0) {
      log.warn("Rejected agentskills.io skill content", { name: detail.name, markerCount: markers.length })
      return {
        success: false,
        error: `Rejected skill "${detail.name}": content failed the prompt-injection sanity check`,
      }
    }

    const root = resolve(options.untrustedRoot ?? untrustedSkillsRoot())
    const skillDir = resolveSkillDir(root, detail.name)
    mkdirSync(skillDir, { recursive: true })
    const skillPath = join(skillDir, "SKILL.md")
    writeFileSync(skillPath, content, "utf-8")

    log.info(`skill "${detail.name}" quarantined as untrusted after install from agentskills.io`)
    return { success: true, path: skillPath, trusted: false, status: "untrusted" }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

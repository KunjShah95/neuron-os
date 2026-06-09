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
import { join } from "node:path"

const log = createLogger("hub-client")

const AGENTSKILLS_IO_API = "https://agentskills.io/api"

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

export async function browseHub(limit = 20): Promise<HubSkill[]> {
  try {
    const res = await fetch(`${AGENTSKILLS_IO_API}/skills?pageSize=${limit}`)
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
    const res = await fetch(`${AGENTSKILLS_IO_API}/skills/search?q=${encodeURIComponent(query)}&pageSize=${limit}`)
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
    const res = await fetch(`${AGENTSKILLS_IO_API}/skills/${encodeURIComponent(id)}`)
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

    const res = await fetch(`${AGENTSKILLS_IO_API}/skills`, {
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

export async function installFromHub(id: string): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const detail = await getHubSkillDetail(id)
    if (!detail) {
      return { success: false, error: `Skill "${id}" not found on agentskills.io` }
    }

    // Fetch the skill content
    const res = await fetch(`${AGENTSKILLS_IO_API}/skills/${encodeURIComponent(id)}/download`)
    if (!res.ok) {
      return { success: false, error: `Download failed: HTTP ${res.status}` }
    }

    const { content } = (await res.json()) as { content: string }

    // Write to local skills directory
    const skillDir = join(process.cwd(), "skills", detail.name)
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(join(skillDir, "SKILL.md"), content, "utf-8")

    log.info(`skill "${detail.name}" installed from agentskills.io`)
    return { success: true, path: join(skillDir, "SKILL.md") }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

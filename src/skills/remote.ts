const SKILLS_SH_API = "https://skills.sh/api"

export interface RemoteSkill {
  id: string
  name: string
  description: string
  owner: string
  repo: string
  installs: number
  tags: string[]
  rating?: number
}

interface SkillsResponse {
  skills: RemoteSkill[]
  total: number
  page: number
  pageSize: number
}

export async function fetchTopSkills(limit = 10): Promise<RemoteSkill[]> {
  try {
    const res = await fetch(`${SKILLS_SH_API}/skills/top?pageSize=${limit}`)
    if (!res.ok) {
      // Silently return empty array for API errors (404, 500, etc.)
      return []
    }
    const body = (await res.json()) as SkillsResponse
    return (body.skills || []).slice(0, limit)
  } catch {
    // Network errors or other issues - return empty array
    return []
  }
}

export async function searchSkills(query: string, limit = 10): Promise<RemoteSkill[]> {
  try {
    const res = await fetch(`${SKILLS_SH_API}/skills?query=${encodeURIComponent(query)}&pageSize=${limit}`)
    if (!res.ok) {
      // Silently return empty array for API errors
      return []
    }
    const body = (await res.json()) as SkillsResponse
    return (body.skills || []).slice(0, limit)
  } catch {
    // Network errors or other issues - return empty array
    return []
  }
}

export async function fetchSkillDetail(id: string): Promise<RemoteSkill | null> {
  try {
    const res = await fetch(`${SKILLS_SH_API}/skills/${encodeURIComponent(id)}`)
    if (!res.ok) return null
    const body = (await res.json()) as RemoteSkill
    return body || null
  } catch {
    return null
  }
}

export function buildSkillMarkdown(skill: RemoteSkill): string {
  const cleanDescription = skill.description.replace(/\r?\n/g, " ")
  const lines: string[] = [
    "---",
    `name: ${skill.name}`,
    `description: ${cleanDescription}`,
    `author: ${skill.owner}`,
  ]
  if (skill.tags?.length > 0) {
    lines.push(`tags: [${skill.tags.join(", ")}]`)
  }
  lines.push("---", "", `# ${skill.name}`, "", cleanDescription)
  if (skill.repo) {
    lines.push("", `_Source: ${skill.repo}_`)
  }
  return lines.join("\n") + "\n"
}

export async function fetchRegistryStats(): Promise<{ totalSkills: number; totalSources: number } | null> {
  try {
    const res = await fetch(`${SKILLS_SH_API}/skills/stats`)
    if (!res.ok) return null
    const body = await res.json() as { totalSkills?: number; total?: number; totalSources?: number; sources?: number }
    return {
      totalSkills: body.totalSkills ?? body.total ?? 0,
      totalSources: body.totalSources ?? body.sources ?? 0,
    }
  } catch {
    return null
  }
}

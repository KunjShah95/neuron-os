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
    return (body.skills || body as any || []).slice(0, limit)
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
    return (body.skills || body as any || []).slice(0, limit)
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
    return body as any || null
  } catch {
    return null
  }
}

export async function fetchRegistryStats(): Promise<{ totalSkills: number; totalSources: number } | null> {
  try {
    const res = await fetch(`${SKILLS_SH_API}/skills/stats`)
    if (!res.ok) return null
    const body = await res.json()
    return {
      totalSkills: (body as any).totalSkills ?? (body as any).total ?? 0,
      totalSources: (body as any).totalSources ?? (body as any).sources ?? 0,
    }
  } catch {
    return null
  }
}

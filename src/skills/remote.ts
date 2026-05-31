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
  const res = await fetch(`${SKILLS_SH_API}/skills/top?pageSize=${limit}`)
  if (!res.ok) throw new Error(`skills.sh API error: ${res.status}`)
  const body = (await res.json()) as SkillsResponse
  return (body.skills || body as any || []).slice(0, limit)
}

export async function searchSkills(query: string, limit = 10): Promise<RemoteSkill[]> {
  const res = await fetch(`${SKILLS_SH_API}/skills?query=${encodeURIComponent(query)}&pageSize=${limit}`)
  if (!res.ok) throw new Error(`skills.sh API error: ${res.status}`)
  const body = (await res.json()) as SkillsResponse
  return (body.skills || body as any || []).slice(0, limit)
}

export async function fetchSkillDetail(id: string): Promise<RemoteSkill | null> {
  const res = await fetch(`${SKILLS_SH_API}/skills/${encodeURIComponent(id)}`)
  if (!res.ok) return null
  const body = (await res.json()) as RemoteSkill
  return body as any || null
}

export async function fetchRegistryStats(): Promise<{ totalSkills: number; totalSources: number } | null> {
  const res = await fetch(`${SKILLS_SH_API}/skills/stats`)
  if (!res.ok) return null
  const body = await res.json()
  return {
    totalSkills: (body as any).totalSkills ?? (body as any).total ?? 0,
    totalSources: (body as any).totalSources ?? (body as any).sources ?? 0,
  }
}

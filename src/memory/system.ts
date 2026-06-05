import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises"
import { resolve, join } from "node:path"
import { existsSync } from "node:fs"
import type { MemoryEntry, MemoryContext, ExtractedFact, UserProfile } from "./types"
import type { AgentMemoryConnector } from "./agentmemory"
import { agentMemory } from "./agentmemory"
import { createLogger } from "../cli/logger"
import { getProjectMemoryDir } from "../project/context"

const log = createLogger("memory:system")

export class MemorySystem {
  private memoryDir: string
  private userFile: string
  private memoryFile: string
  private dailyDir: string
  private autoMemoryDir: string
  private factsFile: string
  private agentMemory?: AgentMemoryConnector

  // ── LRU Cache for frequently accessed files ──────────────────
  private cache = new Map<string, { content: string; timestamp: number; mtime: number }>()
  private cacheMaxSize = 20
  private cacheAutoFileList: string[] | null = null
  private cacheAutoFileListTime = 0

  private invalidateCache(path?: string) {
    if (path) {
      this.cache.delete(path)
    } else {
      this.cache.clear()
      this.cacheAutoFileList = null
    }
  }

  private async cachedRead(path: string): Promise<string> {
    try {
      if (!existsSync(path)) return ""
      const st = await stat(path).catch(() => null)
      const mtime = st?.mtimeMs ?? 0
      const cached = this.cache.get(path)

      if (cached && cached.mtime === mtime) {
        return cached.content
      }

      const content = await readFile(path, "utf-8")

      // LRU: delete and re-insert to move to front
      this.cache.delete(path)
      if (this.cache.size >= this.cacheMaxSize) {
        const firstKey = this.cache.keys().next().value
        if (firstKey) this.cache.delete(firstKey)
      }
      this.cache.set(path, { content, timestamp: Date.now(), mtime })

      return content
    } catch (err) {
      log.warn("Failed to read file (cached read)", { path, error: String(err) })
      return ""
    }
  }

  /**
   * @param cwd - The project root directory
   * @param agentMemory - Optional agent memory connector
   * @param project - Optional project name for project-scoped memory storage
   */
  constructor(cwd: string = process.cwd(), agentMemory?: AgentMemoryConnector, project?: string) {
    // When a project is specified, use ~/.aegis/projects/<name>/memory/ instead of cwd/.aegis/memory/
    this.memoryDir = project
      ? getProjectMemoryDir(project)
      : resolve(cwd, ".aegis/memory")
    this.userFile = resolve(cwd, "user.md")
    // For project-scoped mode, MEMORY.md and user.md still come from the project root
    this.memoryFile = resolve(cwd, "MEMORY.md")
    this.dailyDir = resolve(this.memoryDir, "daily")
    this.autoMemoryDir = resolve(this.memoryDir, "auto")
    this.factsFile = resolve(this.memoryDir, "facts.json")
    this.agentMemory = agentMemory
  }

  async initialize(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true })
    await mkdir(this.dailyDir, { recursive: true })
    await mkdir(this.autoMemoryDir, { recursive: true })

    if (!existsSync(this.memoryFile)) {
      await writeFile(
        this.memoryFile,
        "# Aegis Memory\n\nLong-term durable facts and knowledge.\n\n",
        "utf-8"
      )
    }

    if (!existsSync(this.userFile)) {
      await writeFile(
        this.userFile,
        "# User Profile\n\nYour preferences, identity, and constraints.\n\n## About You\n\n(Describe yourself — your role, communication style, what matters to you)\n\n## Never Do\n\n- \n\n## Preferences\n\n- \n",
        "utf-8"
      )
    }

    if (!existsSync(this.factsFile)) {
      await writeFile(this.factsFile, JSON.stringify([], null, 2), "utf-8")
    }
  }

  async loadUserProfile(): Promise<string> {
    try {
      if (existsSync(this.userFile)) {
        return await this.cachedRead(this.userFile)
      }
    } catch (err) {
      log.error("Failed to load user.md", { error: String(err) })
    }
    return ""
  }

  async appendToUserProfile(content: string): Promise<void> {
    try {
      const existing = await this.loadUserProfile()
      const entry = `\n${content}\n`
      await writeFile(this.userFile, existing + entry, "utf-8")
      this.invalidateCache(this.userFile)
    } catch (err) {
      log.error("Failed to append to user.md", { error: String(err) })
    }
  }

  async updateUserProfile(updates: Partial<UserProfile>): Promise<void> {
    const existing = await this.loadUserProfile()
    let updated = existing

    if (updates.preferences) {
      const block = updates.preferences.map((p) => `- ${p}`).join("\n")
      updated = updated.replace(/## Preferences\n\n[\s\S]*?(?=\n##|$)/, `## Preferences\n\n${block}\n`)
    }
    if (updates.neverDo) {
      const block = updates.neverDo.map((p) => `- ${p}`).join("\n")
      updated = updated.replace(/## Never Do\n\n[\s\S]*?(?=\n##|$)/, `## Never Do\n\n${block}\n`)
    }
    if (updates.name) {
      updated = updated.replace(/## About You\n\n.*/, `## About You\n\n${updates.name}`)
    }

    await writeFile(this.userFile, updated, "utf-8")
    this.invalidateCache(this.userFile)
  }

  async loadMemory(): Promise<string> {
    try {
      if (existsSync(this.memoryFile)) {
        return await this.cachedRead(this.memoryFile)
      }
    } catch (err) {
      log.error("Failed to load MEMORY.md", { error: String(err) })
    }
    return ""
  }

  async appendToMemory(content: string): Promise<void> {
    try {
      const existing = await this.loadMemory()
      const timestamp = new Date().toISOString()
      const entry = `\n## ${timestamp}\n\n${content}\n`
      await writeFile(this.memoryFile, existing + entry, "utf-8")
      this.invalidateCache(this.memoryFile)

      if (this.agentMemory) {
        try {
          await this.agentMemory.remember(content, "memory")
        } catch {}
      }
    } catch (err) {
      log.error("Failed to append to MEMORY.md", { error: String(err) })
    }
  }

  async loadDailyLog(date?: Date): Promise<string> {
    const targetDate = date || new Date()
    const dateStr = targetDate.toISOString().split("T")[0]
    const dailyFile = join(this.dailyDir, `${dateStr}.md`)

    try {
      if (existsSync(dailyFile)) {
        return await this.cachedRead(dailyFile)
      }
    } catch (err) {
      log.error(`Failed to load daily log ${dateStr}`, { error: String(err) })
    }
    return ""
  }

  async appendToDailyLog(content: string, date?: Date): Promise<void> {
    const targetDate = date || new Date()
    const dateStr = targetDate.toISOString().split("T")[0]
    const dailyFile = join(this.dailyDir, `${dateStr}.md`)

    try {
      let existing = ""
      if (existsSync(dailyFile)) {
        existing = await this.cachedRead(dailyFile)
      } else {
        existing = `# Daily Log - ${dateStr}\n\n`
      }

      const isoString = targetDate.toISOString()
      const timePart = isoString.split("T")[1]
      const timestamp = timePart ? timePart.split(".")[0] : "00:00:00"
      const entry = `\n## ${timestamp}\n\n${content}\n`
      await writeFile(dailyFile, existing + entry, "utf-8")
      this.invalidateCache(dailyFile)
    } catch (err) {
      log.error(`Failed to append to daily log ${dateStr}`, { error: String(err) })
    }
  }

  async loadAutoMemories(limit = 10): Promise<string[]> {
    try {
      if (!existsSync(this.autoMemoryDir)) return []

      const files = await this.listAutoMemoryFiles()
      const recent = files.slice(-limit)
      const memories: string[] = []

      for (const file of recent) {
        const content = await this.cachedRead(file)
        memories.push(content)
      }

      return memories
    } catch (err) {
      log.error("Failed to load auto memories", { error: String(err) })
      return []
    }
  }

  private async listAutoMemoryFiles(): Promise<string[]> {
    // Cache the file list for 2 seconds to avoid repeated readdir calls
    const now = Date.now()
    if (this.cacheAutoFileList && (now - this.cacheAutoFileListTime) < 2000) {
      return this.cacheAutoFileList
    }
    const files = await readdir(this.autoMemoryDir)
    const result = files
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(this.autoMemoryDir, f))
      .sort()
    this.cacheAutoFileList = result
    this.cacheAutoFileListTime = now
    return result
  }

  async saveAutoMemory(content: string, tag?: string): Promise<void> {
    try {
      const timestamp = Date.now()
      const filename = tag ? `${timestamp}-${tag}.md` : `${timestamp}.md`
      const filepath = join(this.autoMemoryDir, filename)

      const formatted = `# Auto Memory\n\n**Timestamp:** ${new Date().toISOString()}\n${tag ? `**Tag:** ${tag}\n` : ""}\n${content}\n`
      await writeFile(filepath, formatted, "utf-8")
      this.cacheAutoFileList = null  // invalidate auto file list cache
    } catch (err) {
      log.error("Failed to save auto memory", { error: String(err) })
    }
  }

  // ── Fact Extraction ────────────────────────────────────────────────

  async extractAndStoreFacts(conversation: string): Promise<ExtractedFact[]> {
    const facts: ExtractedFact[] = []
    const now = new Date().toISOString()

    const patterns: Array<{ regex: RegExp; category: ExtractedFact["category"]; confidence: number }> = [
      { regex: /(?:I am|I'm|my name is|call me)\s+(\w+)/gi, category: "identity", confidence: 0.9 },
      { regex: /(?:I prefer|I like|I love|I enjoy|my favorite)\s+(.+)/gi, category: "preference", confidence: 0.8 },
      { regex: /(?:never|don't|do not|please don't|avoid)\s+(.+)/gi, category: "preference", confidence: 0.5 },
      { regex: /(?:we are working on|the project is|this project)\s+(.+)/gi, category: "project", confidence: 0.7 },
      { regex: /(?:always|please|make sure to|remember to)\s+(.+)/gi, category: "workflow", confidence: 0.6 },
      { regex: /(?:we decided|the decision was|let's go with|agreed to)\s+(.+)/gi, category: "decision", confidence: 0.8 },
      { regex: /(?:team member|reports to|works with|manages)\s+(.+)/gi, category: "relationship", confidence: 0.7 },
    ]

    for (const { regex, category, confidence } of patterns) {
      let match: RegExpExecArray | null
      while ((match = regex.exec(conversation)) !== null) {
        if (match[1]) {
          facts.push({
            fact: match[1].trim(),
            category,
            confidence,
            timestamp: now,
          })
        }
      }
    }

    if (facts.length > 0) {
      await this.storeFacts(facts)
    }

    return facts
  }

  private async storeFacts(facts: ExtractedFact[]): Promise<void> {
    try {
      const existing = await this.loadFacts()
      const merged = this.deduplicateFacts([...existing, ...facts])
      await writeFile(this.factsFile, JSON.stringify(merged, null, 2), "utf-8")
      this.invalidateCache(this.factsFile)
    } catch (err) {
      log.error("Failed to store facts", { error: String(err) })
    }
  }

  private async loadFacts(): Promise<ExtractedFact[]> {
    try {
      if (!existsSync(this.factsFile)) return []
      const raw = await this.cachedRead(this.factsFile)
      return JSON.parse(raw) as ExtractedFact[]
    } catch (err) {
      log.warn("Failed to load facts file, returning empty", { error: String(err) })
      return []
    }
  }

  private deduplicateFacts(facts: ExtractedFact[]): ExtractedFact[] {
    const seen = new Set<string>()
    return facts
      .filter((f) => {
        const key = f.fact.toLowerCase().trim()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => b.confidence - a.confidence)
  }

  async getFactsByCategory(category: ExtractedFact["category"]): Promise<ExtractedFact[]> {
    const facts = await this.loadFacts()
    return facts
      .filter((f) => f.category === category)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 20)
  }

  async getAllFacts(): Promise<ExtractedFact[]> {
    return this.loadFacts()
  }

  async buildContext(ctx: MemoryContext): Promise<string> {
    const parts: string[] = []

    if (this.agentMemory) {
      try {
        const amCtx = await this.agentMemory.getContext(ctx.agentId)
        if (amCtx && amCtx.trim()) {
          parts.push(`# Memory Context\n\n${amCtx}`)
        }
      } catch {}
    }

    const userProfile = await this.loadUserProfile()
    if (userProfile.trim()) {
      parts.push(`# User Profile\n\n${userProfile}`)
    }

    const memory = await this.loadMemory()
    if (memory.trim()) {
      parts.push(`# Long-term Memory\n\n${memory}`)
    }

    const todayLog = await this.loadDailyLog()
    if (todayLog.trim()) {
      parts.push(`# Today's Log\n\n${todayLog}`)
    }

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayLog = await this.loadDailyLog(yesterday)
    if (yesterdayLog.trim()) {
      parts.push(`# Yesterday's Log\n\n${yesterdayLog}`)
    }

    const autoMemories = await this.loadAutoMemories(5)
    if (autoMemories.length > 0) {
      parts.push(`# Recent Auto Memories\n\n${autoMemories.join("\n---\n")}`)
    }

    const facts = await this.loadFacts()
    if (facts.length > 0) {
      const highConfidence = facts.filter((f) => f.confidence >= 0.7).slice(0, 10)
      if (highConfidence.length > 0) {
        const factLines = highConfidence.map((f) => `- [${f.category}] ${f.fact}`).join("\n")
        parts.push(`# Known Facts\n\n${factLines}`)
      }
    }

    return parts.join("\n\n---\n\n")
  }

  async search(query: string, limit = 10): Promise<MemoryEntry[]> {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []

    interface ScoredEntry extends MemoryEntry {
      score: number
    }

    // ── AgentMemory hybrid search (when available) ──────────────
    const amResults: MemoryEntry[] = []
    if (this.agentMemory) {
      try {
        const amHits = await this.agentMemory.search(query, limit)
        for (const h of amHits) {
          amResults.push({
            content: h.content,
            timestamp: h.timestamp || new Date().toISOString(),
            source: "auto",
            category: "agentmemory",
          })
        }
      } catch (err) {
        log.warn("AgentMemory search failed, falling back to local search", { error: String(err) })
      }
    }

    // ── Local search (always runs) ──────────────────────────────
    const scored: ScoredEntry[] = []

    const memory = await this.loadMemory()
    if (memory.trim()) {
      const score = this.computeRelevance(memory, terms)
      if (score > 0) {
        scored.push({ content: memory, timestamp: new Date().toISOString(), source: "memory", score })
      }
    }

    const userProfile = await this.loadUserProfile()
    if (userProfile.trim()) {
      const score = this.computeRelevance(userProfile, terms)
      if (score > 0) {
        scored.push({ content: userProfile, timestamp: new Date().toISOString(), source: "user", category: "user-profile", score })
      }
    }

    for (let i = 0; i < 14; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const log = await this.loadDailyLog(date)
      if (log.trim()) {
        const score = this.computeRelevance(log, terms) * Math.max(0.1, 1 - i * 0.065)
        if (score > 0) {
          scored.push({ content: log, timestamp: date.toISOString(), source: "daily", score })
        }
      }
    }

    const autoMemories = await this.loadAutoMemories(50)
    for (const mem of autoMemories) {
      const score = this.computeRelevance(mem, terms)
      if (score > 0) {
        scored.push({ content: mem, timestamp: new Date().toISOString(), source: "auto", score })
      }
    }

    const facts = await this.loadFacts()
    const matchingFacts = facts.filter((f) => {
      const fScore = this.computeRelevance(f.fact, terms)
      if (fScore > 0) return true
      return f.fact.toLowerCase().includes(terms[0] ?? "")
    })
    if (matchingFacts.length > 0) {
      const content = matchingFacts.map((f) => `- [${f.category}] ${f.fact}`).join("\n")
      scored.push({ content, timestamp: new Date().toISOString(), source: "auto", category: "facts", score: 0.5 })
    }

    // ── Fuse: agentmemory results first, then deduplicated local ─
    const amContentSet = new Set(amResults.map((r) => r.content.slice(0, 200)))
    const amIds = new Set(amResults.map((r) => r.content))

    const fused: MemoryEntry[] = [...amResults]

    scored.sort((a, b) => b.score - a.score)
    for (const entry of scored) {
      const key = entry.content.slice(0, 200)
      if (!amContentSet.has(key) && !amIds.has(entry.content)) {
        fused.push(entry)
      }
    }

    return fused.slice(0, limit)
  }

  private computeRelevance(text: string, terms: string[]): number {
    const lower = text.toLowerCase()
    const docLen = lower.split(/\s+/).length
    if (docLen === 0) return 0

    let score = 0
    for (const term of terms) {
      const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const regex = new RegExp(safeTerm, "g")
      const matches = lower.match(regex)
      const tf = matches ? matches.length : 0
      if (tf > 0) {
        score += Math.log(1 + tf) / Math.log(1 + docLen)
      }
      if (new RegExp(`^#+\\s+.*${safeTerm}`, "im").test(lower)) {
        score += 0.3
      }
    }

    return score
  }
}

export const memorySystem = new MemorySystem(process.cwd(), agentMemory)

/**
 * Get a project-scoped memory system.
 * Memory data is isolated per project under ~/.aegis/projects/<name>/memory/.
 * Falls back to the default singleton when project is null/undefined.
 */
export function getProjectMemorySystem(project?: string | null): MemorySystem {
  if (!project) return memorySystem
  return new MemorySystem(process.cwd(), agentMemory, project)
}

import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve, join } from "node:path"
import { existsSync } from "node:fs"

export interface MemoryEntry {
  content: string
  timestamp: string
  source: "memory" | "daily" | "auto"
}

export interface MemoryContext {
  agentId: string
  agentType?: string
  cwd: string
}

export class MemorySystem {
  private memoryDir: string
  private memoryFile: string
  private dailyDir: string
  private autoMemoryDir: string

  constructor(cwd: string = process.cwd()) {
    this.memoryDir = resolve(cwd, ".aegis/memory")
    this.memoryFile = resolve(cwd, "MEMORY.md")
    this.dailyDir = resolve(this.memoryDir, "daily")
    this.autoMemoryDir = resolve(this.memoryDir, "auto")
  }

  async initialize(): Promise<void> {
    await mkdir(this.memoryDir, { recursive: true })
    await mkdir(this.dailyDir, { recursive: true })
    await mkdir(this.autoMemoryDir, { recursive: true })

    // Create MEMORY.md if it doesn't exist
    if (!existsSync(this.memoryFile)) {
      await writeFile(
        this.memoryFile,
        "# Aegis Memory\n\nLong-term durable facts and knowledge.\n\n",
        "utf-8"
      )
    }
  }

  async loadMemory(): Promise<string> {
    try {
      if (existsSync(this.memoryFile)) {
        return await readFile(this.memoryFile, "utf-8")
      }
    } catch (err) {
      console.error("Failed to load MEMORY.md:", err)
    }
    return ""
  }

  async appendToMemory(content: string): Promise<void> {
    try {
      const existing = await this.loadMemory()
      const timestamp = new Date().toISOString()
      const entry = `\n## ${timestamp}\n\n${content}\n`
      await writeFile(this.memoryFile, existing + entry, "utf-8")
    } catch (err) {
      console.error("Failed to append to MEMORY.md:", err)
    }
  }

  async loadDailyLog(date?: Date): Promise<string> {
    const targetDate = date || new Date()
    const dateStr = targetDate.toISOString().split("T")[0]
    const dailyFile = join(this.dailyDir, `${dateStr}.md`)

    try {
      if (existsSync(dailyFile)) {
        return await readFile(dailyFile, "utf-8")
      }
    } catch (err) {
      console.error(`Failed to load daily log ${dateStr}:`, err)
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
        existing = await readFile(dailyFile, "utf-8")
      } else {
        existing = `# Daily Log - ${dateStr}\n\n`
      }

      const isoString = targetDate.toISOString()
      const timePart = isoString.split("T")[1]
      const timestamp = timePart ? timePart.split(".")[0] : "00:00:00"
      const entry = `\n## ${timestamp}\n\n${content}\n`
      await writeFile(dailyFile, existing + entry, "utf-8")
    } catch (err) {
      console.error(`Failed to append to daily log ${dateStr}:`, err)
    }
  }

  async loadAutoMemories(limit = 10): Promise<string[]> {
    try {
      if (!existsSync(this.autoMemoryDir)) return []

      const files = await this.listAutoMemoryFiles()
      const recent = files.slice(-limit)
      const memories: string[] = []

      for (const file of recent) {
        const content = await readFile(file, "utf-8")
        memories.push(content)
      }

      return memories
    } catch (err) {
      console.error("Failed to load auto memories:", err)
      return []
    }
  }

  private async listAutoMemoryFiles(): Promise<string[]> {
    const { readdir } = await import("node:fs/promises")
    const files = await readdir(this.autoMemoryDir)
    return files
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(this.autoMemoryDir, f))
      .sort()
  }

  async saveAutoMemory(content: string, tag?: string): Promise<void> {
    try {
      const timestamp = Date.now()
      const filename = tag ? `${timestamp}-${tag}.md` : `${timestamp}.md`
      const filepath = join(this.autoMemoryDir, filename)

      const formatted = `# Auto Memory\n\n**Timestamp:** ${new Date().toISOString()}\n${tag ? `**Tag:** ${tag}\n` : ""}\n${content}\n`
      await writeFile(filepath, formatted, "utf-8")
    } catch (err) {
      console.error("Failed to save auto memory:", err)
    }
  }

  async buildContext(ctx: MemoryContext): Promise<string> {
    const parts: string[] = []

    // Load MEMORY.md
    const memory = await this.loadMemory()
    if (memory.trim()) {
      parts.push(`# Long-term Memory\n\n${memory}`)
    }

    // Load today's daily log
    const todayLog = await this.loadDailyLog()
    if (todayLog.trim()) {
      parts.push(`# Today's Log\n\n${todayLog}`)
    }

    // Load yesterday's daily log for continuity
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayLog = await this.loadDailyLog(yesterday)
    if (yesterdayLog.trim()) {
      parts.push(`# Yesterday's Log\n\n${yesterdayLog}`)
    }

    // Load recent auto memories
    const autoMemories = await this.loadAutoMemories(5)
    if (autoMemories.length > 0) {
      parts.push(`# Recent Auto Memories\n\n${autoMemories.join("\n---\n")}`)
    }

    return parts.join("\n\n---\n\n")
  }

  async search(query: string): Promise<MemoryEntry[]> {
    const results: MemoryEntry[] = []
    const queryLower = query.toLowerCase()

    // Search MEMORY.md
    const memory = await this.loadMemory()
    if (memory.toLowerCase().includes(queryLower)) {
      results.push({
        content: memory,
        timestamp: new Date().toISOString(),
        source: "memory",
      })
    }

    // Search daily logs (last 7 days)
    for (let i = 0; i < 7; i++) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const log = await this.loadDailyLog(date)
      if (log.toLowerCase().includes(queryLower)) {
        results.push({
          content: log,
          timestamp: date.toISOString(),
          source: "daily",
        })
      }
    }

    // Search auto memories
    const autoMemories = await this.loadAutoMemories(20)
    for (const mem of autoMemories) {
      if (mem.toLowerCase().includes(queryLower)) {
        results.push({
          content: mem,
          timestamp: new Date().toISOString(),
          source: "auto",
        })
      }
    }

    return results
  }
}

export const memorySystem = new MemorySystem()

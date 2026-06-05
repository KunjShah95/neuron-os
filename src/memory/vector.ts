import { readFile, writeFile, mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import { existsSync } from "node:fs"
import { computeEmbedding, cosineSimilarity } from "./embedding"

export interface VectorEntry {
  id: string
  content: string
  embedding: number[]
  source: string
  timestamp: string
  category?: string
}

const VECTOR_DIR = resolve(process.cwd(), ".aegis/memory/vectors")
const INDEX_FILE = resolve(VECTOR_DIR, "index.json")

export class VectorMemory {
  private entries: VectorEntry[] = []
  async initialize(): Promise<void> {
    await mkdir(VECTOR_DIR, { recursive: true })

    if (existsSync(INDEX_FILE)) {
      try {
        const raw = await readFile(INDEX_FILE, "utf-8")
        const data = JSON.parse(raw) as { entries: VectorEntry[] }
        this.entries = data.entries || []
      } catch {
        this.entries = []
      }
    }
  }

  // ── Simple character-level embedding (no external deps) ────────────

  // ── API ────────────────────────────────────────────────────────────

  async add(content: string, source: string, category?: string): Promise<string> {
    const id = `vec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const entry: VectorEntry = {
      id,
      content,
      embedding: computeEmbedding(content),
      source,
      timestamp: new Date().toISOString(),
      category,
    }
    this.entries.push(entry)
    await this.persist()
    return id
  }

  async search(query: string, limit = 5, minSimilarity = 0.1): Promise<VectorEntry[]> {
    const queryEmbed = computeEmbedding(query)

    const scored = this.entries
      .map((e) => ({ entry: e, score: cosineSimilarity(queryEmbed, e.embedding) }))
      .filter((s) => s.score >= minSimilarity)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return scored.map((s) => s.entry)
  }

  async searchByCategory(category: string, limit = 10): Promise<VectorEntry[]> {
    return this.entries
      .filter((e) => e.category === category)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  }

  async getStats(): Promise<{ total: number; byCategory: Record<string, number> }> {
    const byCategory: Record<string, number> = {}
    for (const e of this.entries) {
      const cat = e.category || "uncategorized"
      byCategory[cat] = (byCategory[cat] || 0) + 1
    }
    return { total: this.entries.length, byCategory }
  }

  async remove(id: string): Promise<boolean> {
    const before = this.entries.length
    this.entries = this.entries.filter((e) => e.id !== id)
    if (this.entries.length !== before) {
      await this.persist()
      return true
    }
    return false
  }

  async clear(): Promise<void> {
    this.entries = []
    await this.persist()
  }

  private async persist(): Promise<void> {
    await writeFile(INDEX_FILE, JSON.stringify({ entries: this.entries }, null, 2), "utf-8")
  }
}

export const vectorMemory = new VectorMemory()

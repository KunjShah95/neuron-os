import { readFile, writeFile, mkdir, readdir } from "node:fs/promises"
import { resolve, join } from "node:path"
import { existsSync } from "node:fs"

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
  private initialized = false

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

    this.initialized = true
  }

  // ── Simple character-level embedding (no external deps) ────────────

  private computeEmbedding(text: string): number[] {
    const dim = 128
    const vec = new Array(dim).fill(0)
    const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, "")
    const words = lower.split(/\s+/).filter(Boolean)

    for (const word of words) {
      let hash = 0
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(i)
        hash = hash & hash
      }
      const idx = Math.abs(hash) % dim
      vec[idx] = (vec[idx] || 0) + 1
    }

    // Normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
    if (norm > 0) {
      for (let i = 0; i < dim; i++) {
        vec[i] = vec[i]! / norm
      }
    }

    return vec
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += (a[i] || 0) * (b[i] || 0)
      na += (a[i] || 0) * (a[i] || 0)
      nb += (b[i] || 0) * (b[i] || 0)
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb)
    return denom === 0 ? 0 : dot / denom
  }

  // ── API ────────────────────────────────────────────────────────────

  async add(content: string, source: string, category?: string): Promise<string> {
    const id = `vec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const entry: VectorEntry = {
      id,
      content,
      embedding: this.computeEmbedding(content),
      source,
      timestamp: new Date().toISOString(),
      category,
    }
    this.entries.push(entry)
    await this.persist()
    return id
  }

  async search(query: string, limit = 5, minSimilarity = 0.1): Promise<VectorEntry[]> {
    const queryEmbed = this.computeEmbedding(query)

    const scored = this.entries
      .map((e) => ({ entry: e, score: this.cosineSimilarity(queryEmbed, e.embedding) }))
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

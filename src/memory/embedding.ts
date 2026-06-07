/**
 * memory/embedding — Shared hash-based text embedding utilities.
 *
 * Used by:
 * - vector.ts (existing memory vector store)
 * - experience/retrieval.ts (similar-goal search for AgentEngine context injection)
 *
 * Deterministic, dependency-free, 128-dimensional. Sufficient for similarity
 * ranking of short text goals. NOT a replacement for real semantic embeddings.
 */

const DIM = 128

export function computeEmbedding(text: string): number[] {
  const vec = new Array(DIM).fill(0)
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, "")
  const words = lower.split(/\s+/).filter(Boolean)

  for (const word of words) {
    let hash = 0
    for (let i = 0; i < word.length; i++) {
      hash = (hash << 5) - hash + word.charCodeAt(i)
      hash = hash & hash
    }
    const idx = Math.abs(hash) % DIM
    vec[idx] = (vec[idx] || 0) + 1
  }

  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
  if (norm > 0) {
    for (let i = 0; i < DIM; i++) vec[i] = vec[i]! / norm
  }
  return vec
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0,
    na = 0,
    nb = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] || 0
    const bi = b[i] || 0
    dot += ai * bi
    na += ai * ai
    nb += bi * bi
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

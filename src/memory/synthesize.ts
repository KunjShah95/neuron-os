import { createLogger } from "../cli/logger"
import { FTS5Retriever } from "./recall/retriever"
import { vectorMemory, VectorMemory } from "./vector"
import { knowledgeGraph, KnowledgeGraph } from "./graph"
import { experienceStore, ExperienceStore } from "../experience/store"
import { sessionStore, SessionStore } from "./session-persistence"

const log = createLogger("knowledge-synthesizer")

export interface SynthesisRequest {
  topic: string
  sources?: ("recall" | "vector" | "graph" | "experience" | "sessions")[]
  maxSources?: number
}

export interface SynthesisSource {
  store: string
  id: string
  content: string
  score: number
}

export interface SynthesisResult {
  topic: string
  summary: string
  sources: SynthesisSource[]
  confidence: number
  generatedAt: string
}

export class KnowledgeSynthesizer {
  static async synthesize(
    request: SynthesisRequest,
    deps?: {
      recallRetriever?: FTS5Retriever
      vectorMem?: VectorMemory
      graph?: KnowledgeGraph
      expStore?: ExperienceStore
      sessStore?: SessionStore
    },
  ): Promise<SynthesisResult> {
    const topic = request.topic
    const sources = request.sources ?? ["recall", "vector", "graph", "experience", "sessions"]
    const maxSources = request.maxSources ?? 5

    const allSources: SynthesisSource[] = []

    for (const store of sources) {
      try {
        switch (store) {
          case "recall":
            if (deps?.recallRetriever) {
              const hits = deps.recallRetriever.retrieve({ text: topic, maxResults: 5 })
              for (const h of hits) {
                allSources.push({ store: "recall", id: h.turn_id, content: h.content.slice(0, 300), score: h.finalScore })
              }
            }
            break
          case "vector":
            {
              const m = deps?.vectorMem ?? vectorMemory
              await m.initialize()
              const entries = await m.search(topic, 5)
              for (const e of entries) {
                allSources.push({ store: "vector", id: e.id, content: e.content.slice(0, 300), score: 0.7 })
              }
            }
            break
          case "graph":
            {
              const g = deps?.graph ?? knowledgeGraph
              const entities = g.search({ query: topic, limit: 5 })
              for (const e of entities) {
                allSources.push({ store: "graph", id: e.id, content: `[${e.type}] ${e.name}: ${e.context}`.slice(0, 300), score: e.confidence })
              }
            }
            break
          case "experience":
            {
              const es = deps?.expStore ?? experienceStore
              const results = es.searchByGoalSimilarity(topic, 5)
              for (const r of results) {
                allSources.push({ store: "experience", id: r.id, content: `[${r.outcome}] ${r.goal} — ${r.summary}`.slice(0, 300), score: r.similarity })
              }
            }
            break
          case "sessions":
            {
              const ss = deps?.sessStore ?? sessionStore
              const results = ss.searchMessages(topic, 5)
              for (const r of results) {
                allSources.push({ store: "sessions", id: `${r.message.id}`, content: r.message.content.slice(0, 300), score: 0.5 })
              }
            }
            break
        }
      } catch (err) {
        log.warn(`Error searching store "${store}": ${err}`)
      }
    }

    allSources.sort((a, b) => b.score - a.score)
    const topSources = allSources.slice(0, maxSources)

    const summaryLines: string[] = []
    summaryLines.push(`Topic: ${topic}`)
    summaryLines.push("")

    if (topSources.length === 0) {
      summaryLines.push("No relevant information found across any memory store.")
      summaryLines.push("")
    } else {
      const seenEntities = new Set<string>()
      for (const s of topSources) {
        summaryLines.push(`From ${s.store}: ${s.content}`)
        summaryLines.push("")
      }

      const entityMatch = topic.match(/([A-Z][a-z]+)/g)
      if (entityMatch) {
        summaryLines.push("Key entities referenced:")
        for (const name of entityMatch) {
          if (!seenEntities.has(name) && name.length > 2) {
            seenEntities.add(name)
            summaryLines.push(`  - ${name}`)
          }
        }
        summaryLines.push("")
      }
    }

    const storeSet = new Set(topSources.map((s) => s.store))
    const corroborationCount = topSources.length
    const uniqueStores = storeSet.size
    const confidence = Math.min(1, 0.3 + corroborationCount * 0.1 + uniqueStores * 0.1)

    return {
      topic,
      summary: summaryLines.join("\n"),
      sources: topSources,
      confidence: Math.round(confidence * 100) / 100,
      generatedAt: new Date().toISOString(),
    }
  }
}

import { KnowledgeGraph, knowledgeGraph } from "./graph"

export class GraphIntegration {
  private graph: KnowledgeGraph
  private initialized = false

  constructor(graph?: KnowledgeGraph) {
    this.graph = graph ?? knowledgeGraph
  }

  async initialize(): Promise<void> {
    if (!this.initialized) {
      this.initialized = true
    }
  }

  async processAgentRun(experience: {
    goal: string
    summary?: string
    outcome: string
    agentType?: string
    sessionId?: string
  }): Promise<void> {
    await this.initialize()

    const text = [experience.goal, experience.summary || ""].filter(Boolean).join("\n")
    if (!text.trim()) return

    const entities = this.graph.extractEntities(text, `session:${experience.sessionId || "unknown"}`)

    if (entities.length >= 2) {
      this.graph.extractRelationships(text, entities)
    }

    if (experience.agentType && entities.length > 0) {
      const typeEntity = this.graph.getEntityByName(experience.agentType)
      if (typeEntity) {
        for (const entity of entities) {
          this.graph.addRelationship(typeEntity.id, entity.id, "related_to", 0.5)
        }
      }
    }
  }

  async processBatch(
    experiences: Array<{
      goal: string
      summary?: string
      outcome: string
      agentType?: string
      sessionId?: string
    }>,
  ): Promise<{ processed: number; entitiesFound: number }> {
    await this.initialize()
    let entitiesFound = 0
    for (const exp of experiences) {
      const before = this.graph.getStats().entityCount
      await this.processAgentRun(exp)
      const after = this.graph.getStats().entityCount
      entitiesFound += after - before
    }
    return { processed: experiences.length, entitiesFound }
  }
}

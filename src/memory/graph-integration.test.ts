import { describe, it, expect, mock } from "bun:test"
import { GraphIntegration } from "./graph-integration"
import type { GraphEntity, GraphRelationship } from "./graph"

function createMockGraph() {
  const store = new Map<string, GraphEntity>()
  let entitySeq = 0

  const mockExtractEntities = mock((text: string, source: string): GraphEntity[] => {
    const extracted: GraphEntity[] = []
    const seen = new Set<string>()

    const tryAdd = (name: string, type: string) => {
      if (name.length < 2 || seen.has(name)) return
      seen.add(name)
      entitySeq++
      const e: GraphEntity = {
        id: `ent-mock-${entitySeq}`,
        name,
        type,
        context: text.slice(0, 200),
        source,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-01T00:00:00.000Z",
        confidence: 0.5,
      }
      store.set(name, e)
      extracted.push(e)
    }

    const capitalizedPattern = /\b([A-Z][a-zA-Z]+)\b/g
    let match: RegExpExecArray | null
    while ((match = capitalizedPattern.exec(text)) !== null) {
      const word = match[1]!
      if (word.length >= 3 && !["The", "This", "That", "When", "What"].includes(word)) {
        tryAdd(word, "concept")
      }
    }

    return extracted
  })

  const mockExtractRelationships = mock((_text: string, _entities: GraphEntity[]): GraphRelationship[] => {
    return []
  })

  const mockGetEntityByName = mock((name: string): GraphEntity | undefined => {
    return store.get(name)
  })

  const mockAddRelationship = mock(
    (_sourceId: string, _targetId: string, _type: string, _weight: number): GraphRelationship => {
      return {
        id: "rel-mock",
        sourceId: _sourceId,
        targetId: _targetId,
        type: _type,
        weight: _weight,
        createdAt: "2025-01-01T00:00:00.000Z",
      }
    },
  )

  const mockGetStats = mock(() => ({
    entityCount: store.size,
    relationshipCount: 0,
    topTypes: [] as Array<{ type: string; count: number }>,
  }))

  return {
    extractEntities: mockExtractEntities,
    extractRelationships: mockExtractRelationships,
    getEntityByName: mockGetEntityByName,
    addRelationship: mockAddRelationship,
    getStats: mockGetStats,
  }
}

describe("GraphIntegration", () => {
  it("extracts entities from a goal string", async () => {
    const mockGraph = createMockGraph()
    const gi = new GraphIntegration(mockGraph as any)

    await gi.processAgentRun({
      goal: "Implement the KnowledgeGraph bridge module",
      outcome: "success",
    })

    expect(mockGraph.extractEntities).toHaveBeenCalled()
    expect(mockGraph.extractEntities.mock.calls[0]?.[0]).toContain("KnowledgeGraph")
    expect(mockGraph.extractEntities.mock.calls[0]?.[1]).toContain("session:unknown")
  })

  it("processes a batch of experiences and returns correct counts", async () => {
    const mockGraph = createMockGraph()
    const gi = new GraphIntegration(mockGraph as any)

    const result = await gi.processBatch([
      {
        goal: "Build AgentRuntime class",
        outcome: "success",
        agentType: "build",
      },
      {
        goal: "Fix memory leak in KnowledgeGraph",
        outcome: "success",
        agentType: "build",
      },
      {
        goal: "Debug session persistence issue",
        outcome: "failed",
        agentType: "debug",
      },
    ])

    expect(result.processed).toBe(3)
    expect(result.entitiesFound).toBe(5)
  })

  it("links entities to agent type", async () => {
    const mockGraph = createMockGraph()
    const buildEntity: GraphEntity = {
      id: "ent-build-type",
      name: "build",
      type: "agent_type",
      context: "",
      source: "system",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      confidence: 0.8,
    }
    mockGraph.extractEntities.mockReturnValue([
      {
        id: "ent-mock-e1",
        name: "AgentEngine",
        type: "concept",
        context: "",
        source: "",
        createdAt: "",
        updatedAt: "",
        confidence: 0.5,
      },
      {
        id: "ent-mock-e2",
        name: "Refactor",
        type: "concept",
        context: "",
        source: "",
        createdAt: "",
        updatedAt: "",
        confidence: 0.5,
      },
    ])
    mockGraph.getEntityByName.mockReturnValue(buildEntity)

    const gi = new GraphIntegration(mockGraph as any)

    await gi.processAgentRun({
      goal: "Refactor the AgentEngine streamChat method",
      outcome: "success",
      agentType: "build",
    })

    expect(mockGraph.getEntityByName).toHaveBeenCalledWith("build")
    const typeCalls = mockGraph.addRelationship.mock.calls.filter((c: any[]) => c[2] === "related_to" && c[3] === 0.5)
    expect(typeCalls.length).toBe(2)
  })
})

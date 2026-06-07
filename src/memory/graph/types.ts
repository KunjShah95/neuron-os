/**
 * Knowledge Graph Types
 *
 * Entity-relationship graph for structured memory with temporal scoring.
 * Enables complex queries like "find projects related to auth from last month".
 */

export type EntityType =
  | "person"
  | "project"
  | "technology"
  | "concept"
  | "file"
  | "task"
  | "decision"
  | "organization"
  | "location"
  | "event"
  | "custom"

export type RelationType =
  | "works_on"
  | "depends_on"
  | "created_by"
  | "uses"
  | "part_of"
  | "related_to"
  | "precedes"
  | "follows"
  | "mentions"
  | "located_in"
  | "member_of"
  | "custom"

export interface Entity {
  id: string
  type: EntityType
  name: string
  aliases: string[]
  properties: Record<string, unknown>
  createdAt: string
  updatedAt: string
  lastMentionedAt: string
  mentionCount: number
  embedding?: number[]
}

export interface Relationship {
  id: string
  sourceId: string
  targetId: string
  type: RelationType
  properties: Record<string, unknown>
  createdAt: string
  updatedAt: string
  strength: number // 0-1, confidence/importance
}

export interface GraphQuery {
  // Entity filters
  entityTypes?: EntityType[]
  entityNames?: string[]

  // Relationship filters
  relationTypes?: RelationType[]

  // Temporal filters
  since?: Date
  until?: Date

  // Traversal
  startEntity?: string
  depth?: number

  // Text search
  textQuery?: string

  // Scoring
  minRelevance?: number

  // Pagination
  limit?: number
  offset?: number
}

export interface GraphResult {
  entities: Entity[]
  relationships: Relationship[]
  scores: Map<string, number> // entityId -> temporal relevance score
}

export interface ExtractedEntity {
  name: string
  type: EntityType
  aliases?: string[]
  properties?: Record<string, unknown>
  confidence: number
}

export interface ExtractedRelationship {
  source: string
  target: string
  type: RelationType
  properties?: Record<string, unknown>
  confidence: number
}

export interface ExtractionResult {
  entities: ExtractedEntity[]
  relationships: ExtractedRelationship[]
  sourceText: string
  extractedAt: string
}

// Temporal decay configuration
export interface TemporalConfig {
  halfLifeDays: number // Days for relevance to decay to 0.5
  boostRecent: number // Multiplier for recent mentions
  boostFrequent: number // Multiplier for frequently mentioned
}

export const DEFAULT_TEMPORAL_CONFIG: TemporalConfig = {
  halfLifeDays: 30,
  boostRecent: 1.5,
  boostFrequent: 1.2,
}

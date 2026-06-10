/**
 * marketplace/types — Type definitions for the Agent Marketplace.
 *
 * Defines the schema for agent configurations, marketplace entries,
 * search results, and rating information.
 */

// ── Agent Configuration ──────────────────────────────────────────────

export type AgentType =
  | "coder"
  | "reviewer"
  | "planner"
  | "researcher"
  | "analyst"
  | "creator"
  | "custom"

export type SandboxType = "none" | "docker" | "local" | "remote"

export interface ToolSpec {
  name: string
  description?: string
  parameters?: Record<string, unknown>
}

/** Full agent configuration loaded from agent.yaml */
export interface AgentConfig {
  /** Unique agent name (e.g., "code-reviewer") */
  name: string
  /** Agent type category */
  type: AgentType
  /** Human-readable description */
  description: string
  /** Tools this agent has access to */
  tools: ToolSpec[]
  /** System prompt template (may include {{variables}}) */
  prompt_template: string
  /** Maximum budget in USD per invocation */
  budget_usd: number
  /** Sandbox environment for execution */
  sandbox: SandboxType
  /** Provider identifier (e.g., "openai", "anthropic", "local") */
  provider: string
  /** Searchable tags */
  tags: string[]
}

// ── Marketplace Entry ────────────────────────────────────────────────

/** AgentSignature reuses PluginSignature from plugin/types */
export interface AgentSignature {
  publicKey: string
  value: string
  signedAt: string
  algorithm: "ed25519"
}

/** A published entry in the Agent Marketplace */
export interface MarketplaceEntry {
  /** The agent configuration */
  config: AgentConfig
  /** Author identifier (public key fingerprint or name) */
  author: string
  /** Semver version string */
  version: string
  /** ISO timestamp of publication */
  publishedAt: string
  /** Aggregate rating info */
  rating: RatingInfo
  /** Total install count */
  installCount: number
  /** Cryptographic signature for integrity */
  signature?: AgentSignature
}

// ── Rating ───────────────────────────────────────────────────────────

export interface RatingInfo {
  /** Average stars (1-5) */
  average: number
  /** Number of ratings */
  count: number
  /** Distribution: stars → count */
  distribution: Record<number, number>
}

// ── Search ───────────────────────────────────────────────────────────

export interface SearchFilters {
  /** Filter by agent type */
  type?: AgentType
  /** Filter by provider */
  provider?: string
  /** Minimum average rating */
  minRating?: number
  /** Filter by tag (exact match) */
  tag?: string
  /** Sort field */
  sort?: "rating" | "installs" | "recent" | "name"
  /** Sort direction */
  order?: "asc" | "desc"
  /** Page number (0-indexed) */
  page?: number
  /** Results per page */
  pageSize?: number
}

export interface SearchResult {
  entries: MarketplaceEntry[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ── Registry Row (internal) ──────────────────────────────────────────

export interface AgentRow {
  name: string
  version: string
  type: string
  description: string
  author: string
  provider: string
  tags: string
  config: string
  prompt_template: string
  budget_usd: number
  sandbox: string
  tools: string
  signature: string
  published_at: number
  install_count: number
  rating_avg: number
  rating_count: number
  rating_dist: string
  installed: number
  installed_at: number | null
}

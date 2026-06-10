/**
 * marketplace/search — Full-text search engine for the Agent Marketplace.
 *
 * Provides fuzzy matching, filtering, sorting, and pagination
 * over the marketplace registry.
 */

import type {
  SearchFilters,
  SearchResult,
  MarketplaceEntry,
  AgentType,
} from "./types"
import type { MarketplaceRegistry } from "./registry"

/** Normalize a query string for search */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
}

/** Check if a text contains all query terms */
function matchesTerms(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase()
  return terms.every((term) => lower.includes(term))
}

/**
 * Score an entry against search terms (higher = better match).
 */
function scoreEntry(entry: MarketplaceEntry, terms: string[]): number {
  let score = 0
  const name = entry.config.name.toLowerCase()
  const desc = entry.config.description.toLowerCase()
  const author = entry.author.toLowerCase()
  const tags = entry.config.tags.map((t) => t.toLowerCase()).join(" ")

  for (const term of terms) {
    if (name === term) score += 100
    else if (name.startsWith(term)) score += 50
    else if (name.includes(term)) score += 25

    if (desc.includes(term)) score += 10
    if (author.includes(term)) score += 15
    if (tags.includes(term)) score += 20
  }

  // Boost by rating and installs
  score += entry.rating.average * 2
  score += Math.log10(entry.installCount + 1) * 5

  return score
}

export class MarketplaceSearch {
  constructor(private registry: MarketplaceRegistry) {}

  /**
   * Search the marketplace with full-text matching and filters.
   */
  search(query: string, filters?: SearchFilters): SearchResult {
    const normalized = normalizeQuery(query)
    const terms = normalized.split(" ").filter(Boolean)

    if (terms.length === 0) {
      return this.registry.list(filters)
    }

    const firstTerm = terms[0]
    if (!firstTerm) return this.registry.list(filters)
    const result = this.registry.search(firstTerm, filters)

    // Re-score for multi-term queries
    if (terms.length > 1) {
      const scored = result.entries.map((entry) => ({
        entry,
        score: scoreEntry(entry, terms),
      }))

      // Filter out entries that don't match all terms
      const matched = scored.filter(({ entry }) =>
        matchesTerms(
          `${entry.config.name} ${entry.config.description} ${entry.author} ${entry.config.tags.join(" ")}`,
          terms,
        ),
      )

      matched.sort((a, b) => b.score - a.score)

      return {
        ...result,
        entries: matched.map(({ entry }) => entry),
        total: matched.length,
        totalPages: Math.ceil(matched.length / result.pageSize),
      }
    }

    // Single term: re-score for better ranking
    const scored = result.entries.map((entry) => ({
      entry,
      score: scoreEntry(entry, terms),
    }))
    scored.sort((a, b) => b.score - a.score)

    return {
      ...result,
      entries: scored.map(({ entry }) => entry),
    }
  }

  /**
   * List agents with optional filters, no text search.
   */
  list(filters?: SearchFilters): SearchResult {
    return this.registry.list(filters)
  }

  /**
   * Get trending agents (sorted by recent installs).
   */
  trending(limit = 10): MarketplaceEntry[] {
    const result = this.registry.list({
      sort: "installs",
      order: "desc",
      pageSize: limit,
    })
    return result.entries
  }

  /**
   * Get top-rated agents.
   */
  topRated(limit = 10): MarketplaceEntry[] {
    const result = this.registry.list({
      sort: "rating",
      order: "desc",
      pageSize: limit,
    })
    return result.entries
  }

  /**
   * Get recently published agents.
   */
  recent(limit = 10): MarketplaceEntry[] {
    const result = this.registry.list({
      sort: "recent",
      order: "desc",
      pageSize: limit,
    })
    return result.entries
  }

  /**
   * Get agents by type.
   */
  byType(type: AgentType, limit = 20): SearchResult {
    return this.registry.list({ type, pageSize: limit })
  }

  /**
   * Get agents by provider.
   */
  byProvider(provider: string, limit = 20): SearchResult {
    return this.registry.list({ provider, pageSize: limit })
  }
}

import type { Command } from "commander"
import { theme } from "../theme"

export function registerKnowledge(program: Command) {
  const mem = program.commands.find((c) => c.name() === "memory")
  if (!mem) return

  const graph = mem.command("graph").description("Knowledge graph — entity-relationship memory store")

  graph
    .command("add-entity <name> <type> <context>")
    .description("Add an entity to the knowledge graph")
    .action(async (name: string, type: string, context: string) => {
      const { knowledgeGraph } = await import("../../memory/graph")
      const entity = knowledgeGraph.addEntity(name, type, context, "cli")
      console.log(theme.success(`  ✓ Entity added: ${entity.name} [${entity.type}]`))
    })

  graph
    .command("link <source> <target> <type>")
    .description("Add a relationship between two entities")
    .option("-w, --weight <n>", "Relationship weight 0-1", (v) => parseFloat(v), 0.5)
    .action(async (source: string, target: string, relType: string, opts: { weight: number }) => {
      const { knowledgeGraph } = await import("../../memory/graph")
      const src = knowledgeGraph.getEntityByName(source)
      if (!src) {
        console.log(theme.error(`  Entity "${source}" not found`))
        return
      }
      const tgt = knowledgeGraph.getEntityByName(target)
      if (!tgt) {
        console.log(theme.error(`  Entity "${target}" not found`))
        return
      }
      knowledgeGraph.addRelationship(src.id, tgt.id, relType, opts.weight)
      console.log(theme.success(`  ✓ Linked ${source} → ${target} [${relType}]`))
    })

  graph
    .command("search <query>")
    .description("Search knowledge graph entities")
    .option("--type <t>", "Filter by entity type")
    .option("--min-confidence <n>", "Minimum confidence", (v) => parseFloat(v), 0)
    .option("--limit <n>", "Max results", (v) => parseInt(v, 10), 10)
    .action(async (query: string, opts: { type?: string; minConfidence?: number; limit: number }) => {
      const { knowledgeGraph } = await import("../../memory/graph")
      const results = knowledgeGraph.search({
        query,
        type: opts.type,
        minConfidence: opts.minConfidence,
        limit: opts.limit,
      })

      if (results.length === 0) {
        console.log(theme.dim("  No matching entities found."))
        return
      }

      console.log(theme.heading(`  Knowledge Graph Results (${results.length}):`))
      console.log()
      for (const r of results) {
        const conf =
          r.confidence > 0.8 ? theme.success("high") : r.confidence > 0.5 ? theme.warn("med") : theme.dim("low")
        console.log(`  ${theme.accent(r.name)} [${r.type}] (${conf})`)
        console.log(`    ${theme.dim(r.context.slice(0, 120))}`)
        console.log()
      }
    })

  graph
    .command("related <name>")
    .description("Show entities related to the given entity")
    .option("--type <t>", "Filter by relationship type")
    .option("--depth <n>", "Traversal depth", (v) => parseInt(v, 10), 1)
    .action(async (name: string, opts: { type?: string; depth: number }) => {
      const { knowledgeGraph } = await import("../../memory/graph")
      const entity = knowledgeGraph.getEntityByName(name)
      if (!entity) {
        console.log(theme.error(`  Entity "${name}" not found`))
        return
      }

      const related = knowledgeGraph.getRelated(entity.id, opts.type, opts.depth)
      if (related.length === 0) {
        console.log(theme.dim(`  No related entities found for "${name}".`))
        return
      }

      console.log(theme.heading(`  Related to ${theme.accent(name)} (${related.length}):`))
      console.log()
      for (const r of related) {
        const dir = r.relationship.sourceId === entity.id ? "→" : "←"
        console.log(
          `  ${theme.accent(r.entity.name)} ${dir} [${r.relationship.type}] (${(r.relationship.weight * 100).toFixed(0)}%)`,
        )
        console.log()
      }
    })

  graph
    .command("extract <text>")
    .description("Extract entities and relationships from text")
    .option("--source <s>", "Source identifier", "cli")
    .action(async (text: string, opts: { source: string }) => {
      const { knowledgeGraph } = await import("../../memory/graph")
      const entities = knowledgeGraph.extractEntities(text, opts.source)
      console.log(theme.heading(`  Extracted ${entities.length} entities:`))
      for (const e of entities) {
        console.log(`  ${theme.accent(e.name)} [${e.type}]`)
      }

      if (entities.length >= 2) {
        const rels = knowledgeGraph.extractRelationships(text, entities)
        console.log()
        console.log(theme.heading(`  Created ${rels.length} relationships:`))
        for (const r of rels) {
          console.log(`  ${r.sourceId.slice(0, 8)} → ${r.targetId.slice(0, 8)} [${r.type}]`)
        }
      }
      console.log()
    })

  graph
    .command("stats")
    .description("Show knowledge graph statistics")
    .action(async () => {
      const { knowledgeGraph } = await import("../../memory/graph")
      const stats = knowledgeGraph.getStats()
      console.log(theme.heading("  Knowledge Graph Statistics"))
      console.log()
      console.log(`  ${theme.bold("Entities:")}       ${stats.entityCount}`)
      console.log(`  ${theme.bold("Relationships:")}  ${stats.relationshipCount}`)
      console.log()
      if (stats.topTypes.length > 0) {
        console.log(theme.dim("  By type:"))
        for (const t of stats.topTypes) {
          console.log(`    ${theme.accent(t.type.padEnd(20))} ${t.count}`)
        }
        console.log()
      }
    })

  const ns = mem.command("ns").description("Memory namespaces — per-agent memory isolation")

  ns.command("create <agent-type> <ttl-days>")
    .description("Create a new memory namespace")
    .option("--agent-id <id>", "Specific agent ID")
    .action(async (agentType: string, ttlDays: string, opts: { agentId?: string }) => {
      const { memoryNamespaceManager } = await import("../../memory/namespace")
      const ns = memoryNamespaceManager.createNamespace(agentType, parseInt(ttlDays, 10), opts.agentId)
      console.log(theme.success(`  ✓ Namespace created: ${ns.id}`))
      console.log(`    Agent: ${ns.agentType}${ns.agentId ? ` / ${ns.agentId}` : ""}`)
      console.log(`    TTL:  ${ns.ttlDays} days`)
    })

  ns.command("add <ns-id> <content>")
    .description("Add an entry to a namespace")
    .option("--type <t>", "Entry type: fact|observation|relationship|skill", "observation")
    .option("--source <s>", "Source identifier", "cli")
    .action(async (nsId: string, content: string, opts: { type: string; source: string }) => {
      const { memoryNamespaceManager } = await import("../../memory/namespace")
      try {
        const entry = memoryNamespaceManager.addEntry(nsId, content, opts.type as string, opts.source)
        console.log(theme.success(`  ✓ Entry added: ${entry.id}`))
      } catch (err) {
        console.log(theme.error(`  ${(err as Error).message}`))
      }
    })

  ns.command("query <ns-id> <query>")
    .description("Search entries in a namespace")
    .option("--limit <n>", "Max results", (v) => parseInt(v, 10), 10)
    .action(async (nsId: string, query: string, opts: { limit: number }) => {
      const { memoryNamespaceManager } = await import("../../memory/namespace")
      const results = memoryNamespaceManager.query([nsId], query, opts.limit)

      if (results.length === 0) {
        console.log(theme.dim("  No matching entries found."))
        return
      }

      console.log(theme.heading(`  Namespace Entries (${results.length}):`))
      console.log()
      for (const r of results) {
        console.log(`  ${theme.accent(r.type.padEnd(14))} ${r.content.slice(0, 120)}`)
        console.log(`    ${theme.dim(r.source)} · ${new Date(r.createdAt).toLocaleDateString()}`)
        console.log()
      }
    })

  ns.command("list")
    .description("List all namespaces")
    .action(async () => {
      const { memoryNamespaceManager } = await import("../../memory/namespace")
      const namespaces = memoryNamespaceManager.listNamespaces()

      if (namespaces.length === 0) {
        console.log(theme.dim("  No namespaces defined."))
        return
      }

      console.log(theme.heading(`  Memory Namespaces (${namespaces.length}):`))
      console.log()
      for (const n of namespaces) {
        console.log(
          `  ${theme.accent(n.id.slice(0, 16))} ${n.agentType}${n.agentId ? ` / ${n.agentId}` : ""} (TTL: ${n.ttlDays}d)`,
        )
      }
      console.log()
    })

  ns.command("entries <ns-id>")
    .description("List entries in a namespace")
    .option("--limit <n>", "Max entries", (v) => parseInt(v, 10), 20)
    .action(async (nsId: string, opts: { limit: number }) => {
      const { memoryNamespaceManager } = await import("../../memory/namespace")
      const entries = memoryNamespaceManager.listEntries(nsId, opts.limit)

      if (entries.length === 0) {
        console.log(theme.dim("  No entries in this namespace."))
        return
      }

      console.log(theme.heading(`  Entries (${entries.length}):`))
      console.log()
      for (const e of entries) {
        console.log(`  ${theme.accent(e.type.padEnd(14))} ${e.content.slice(0, 100)}`)
        console.log(`    ${theme.dim(`expires: ${new Date(e.expiresAt).toLocaleDateString()}`)}`)
        console.log()
      }
    })

  ns.command("prune")
    .description("Archive expired namespace entries")
    .action(async () => {
      const { memoryNamespaceManager } = await import("../../memory/namespace")
      const count = memoryNamespaceManager.archiveExpired()
      console.log(theme.success(`  ✓ Archived ${count} expired entries`))
    })

  mem
    .command("synthesize <topic>")
    .description("Cross-store knowledge synthesis — gather evidence from all memory stores")
    .option("--sources <sources>", "Comma-separated stores: recall,vector,graph,experience,sessions")
    .option("--max-sources <n>", "Max sources per topic", (v) => parseInt(v, 10), 5)
    .action(async (topic: string, opts: { sources?: string; maxSources: number }) => {
      const { KnowledgeSynthesizer } = await import("../../memory/synthesize")
      const result = await KnowledgeSynthesizer.synthesize({
        topic,
        sources: opts.sources ? (opts.sources.split(",").map((s) => s.trim()) as any[]) : undefined,
        maxSources: opts.maxSources,
      })

      console.log(theme.heading(`  Knowledge Synthesis: ${result.topic}`))
      console.log()
      console.log(result.summary)
      console.log(theme.dim(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`))
      console.log(theme.dim(`  Sources: ${result.sources.length}`))
      console.log()
    })

  mem
    .command("ns-stats")
    .description("Show namespace statistics")
    .action(async () => {
      const { memoryNamespaceManager } = await import("../../memory/namespace")
      const stats = memoryNamespaceManager.getStats()
      console.log(theme.heading("  Namespace Statistics"))
      console.log()
      console.log(`  ${theme.bold("Namespaces:")}     ${stats.totalNamespaces}`)
      console.log(`  ${theme.bold("Entries:")}        ${stats.totalEntries}`)
      console.log(`  ${theme.bold("Expired:")}        ${stats.expiredEntries}`)
      console.log()
    })
}

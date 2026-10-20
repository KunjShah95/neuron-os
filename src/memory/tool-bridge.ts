import { join } from "node:path"
import type { ToolContext } from "../tools/registry"
import { VectorMemory, type VectorEntry } from "./vector"
import { SessionStore } from "./session-persistence"
import { canExecute, canRead, loadPolicy, savePolicy } from "./policy/enforcer"
import { logAudit } from "./policy/audit"
import { memoryRoot } from "./policy/paths"
import type { AuditEntry, MemoryPolicy as MemoryPolicyType, Principal } from "./policy/schema"
import { UnifiedMemoryQuery, type UnifiedResult } from "./unified-query"
import { computeEmbedding, cosineSimilarity } from "./embedding"

export type MemoryAction = "read" | "write"

export interface MemoryTarget {
  namespace: string
  path?: string
  tool?: string
  rule_id?: string
}

export interface MemoryDecision {
  allowed: boolean
  reason: string
  rule_id?: string
}

export interface MemoryHit {
  namespace: string
  key: string
  content: string
  score: number
  store: string
  timestamp?: string
  tags: string[]
}

export interface MemoryWriteInput {
  key: string
  content: string
  tags?: string[]
  namespace?: string
}

export interface MemoryWriteOutput {
  namespace: string
  key: string
  entryId: string
  tags: string[]
  stored: number
}

export interface MemoryReadInput {
  query: string
  limit?: number
  namespace?: string
}

export interface MemoryReadOutput {
  namespace: string
  hits: MemoryHit[]
  decision: MemoryDecision
}

export interface MemorySearchInput {
  query: string
  limit?: number
  threshold?: number
  namespace?: string
}

export interface MemorySearchOutput {
  hits: MemoryHit[]
  namespaces: string[]
  decisions: MemoryDecision[]
}

export class MemoryAccessError extends Error {
  readonly reason: string
  readonly namespace: string

  constructor(namespace: string, reason: string) {
    super(`Memory access denied for namespace "${namespace}" (${reason})`)
    this.name = "MemoryAccessError"
    this.reason = reason
    this.namespace = namespace
  }
}

interface MemoryStores {
  dir: string
  vector: VectorMemory
  sessions: SessionStore
}

const EPISODIC_PREFIX = "[memory]"
const SESSION_NAME_PREFIX = "memory:"
const MAX_LIMIT = 50
const DEFAULT_LIMIT = 5
const DEFAULT_THRESHOLD = 0.5

let stores: MemoryStores | null = null
let unifiedConfigured = false

export function resolveMemoryDir(): string {
  const override = process.env.AEGIS_MEMORY_DIR
  if (override && override.trim().length > 0) return override.trim()
  return memoryRoot()
}

export function getMemoryStores(): MemoryStores {
  const dir = resolveMemoryDir()
  if (stores && stores.dir === dir) return stores
  if (stores) {
    try {
      stores.sessions.close()
    } catch {
      /* best effort */
    }
  }
  stores = {
    dir,
    vector: new VectorMemory({ dbPath: join(dir, "vectors") }),
    sessions: new SessionStore(join(dir, "sessions.db")),
  }
  unifiedConfigured = false
  return stores
}

export function closeMemoryStores(): void {
  if (!stores) return
  try {
    stores.sessions.close()
  } catch {
    /* best effort */
  }
  stores = null
  unifiedConfigured = false
}

export function sanitizeNamespace(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/[-.]+$/, "")
  if (cleaned.length === 0 || cleaned === "." || cleaned === "..") return "default"
  return cleaned.slice(0, 96)
}

export function resolvePrincipal(ctx: ToolContext): Principal {
  const agentType = ctx.agentType && ctx.agentType.trim().length > 0 ? ctx.agentType.trim() : "default"
  return { team: agentType, agent: ctx.agentId, role: agentType, group: agentType }
}

export function namespaceFor(ctx: ToolContext): string {
  return sanitizeNamespace(ctx.agentId && ctx.agentId.length > 0 ? ctx.agentId : "default")
}

export function ownNamespace(principal: Principal): string {
  if (principal.agent && principal.agent.length > 0) return sanitizeNamespace(principal.agent)
  if (principal.team && principal.team.length > 0) return sanitizeNamespace(principal.team)
  return "default"
}

function defaultTool(action: MemoryAction): string {
  return action === "write" ? "memory_write" : "memory_read"
}

function describePrincipal(principal: Principal): string {
  const agent = principal.agent ?? ""
  const team = principal.team ?? ""
  if (agent.length > 0 && team.length > 0) return `agent:${agent} (team:${team})`
  if (agent.length > 0) return `agent:${agent}`
  if (team.length > 0) return `team:${team}`
  return "unknown"
}

export function authorizeMemoryAccess(
  principal: Principal,
  action: MemoryAction,
  target: MemoryTarget,
): MemoryDecision {
  const namespace = target.namespace
  const path = target.path && target.path.length > 0 ? target.path : "*"
  const tool = target.tool ?? defaultTool(action)
  const policy = loadPolicy(namespace)

  if (!policy) {
    if (ownNamespace(principal) === namespace) {
      return { allowed: true, reason: "default_allow_own_namespace" }
    }
    return { allowed: false, reason: "no_policy_default_deny" }
  }

  const decision =
    action === "write" ? canExecute(principal, namespace, path, tool) : canRead(principal, namespace, path, tool)

  return { allowed: decision.allowed, reason: decision.reason, rule_id: decision.rule_id }
}

export function logMemoryDecision(
  principal: Principal,
  action: MemoryAction,
  target: MemoryTarget,
  allowed: boolean,
  reason: string,
): void {
  const entry: AuditEntry = {
    ts: Date.now(),
    event: allowed ? "read" : "deny",
    requester: describePrincipal(principal),
    namespace: target.namespace,
    path: target.path,
    tool: target.tool ?? defaultTool(action),
    allowed,
    reason,
  }
  if (target.rule_id) entry.rule_id = target.rule_id
  logAudit(entry)
}

export function ensureNamespacePolicy(principal: Principal, namespace: string): void {
  if (loadPolicy(namespace)) return
  const owner = principal.agent && principal.agent.length > 0 ? `agent:${principal.agent}` : namespace
  const policy: MemoryPolicyType = {
    namespace,
    owner,
    default: "deny",
    allow: [{ principal: owner, tools_allowed: ["*"] }],
    deny: [],
  }
  savePolicy(policy)
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT
  const floored = Math.floor(limit)
  if (floored < 1) return 1
  if (floored > MAX_LIMIT) return MAX_LIMIT
  return floored
}

function episodicSessionId(namespace: string): string {
  return `mem-${namespace}`
}

function namespaceFromSessionName(name: string): string | null {
  if (!name.startsWith(SESSION_NAME_PREFIX)) return null
  const ns = name.slice(SESSION_NAME_PREFIX.length)
  return ns.length > 0 ? ns : null
}

function parseEpisodic(raw: string): { key: string; content: string; tags: string[] } {
  if (!raw.startsWith(EPISODIC_PREFIX)) {
    return { key: "untitled", content: raw, tags: [] }
  }
  const newlineIdx = raw.indexOf("\n")
  const header = newlineIdx >= 0 ? raw.slice(EPISODIC_PREFIX.length, newlineIdx) : ""
  const content = newlineIdx >= 0 ? raw.slice(newlineIdx + 1) : ""
  const keyPart = header.replace(/^key=/, "").split(" ")[0] ?? ""
  const tags: string[] = []
  const tagMatch = /tags=([^\s]+)/.exec(header)
  if (tagMatch && tagMatch[1]) {
    for (const tag of tagMatch[1].split(",")) {
      if (tag.length > 0) tags.push(tag)
    }
  }
  return { key: keyPart.length > 0 ? keyPart : "untitled", content, tags }
}

function formatEpisodic(key: string, content: string, tags: string[]): string {
  const header = tags.length > 0 ? ` tags=${tags.join(",")}` : ""
  return `${EPISODIC_PREFIX} key=${key}${header}\n${content}`
}

function toHit(entry: VectorEntry, namespace: string, score: number, store: string): MemoryHit {
  return {
    namespace,
    key: entry.category && entry.category.length > 0 ? entry.category : "untitled",
    content: entry.content,
    score,
    store,
    timestamp: entry.timestamp,
    tags: [],
  }
}

function dedupeHits(hits: MemoryHit[]): MemoryHit[] {
  const seen = new Set<string>()
  const out: MemoryHit[] = []
  for (const hit of hits) {
    const fingerprint = `${hit.namespace}:${hit.key}:${hit.content}`
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    out.push(hit)
  }
  return out.sort((a, b) => b.score - a.score)
}

async function collectNamespaceHits(query: string, limit: number, namespace: string): Promise<MemoryHit[]> {
  const s = getMemoryStores()
  await s.vector.initialize()

  const hits: MemoryHit[] = []
  const queryEmbedding = computeEmbedding(query)

  const keyMatches = await s.vector.searchByCategory(query, limit)
  for (const entry of keyMatches) {
    if (entry.source !== namespace) continue
    hits.push(toHit(entry, namespace, 1, "vector"))
  }

  const similar = await s.vector.search(query, limit * 3)
  for (const entry of similar) {
    if (entry.source !== namespace) continue
    hits.push(toHit(entry, namespace, cosineSimilarity(queryEmbedding, computeEmbedding(entry.content)), "vector"))
  }

  const messages = s.sessions.searchMessages(query, limit * 3)
  for (const found of messages) {
    const ns = namespaceFromSessionName(found.session.name)
    if (ns !== namespace) continue
    const parsed = parseEpisodic(found.message.content)
    hits.push({
      namespace,
      key: parsed.key,
      content: parsed.content,
      score: 0.7,
      store: "sessions",
      timestamp: new Date(found.message.timestamp).toISOString(),
      tags: parsed.tags,
    })
  }

  return dedupeHits(hits).slice(0, limit)
}

function appendEpisodic(
  s: MemoryStores,
  namespace: string,
  key: string,
  content: string,
  tags: string[],
  ctx: ToolContext,
): void {
  const sessionId = episodicSessionId(namespace)
  if (!s.sessions.getSession(sessionId)) {
    s.sessions.createSession({
      id: sessionId,
      name: `${SESSION_NAME_PREFIX}${namespace}`,
      agentType: ctx.agentType && ctx.agentType.trim().length > 0 ? ctx.agentType.trim() : "default",
      goal: `Memory namespace ${namespace}`,
      status: "active",
      metadata: { namespace },
    })
  }
  s.sessions.addMessage(sessionId, {
    sessionId,
    role: "assistant",
    content: formatEpisodic(key, content, tags),
  })
}

export async function writeMemoryEntry(ctx: ToolContext, input: MemoryWriteInput): Promise<MemoryWriteOutput> {
  const principal = resolvePrincipal(ctx)
  const namespace = sanitizeNamespace(
    input.namespace && input.namespace.trim().length > 0 ? input.namespace : namespaceFor(ctx),
  )
  const key = input.key.trim()
  const tags = input.tags ?? []
  const target: MemoryTarget = { namespace, path: key, tool: "memory_write" }

  const decision = authorizeMemoryAccess(principal, "write", target)
  logMemoryDecision(principal, "write", { ...target, rule_id: decision.rule_id }, decision.allowed, decision.reason)
  if (!decision.allowed) throw new MemoryAccessError(namespace, decision.reason)

  ensureNamespacePolicy(principal, namespace)

  const s = getMemoryStores()
  await s.vector.initialize()
  const entryId = await s.vector.add(input.content, namespace, key)
  appendEpisodic(s, namespace, key, input.content, tags, ctx)

  return { namespace, key, entryId, tags, stored: 1 }
}

export async function readMemoryEntries(ctx: ToolContext, input: MemoryReadInput): Promise<MemoryReadOutput> {
  const principal = resolvePrincipal(ctx)
  const namespace = sanitizeNamespace(
    input.namespace && input.namespace.trim().length > 0 ? input.namespace : namespaceFor(ctx),
  )
  const query = input.query.trim()
  const limit = clampLimit(input.limit)
  const target: MemoryTarget = { namespace, path: query, tool: "memory_read" }

  const decision = authorizeMemoryAccess(principal, "read", target)
  logMemoryDecision(principal, "read", { ...target, rule_id: decision.rule_id }, decision.allowed, decision.reason)
  if (!decision.allowed) throw new MemoryAccessError(namespace, decision.reason)

  const hits = await collectNamespaceHits(query, limit, namespace)
  return { namespace, hits, decision }
}

function configureUnified(s: MemoryStores): void {
  if (unifiedConfigured) return
  UnifiedMemoryQuery.configure({ vectorMemory: s.vector, sessionStore: s.sessions })
  unifiedConfigured = true
}

function namespaceOfResult(result: UnifiedResult, vectorSources: Map<string, string>): string | null {
  if (result.store === "vector") {
    const id = typeof result.metadata?.id === "string" ? result.metadata.id : null
    if (!id) return null
    return vectorSources.get(id) ?? null
  }
  if (result.store === "sessions") {
    const name = typeof result.metadata?.sessionName === "string" ? result.metadata.sessionName : ""
    return namespaceFromSessionName(name)
  }
  return null
}

function keyOfResult(result: UnifiedResult): string {
  if (result.store === "vector") {
    const category = typeof result.metadata?.category === "string" ? result.metadata.category : ""
    return category.length > 0 ? category : "untitled"
  }
  if (result.store === "sessions") {
    return parseEpisodic(result.content).key
  }
  return "untitled"
}

function tagsOfResult(result: UnifiedResult): string[] {
  if (result.store === "sessions") return parseEpisodic(result.content).tags
  return []
}

export async function searchMemory(ctx: ToolContext, input: MemorySearchInput): Promise<MemorySearchOutput> {
  const principal = resolvePrincipal(ctx)
  const own = namespaceFor(ctx)
  const query = input.query.trim()
  const limit = clampLimit(input.limit)
  const threshold =
    input.threshold !== undefined && Number.isFinite(input.threshold) ? input.threshold : DEFAULT_THRESHOLD
  const requested = input.namespace && input.namespace.trim().length > 0 ? sanitizeNamespace(input.namespace) : null

  const s = getMemoryStores()
  await s.vector.initialize()
  configureUnified(s)

  if (requested) {
    const target: MemoryTarget = { namespace: requested, path: "*", tool: "memory_search" }
    const decision = authorizeMemoryAccess(principal, "read", target)
    logMemoryDecision(principal, "read", { ...target, rule_id: decision.rule_id }, decision.allowed, decision.reason)
    if (!decision.allowed) throw new MemoryAccessError(requested, decision.reason)
  }

  const unified = await UnifiedMemoryQuery.search({
    query,
    stores: ["recall", "vector", "sessions", "experience", "graph"],
    limit: limit * 3,
    minScore: 0,
  })

  const vectorSources = new Map<string, string>()
  const vectorEntries = await s.vector.search(query, Math.max(limit * 5, 50))
  for (const entry of vectorEntries) {
    vectorSources.set(entry.id, entry.source)
  }

  const byNamespace = new Map<string, MemoryHit[]>()
  for (const result of unified) {
    const ns = namespaceOfResult(result, vectorSources)
    if (!ns) continue
    const list = byNamespace.get(ns) ?? []
    list.push({
      namespace: ns,
      key: keyOfResult(result),
      content: result.content,
      score: result.score,
      store: result.store,
      timestamp: result.timestamp,
      tags: tagsOfResult(result),
    })
    byNamespace.set(ns, list)
  }

  const candidateNamespaces = new Set<string>()
  for (const ns of byNamespace.keys()) candidateNamespaces.add(ns)
  if (requested) {
    candidateNamespaces.clear()
    candidateNamespaces.add(requested)
  } else {
    candidateNamespaces.add(own)
  }

  const decisions: MemoryDecision[] = []
  const allowed = new Set<string>()
  for (const ns of candidateNamespaces) {
    const target: MemoryTarget = { namespace: ns, path: "*", tool: "memory_search" }
    const decision = authorizeMemoryAccess(principal, "read", target)
    logMemoryDecision(principal, "read", { ...target, rule_id: decision.rule_id }, decision.allowed, decision.reason)
    decisions.push(decision)
    if (decision.allowed) allowed.add(ns)
  }

  const hits: MemoryHit[] = []
  for (const [ns, list] of byNamespace) {
    if (!allowed.has(ns)) continue
    for (const hit of list) {
      if (hit.score >= threshold) hits.push(hit)
    }
  }

  return { hits: dedupeHits(hits).slice(0, limit), namespaces: Array.from(allowed), decisions }
}

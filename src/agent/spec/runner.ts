import type { ModelMessage } from "ai"
import type { AgentSpec } from "./schema"
import { hashSpec, deriveSessionId } from "./hasher"
import { toolsetRegistry } from "../../toolsets"

import { createAgentRuntime } from "../runtime"
import { AIProviderManager, resolveApiKey } from "../../ai"
import type { AIProviderType } from "../../ai/models"
import { AgentEngine } from "../engine"
import { BudgetGuard } from "../../economy/budget-guard"
import { estimateTokens } from "../../tools/precompact"
import type { MemoryNamespaceManager } from "../../memory/namespace"
import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve as resolvePath, isAbsolute } from "node:path"
import { homedir } from "node:os"

export interface RunResult {
  sessionId: string
  specHash: string
  text: string
  costUsd: number
  budgetStatus: "continue" | "skip_optional" | "abort"
  estimatedTokens: number
  overTokenBudget: boolean
  namespace?: string
  tools: string[]
}

export interface RunInput {
  goal: string
  files?: string[]
  baseDir?: string
}

const DEFAULT_TOOLS = ["read", "bash", "grep", "glob"]
const MAX_CONTEXT_FILE_BYTES = 64 * 1024
const MAX_CONTEXT_CHARS = 8_000
const MAX_SKILL_CHARS = 8_000

export function getRunsDir(): string {
  const override = process.env.AEGIS_RUNS_DIR?.trim()
  if (override) return resolvePath(override)
  return join(homedir(), ".aegis", "runs")
}

export function resolveSpecTools(spec: AgentSpec): string[] {
  const tools = spec.spec.tools
  const selected = new Set<string>()

  if (tools.toolset) {
    try {
      for (const tool of toolsetRegistry.resolveToolset(tools.toolset).tools) {
        selected.add(tool)
      }
    } catch {
      /* unknown toolset — allow/deny still apply */
    }
  }

  for (const tool of tools.allow) {
    selected.add(tool)
  }

  if (selected.size === 0) {
    for (const tool of DEFAULT_TOOLS) {
      selected.add(tool)
    }
  }

  for (const tool of tools.deny) {
    selected.delete(tool)
  }

  return [...selected]
}

function resolveSpecPath(filePath: string, baseDir?: string): string {
  if (isAbsolute(filePath)) return filePath
  if (baseDir) return resolvePath(baseDir, filePath)
  return resolvePath(process.cwd(), filePath)
}

function readContextFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) return null
    const stats = statSync(filePath)
    if (!stats.isFile()) return null
    if (stats.size > MAX_CONTEXT_FILE_BYTES) {
      return `[file too large: ${filePath} (${stats.size} bytes)]`
    }
    const content = readFileSync(filePath, "utf-8")
    if (content.length <= MAX_CONTEXT_CHARS) return content
    return `${content.slice(0, MAX_CONTEXT_CHARS)}\n[truncated]`
  } catch {
    return null
  }
}

async function loadSpecSkills(spec: AgentSpec, agentId: string): Promise<string> {
  const skills = spec.spec.skills ?? []
  if (skills.length === 0) return ""
  try {
    const { skillRegistry } = await import("../../skills")
    await skillRegistry.loadAll()
    const ctx = {
      agentId,
      agentType: spec.spec.type,
      cwd: process.cwd(),
    }
    const parts: string[] = []
    for (const name of skills) {
      const content = await skillRegistry.readSkill(name, ctx)
      if (content) {
        parts.push(`# Skill: ${name}\n\n${content.slice(0, MAX_SKILL_CHARS)}`)
      }
    }
    return parts.join("\n\n---\n\n")
  } catch {
    return ""
  }
}

interface NamespaceBinding {
  id: string
  name: string
  manager: MemoryNamespaceManager
}

async function bindNamespace(spec: AgentSpec): Promise<NamespaceBinding | null> {
  const name = spec.spec.memory?.namespace?.trim()
  if (!name) return null
  try {
    const { memoryNamespaceManager } = await import("../../memory/namespace")
    const key = `spec:${name}`
    const existing = memoryNamespaceManager.listNamespaces().find((n) => n.agentId === key)
    const namespace =
      existing ??
      memoryNamespaceManager.createNamespace(spec.spec.type, spec.spec.memory?.ttl_days ?? 30, key)
    return { id: namespace.id, name, manager: memoryNamespaceManager }
  } catch {
    return null
  }
}

function applySpecEnv(spec: AgentSpec): () => void {
  const env = spec.spec.env ?? {}
  const applied: string[] = []
  for (const [key, value] of Object.entries(env)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
      applied.push(key)
    }
  }
  return () => {
    for (const key of applied) {
      delete process.env[key]
    }
  }
}

export async function runSpec(spec: AgentSpec, input: RunInput): Promise<RunResult> {
  const specHash = hashSpec(spec)
  const sessionId = deriveSessionId(specHash, input.goal)

  const agentId = `spec-${sessionId}`
  const runtime = createAgentRuntime(agentId, spec.spec.type)
  const ai = new AIProviderManager({
    provider: spec.spec.model.provider as AIProviderType,
    model: spec.spec.model.name,
    apiKey: resolveApiKey(spec.spec.model.provider),
    temperature: spec.spec.model.temperature,
    maxOutputTokens: spec.spec.model.max_tokens,
  })
  const engine = new AgentEngine(runtime, ai, {
    sessionId,
    sessionName: spec.metadata.name,
    goal: input.goal,
    maxSteps: 20,
    audit: true,
    experience: true,
  })

  const resolvedTools = resolveSpecTools(spec)
  runtime.setAllowedTools(resolvedTools)

  const budgetGuard = spec.spec.budget?.usd ? new BudgetGuard(spec.spec.budget.usd) : null
  const namespace = await bindNamespace(spec)
  const restoreEnv = applySpecEnv(spec)

  let text = ""
  let estimatedTokens = 0

  try {
    const messages = await buildMessages(spec, input, agentId, namespace)
    estimatedTokens = messages.reduce((total, m) => total + estimateTokens(String(m.content ?? "")), 0)
    const result = await engine.chat(messages)
    text = result.text ?? ""
    estimatedTokens += estimateTokens(text)
  } catch (err) {
    await completeSession(engine, "failed")
    throw err
  } finally {
    restoreEnv()
  }

  await completeSession(engine, "completed")

  const spendUsd = await resolveSessionSpend(sessionId, engine.totalToolCost)
  if (budgetGuard) {
    budgetGuard.recordSpend(spendUsd)
  }
  const budgetStatus = budgetGuard ? budgetGuard.status().recommendation : "continue"

  if (namespace && text) {
    try {
      namespace.manager.addEntry(
        namespace.id,
        text.slice(0, MAX_CONTEXT_CHARS),
        "observation",
        `spec:${spec.metadata.name}`,
      )
    } catch {
      /* namespace persistence is non-critical */
    }
  }

  persistRunRecord(sessionId, specHash, spec, input)

  const tokenLimit = spec.spec.budget?.tokens

  return {
    sessionId,
    specHash,
    text,
    costUsd: spendUsd,
    budgetStatus,
    estimatedTokens,
    overTokenBudget: tokenLimit !== undefined && estimatedTokens > tokenLimit,
    namespace: namespace?.name,
    tools: resolvedTools,
  }
}

async function completeSession(engine: AgentEngine, status: "completed" | "failed"): Promise<void> {
  try {
    await engine.completeSession(status)
  } catch {
    /* session teardown must never break the run */
  }
}

async function resolveSessionSpend(sessionId: string, toolCostUsd: number): Promise<number> {
  let spend = toolCostUsd
  try {
    const { billingTracker } = await import("../../billing/tracker")
    const entry = billingTracker.getCostBySession().find((c) => c.sessionId === sessionId)
    if (entry) spend += entry.totalCost
  } catch {
    /* billing is optional */
  }
  return spend
}

async function buildMessages(
  spec: AgentSpec,
  input: RunInput,
  agentId: string,
  namespace: NamespaceBinding | null,
): Promise<ModelMessage[]> {
  const messages: ModelMessage[] = []

  const systemParts: string[] = []
  if (spec.spec.system_prompt.template) {
    systemParts.push(spec.spec.system_prompt.template)
  }
  if (spec.spec.system_prompt.file) {
    const content = readContextFile(resolveSpecPath(spec.spec.system_prompt.file, input.baseDir))
    if (content) systemParts.push(content)
  }
  const skills = await loadSpecSkills(spec, agentId)
  if (skills) systemParts.push(skills)
  if (systemParts.length > 0) {
    messages.push({ role: "system", content: systemParts.join("\n\n---\n\n") })
  }

  if (namespace) {
    try {
      const recalled = namespace.manager.query(
        [namespace.id],
        input.goal,
        spec.spec.memory?.recall_top_k ?? 3,
      )
      if (recalled.length > 0) {
        const lines = recalled.map((entry) => `- ${entry.content}`).join("\n")
        messages.push({ role: "system", content: `Recall from namespace "${namespace.name}":\n${lines}` })
      }
    } catch {
      /* recall is best-effort */
    }
  }

  for (const file of [...(spec.spec.context_files ?? []), ...(input.files ?? [])]) {
    const path = resolveSpecPath(file, input.baseDir)
    const content = readContextFile(path)
    messages.push({
      role: "user",
      content: content ? `Context file: ${path}\n\n${content}` : `Context file: ${path}`,
    })
  }

  messages.push({ role: "user", content: input.goal })

  return messages
}

interface RunRecord {
  sessionId: string
  specHash: string
  spec: AgentSpec
  input: RunInput
  timestamp: string
}

function persistRunRecord(sessionId: string, specHash: string, spec: AgentSpec, input: RunInput): void {
  try {
    const dir = getRunsDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const record: RunRecord = { sessionId, specHash, spec, input, timestamp: new Date().toISOString() }
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify(record, null, 2), "utf-8")
  } catch {
    // non-critical
  }
}

export function getRunRecord(sessionId: string): RunRecord | null {
  try {
    const path = join(getRunsDir(), `${sessionId}.json`)
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, "utf-8"))
  } catch {
    return null
  }
}

export function listRunRecords(): RunRecord[] {
  const dir = getRunsDir()
  if (!existsSync(dir)) return []
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json"))
  } catch {
    return []
  }
  const records: RunRecord[] = []
  for (const file of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(dir, file), "utf-8")) as RunRecord
      if (parsed && typeof parsed.sessionId === "string") {
        records.push({ ...parsed, sessionId: parsed.sessionId || file.replace(/\.json$/, "") })
      }
    } catch {
      /* skip unreadable records */
    }
  }
  records.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
  return records
}

import type { AgentSpec } from "./schema"
import { hashSpec, deriveSessionId } from "./hasher"
import { toolsetRegistry } from "../../toolsets"

import { createAgentRuntime } from "../runtime"
import { AIProviderManager, resolveApiKey } from "../../ai"
import type { AIProviderType } from "../../ai/models"
import { AgentEngine } from "../engine"

export interface RunResult {
  sessionId: string
  specHash: string
  text: string
}

export interface RunInput {
  goal: string
  files?: string[]
}

function resolveTools(spec: AgentSpec): string[] {
  if (spec.spec.tools.toolset) {
    try {
      const resolved = toolsetRegistry.resolveToolset(spec.spec.tools.toolset)
      return resolved.tools
    } catch {
      // fall through to allow/deny
    }
  }
  const allowSet = new Set(spec.spec.tools.allow.length > 0 ? spec.spec.tools.allow : ["read", "bash", "grep", "glob"])
  for (const d of spec.spec.tools.deny) allowSet.delete(d)
  return [...allowSet]
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
    maxTokens: spec.spec.model.max_tokens,
  })
  const engine = new AgentEngine(runtime, ai, {
    sessionId,
    sessionName: spec.metadata.name,
    goal: input.goal,
    maxSteps: 20,
  })

  const resolvedTools = resolveTools(spec)
  if (resolvedTools.length > 0) {
    runtime.setAllowedTools(resolvedTools)
  }

  const messages = [
    ...(spec.spec.system_prompt.template ? [{ role: "system" as const, content: spec.spec.system_prompt.template }] : []),
    ...(input.files && input.files.length > 0
      ? input.files.map((f) => ({ role: "user" as const, content: `Read these files as context:\n${f}` }))
      : []),
    { role: "user" as const, content: input.goal },
  ]

  const result = await engine.chat(messages)

  // Record that this run happened
  persistRunRecord(sessionId, specHash, spec, input)

  return { sessionId, specHash, text: result.text }
}

// ── Run record persistence ──────────────────────────────────────────────

interface RunRecord {
  sessionId: string
  specHash: string
  spec: AgentSpec
  input: RunInput
  timestamp: string
}

function persistRunRecord(sessionId: string, specHash: string, spec: AgentSpec, input: RunInput): void {
  try {
    const { writeFileSync, existsSync, mkdirSync } = require("fs")
    const { join } = require("path")
    const { homedir } = require("os")
    const dir = join(homedir(), ".aegis", "runs")
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    const record: RunRecord = { sessionId, specHash, spec, input, timestamp: new Date().toISOString() }
    writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify(record, null, 2), "utf-8")
  } catch {
    // non-critical
  }
}

export function getRunRecord(sessionId: string): RunRecord | null {
  try {
    const { readFileSync, existsSync } = require("fs")
    const { join } = require("path")
    const { homedir } = require("os")
    const path = join(homedir(), ".aegis", "runs", `${sessionId}.json`)
    if (!existsSync(path)) return null
    return JSON.parse(readFileSync(path, "utf-8"))
  } catch {
    return null
  }
}

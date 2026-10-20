/**
 * The engine must persist every executed tool call into the experience
 * buffer. Previously addAction() had no production caller, so the whole
 * distillation pipeline (cluster insights, skill candidates, step lists)
 * ran on permanently empty data.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { AgentEngine } from "./engine"
import { AgentRuntime } from "./runtime"
import { agentManager } from "./manager"
import { toolRegistry } from "../tools"
import { ExperienceStore } from "../experience/store"
import { AIProviderManager } from "../ai"
import type { AgentInstance } from "./types"

const PROBE_TOOL = "experience_probe_tool"
const AGENT_ID = "experience-probe-agent"

function makeAgentInstance(agentId: string): AgentInstance {
  return {
    id: agentId,
    def: {
      name: agentId,
      script: "src/agent/agent-worker.ts",
      tools: [{ name: PROBE_TOOL, allow: true }],
    },
    status: "running",
    process: {} as AgentInstance["process"],
    spawnTime: Date.now(),
    lastActivity: Date.now(),
    log: [],
    pid: 424242,
    exitCode: null,
    metadata: {},
  }
}

type EngineTools = Record<string, { execute: (args: Record<string, unknown>) => Promise<string> }>

function engineTools(engine: AgentEngine): EngineTools {
  return (engine as unknown as { buildVercelTools(): EngineTools }).buildVercelTools()
}

describe("engine experience actions", () => {
  let dir: string
  let store: ExperienceStore
  let engine: AgentEngine

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "engine-experience-"))
    store = new ExperienceStore({ dbPath: join(dir, "experience.db") })

    toolRegistry.register({
      name: PROBE_TOOL,
      description: "probe tool used by the experience action test",
      parameters: [{ name: "path", type: "string", description: "a path", required: false }],
      execute: async () => ({ success: true, output: "probe ok" }),
    })

    agentManager.agents.set(AGENT_ID, makeAgentInstance(AGENT_ID))

    const runtime = new AgentRuntime({ agentId: AGENT_ID, cwd: process.cwd() })
    const ai = new AIProviderManager({ provider: "openai", model: "gpt-4o-mini" })
    engine = new AgentEngine(runtime, ai, {
      sessionId: "session-experience-1",
      goal: "probe the experience buffer",
      experience: true,
      experienceStore: store,
    })
  })

  afterEach(() => {
    agentManager.agents.delete(AGENT_ID)
    store.close()
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* best-effort cleanup */
    }
  })

  it("records an action for every executed tool call", async () => {
    const tools = engineTools(engine)
    const tool = tools[PROBE_TOOL]
    expect(tool).toBeDefined()

    const output = await tool!.execute({ path: "src/index.ts" })
    expect(output).toBe("probe ok")

    const actions = store.getActionsForExperience("session-experience-1")
    expect(actions.length).toBe(1)
    expect(actions[0]?.actionType).toBe(PROBE_TOOL)
    expect(actions[0]?.outcome).toBe("success")
    expect(actions[0]?.description).toContain(PROBE_TOOL)
    expect(actions[0]?.details).toContain("src/index.ts")
    expect(store.getStats().totalActions).toBe(1)
  })

  it("keeps the step index ordered across multiple tool calls", async () => {
    const tools = engineTools(engine)
    const tool = tools[PROBE_TOOL]

    await tool!.execute({ path: "a.ts" })
    await tool!.execute({ path: "b.ts" })

    const actions = store.getActionsForExperience("session-experience-1")
    expect(actions.length).toBe(2)
    expect(actions[0]?.stepIndex).toBe(0)
    expect(actions[1]?.stepIndex).toBe(1)
    expect(store.getStats().totalActions).toBe(2)
  })

  it("records failures with an error outcome", async () => {
    toolRegistry.register({
      name: PROBE_TOOL,
      description: "probe tool that fails",
      parameters: [],
      execute: async () => ({ success: false, output: "", error: "boom" }),
    })

    const tools = engineTools(engine)
    const tool = tools[PROBE_TOOL]
    await tool!.execute({})

    const actions = store.getActionsForExperience("session-experience-1")
    expect(actions.length).toBe(1)
    expect(actions[0]?.outcome).toBe("error")
    expect(actions[0]?.details).toContain("boom")
  })

  it("keeps the action attached to the experience record written on completion", async () => {
    const tools = engineTools(engine)
    await tools[PROBE_TOOL]!.execute({ path: "c.ts" })

    store.recordExperience({
      id: "session-experience-1",
      project: "",
      sessionId: "session-experience-1",
      goal: "probe the experience buffer",
      agentType: "agent",
      outcome: "success",
      reward: 1,
      actionCount: 1,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      summary: "done",
      tags: [],
      metrics: "{}",
    })

    const record = store.getById("session-experience-1")
    expect(record).not.toBeNull()
    expect(store.getActionsForExperience("session-experience-1").length).toBe(1)
  })
})

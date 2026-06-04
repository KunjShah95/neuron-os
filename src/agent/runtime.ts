import { toolRegistry } from "../tools"
import { skillRegistry } from "../skills"
import { memorySystem as globalMemorySystem, type MemorySystem } from "../memory"
import type { ToolContext, ToolResult } from "../tools"
import type { SkillContext } from "../skills"
import type { MemoryContext } from "../memory"
import type { AgentInstance } from "./types"
import { agentManager } from "./manager"
import { loadSoul } from "./soul"

export interface AgentContext {
  agentId: string
  agentType?: string
  cwd: string
}

export class AgentRuntime {
  readonly context: AgentContext
  private memory: MemorySystem

  constructor(context: AgentContext, memorySystem?: MemorySystem) {
    this.context = context
    this.memory = memorySystem ?? globalMemorySystem
  }

  async executeTool(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const agent = this.getAgent()
    if (!agent) {
      return {
        success: false,
        output: "",
        error: `Agent ${this.context.agentId} not found`,
      }
    }

    const toolCtx: ToolContext = {
      agentId: this.context.agentId,
      agentType: this.context.agentType,
      cwd: this.context.cwd,
      permissions: agent.def.tools || [],
    }

    return await toolRegistry.execute(name, params, toolCtx)
  }

  async loadSkills(query?: string): Promise<string> {
    await this.ensureSkillsLoaded()

    const skillCtx: SkillContext = {
      agentId: this.context.agentId,
      agentType: this.context.agentType,
      cwd: this.context.cwd,
    }

    const skillNames = new Set<string>()

    if (query) {
      // Read per-agent-type skill mappings from env var (JSON object) or fall back to defaults.
      // Example: AEGIS_SKILL_MAPPINGS='{"review":["code-review"],"debug":["debugging"]}'
      let explicit: Record<string, string[]> = {}
      const envMappings = process.env.AEGIS_SKILL_MAPPINGS
      if (envMappings) {
        try {
          explicit = JSON.parse(envMappings)
        } catch {
          // Fall through to defaults
        }
      }
      // Built-in defaults as fallback (can be overridden via env var)
      if (Object.keys(explicit).length === 0) {
        explicit = {
          review: ["code-review"],
          debug: ["debugging"],
          build: ["git-commit", "code-review"],
          deploy: ["git-commit"],
        }
      }
      for (const name of explicit[query] || []) {
        skillNames.add(name)
      }

      const relevant = await skillRegistry.findRelevantSkills(query, 3)
      for (const s of relevant) {
        skillNames.add(s.metadata.name)
      }
    }

    if (skillNames.size === 0) return ""

    const injected: string[] = []
    for (const name of skillNames) {
      const content = await skillRegistry.readSkill(name, skillCtx)
      if (content) {
        injected.push(`# Skill: ${name}\n\n${content}`)
      }
    }
    return injected.join("\n\n---\n\n")
  }

  async loadMemory(): Promise<string> {
    const memoryCtx: MemoryContext = {
      agentId: this.context.agentId,
      agentType: this.context.agentType,
      cwd: this.context.cwd,
    }

    return await this.memory.buildContext(memoryCtx)
  }

  async saveToMemory(content: string, type: "memory" | "daily" | "auto" = "memory"): Promise<void> {
    if (type === "memory") {
      await this.memory.appendToMemory(content)
    } else if (type === "daily") {
      await this.memory.appendToDailyLog(content)
    } else if (type === "auto") {
      await this.memory.saveAutoMemory(content)
    }
  }

  async searchMemory(query: string): Promise<string> {
    const results = await this.memory.search(query)
    if (results.length === 0) {
      return "No relevant memories found."
    }

    return results
      .map((r) => `**[${r.source}]** ${r.timestamp}\n\n${r.content}`)
      .join("\n\n---\n\n")
  }

  private skillsLoaded = false

  async ensureSkillsLoaded(): Promise<void> {
    if (!this.skillsLoaded) {
      await skillRegistry.loadAll()
      this.skillsLoaded = true
    }
  }

  async buildSystemPrompt(): Promise<string> {
    const parts: string[] = []

    await this.ensureSkillsLoaded()

    if (this.context.agentType) {
      parts.push(this.getAgentTypeInstructions())

      const soul = await loadSoul({
        agentType: this.context.agentType,
        cwd: this.context.cwd,
      })
      if (soul.trim()) {
        parts.push(`## Soul\n\n${soul.trim()}`)
      }
    }

    const manifest = skillRegistry.buildManifestPrompt()
    if (manifest.trim()) {
      parts.push(`## Skill Catalog\n\n${manifest}`)
    }

    const memory = await this.loadMemory()
    if (memory.trim()) {
      parts.push(memory)
    }

    return parts.join("\n\n---\n\n")
  }

  private getAgentTypeInstructions(): string {
    const type = this.context.agentType || "aegis"

    const instructions: Record<string, string> = {
      build: "You are a build agent. Focus on implementing features, fixing bugs, and writing code. Use tools to read, write, and execute.",
      plan: "You are a planning agent. Analyze requirements and create implementation plans. Use read-only tools to explore the codebase.",
      read: "You are a read agent. Quickly find and retrieve file contents. Use grep and glob to locate relevant code.",
      write: "You are a write agent. Create and modify files based on specifications.",
      test: "You are a test agent. Run tests, analyze failures, and verify code quality.",
      validate: "You are a validation agent. Check code correctness, types, and linting.",
      review: "You are a review agent. Analyze code for quality, security, and best practices.",
      debug: "You are a debug agent. Systematically identify and fix issues.",
      document: "You are a documentation agent. Generate and update documentation.",
      refactor: "You are a refactor agent. Improve code structure without changing behavior.",
      deploy: "You are a deploy agent. Handle deployment and infrastructure tasks.",
      monitor: "You are a monitor agent. Watch for changes and report status.",
      explore: "You are an explore agent. Quickly search and understand codebases.",
    }

    return instructions[type] || `You are a ${type} agent.`
  }

  private getAgent(): AgentInstance | undefined {
    return agentManager.get(this.context.agentId)
  }
}

export function createAgentRuntime(agentId: string, agentType?: string, cwd?: string, memorySystem?: MemorySystem): AgentRuntime {
  return new AgentRuntime({
    agentId,
    agentType,
    cwd: cwd || process.cwd(),
  }, memorySystem)
}

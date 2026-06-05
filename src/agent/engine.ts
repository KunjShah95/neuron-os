import { streamText, generateText, jsonSchema, stepCountIs } from "ai"
import type { ModelMessage, ToolSet } from "ai"
import { AgentRuntime } from "./runtime"
import { toolRegistry, type ToolParameter, type ToolContext } from "../tools"
import { AIProviderManager } from "../ai"
import type { ToolPermission } from "./agent-types"
import { sessionStore, getProjectSessionStore, type SessionStore } from "../memory/session-persistence"
import { AuditRecorder } from "../audit/recorder"
import { experienceStore, type Outcome } from "../experience/store"
import { createLogger } from "../cli/logger"

const log = createLogger("agent-engine")

const FULL_TOOL_PERMISSIONS: ToolPermission[] = [
  { name: "read", allow: true },
  { name: "read_skill", allow: true },
  { name: "write", allow: true },
  { name: "edit", allow: true },
  { name: "bash", allow: true },
  { name: "grep", allow: true },
  { name: "glob", allow: true },
]

export interface AgentEngineConfig {
  maxSteps?: number
  /**
   * Session ID for SQLite persistence.
   * If provided, every chat/streamChat exchange is automatically
   * recorded to the session store.
   */
  sessionId?: string
  /**
   * Session name (human-readable, for the sessions table).
   * Defaults to "agent-{sessionId}".
   */
  sessionName?: string
  /**
   * Goal or task description for this session.
   * Persisted to the sessions table for restore visibility.
   */
  goal?: string
  /**
   * Custom session store instance. Defaults to the global singleton.
   */
  sessionStore?: SessionStore
  /**
   * Project name for project-scoped session persistence.
   * When set, sessions are stored in ~/.aegis/projects/<name>/sessions.db
   * instead of the default cwd-based path.
   */
  project?: string
  /**
   * Enable audit recording for this session.
   * Captures every agent thought, tool call, and action.
   */
  audit?: boolean
  /**
   * Enable experience recording for this session.
   * Stores trajectories for skill distillation and failure analysis.
   */
  experience?: boolean
}

export class AgentEngine {
  private runtime: AgentRuntime
  private ai: AIProviderManager
  private maxSteps: number
  private sessionId?: string
  private sessionName?: string
  private sessionGoal?: string
  private sessionStore?: SessionStore
  private sessionCreated = false
  private auditRecorder?: AuditRecorder
  private experienceEnabled = false
  private experienceStartedAt = ""
  private experienceActionCount = 0

  constructor(runtime: AgentRuntime, ai: AIProviderManager, config?: AgentEngineConfig) {
    this.runtime = runtime
    this.ai = ai
    this.maxSteps = config?.maxSteps ?? 10
    this.sessionId = config?.sessionId
    this.sessionName = config?.sessionName
    this.sessionGoal = config?.goal
    // Use project-scoped session store when project is specified
    this.sessionStore = config?.project
      ? getProjectSessionStore(config.project)
      : (config?.sessionStore ?? sessionStore)

    // Initialize audit recorder if enabled
    if (config?.audit && config?.sessionId) {
      this.auditRecorder = new AuditRecorder({
        sessionId: config.sessionId,
        project: config.project,
      })
      this.auditRecorder.recordSessionStart(config?.goal || "untitled")
    }

    // Initialize experience tracking if enabled
    if (config?.experience && config?.sessionId) {
      this.experienceEnabled = true
      this.experienceStartedAt = new Date().toISOString()
    }
  }

  // ── Session persistence ───────────────────────────────────────────

  /**
   * Initialize a session record in the SQLite store.
   * Called lazily before the first message of the session is persisted.
   */
  private ensureSession(): void {
    if (this.sessionCreated || !this.sessionId) return
    this.sessionCreated = true

    const store = this.sessionStore ?? sessionStore

    try {
      const existing = store.getSession(this.sessionId)
      if (existing) {
        // Session already exists — mark as active
        store.updateSession(this.sessionId, { status: "active" })
        log.debug("Resumed existing session", { sessionId: this.sessionId })
      } else {
        // Create new session
        store.createSession({
          id: this.sessionId,
          name: this.sessionName ?? `agent-${this.sessionId}`,
          agentType: this.runtime.context.agentType ?? "default",
          goal: this.sessionGoal ?? "",
          status: "active",
          metadata: { cwd: this.runtime.context.cwd },
        })
        log.debug("Created session", { sessionId: this.sessionId })
      }
    } catch (err) {
      log.warn("Failed to create/resume session", { error: String(err) })
    }
  }

  /**
   * Record a message exchange to the session store.
   */
  private persistMessage(role: "user" | "assistant" | "system" | "tool", content: string): void {
    if (!this.sessionId) return

    this.ensureSession()

    const store = this.sessionStore ?? sessionStore
    try {
      store.addMessage(this.sessionId, { sessionId: this.sessionId, role, content })
      this.experienceActionCount++
    } catch (err) {
      log.warn("Failed to persist message", { error: String(err), role })
    }
  }

  /**
   * Complete or fail the session.
   * Records the experience trajectory if experience tracking is enabled.
   */
  completeSession(status: "completed" | "failed" = "completed"): void {
    if (!this.sessionId) return

    const store = this.sessionStore ?? sessionStore
    try {
      store.updateSession(this.sessionId, { status })
    } catch (err) {
      log.warn("Failed to update session status", { error: String(err) })
    }

    // Record audit end
    if (this.auditRecorder) {
      this.auditRecorder.recordSessionEnd(status)
    }

    // Record experience trajectory
    if (this.experienceEnabled && this.sessionGoal) {
      try {
        const outcome: Outcome = status === "completed" ? "success" : "failed"
        experienceStore.recordExperience({
          id: this.sessionId,
          project: "",
          sessionId: this.sessionId,
          goal: this.sessionGoal,
          agentType: "agent",
          outcome,
          reward: outcome === "success" ? 1.0 : 0.0,
          actionCount: this.experienceActionCount,
          startedAt: this.experienceStartedAt,
          completedAt: new Date().toISOString(),
          summary: `Session ${status}: ${this.sessionGoal.slice(0, 100)}`,
          tags: [],
          metrics: JSON.stringify({ steps: this.experienceActionCount }),
        })
      } catch (err) {
        log.warn("Failed to record experience", { error: String(err) })
      }
    }
  }

  /**
   * Persist the initial user message(s) for the session.
   * Reserved for external orchestrators to batch-record initial context.
   */
  persistUserMessages(messages: ModelMessage[]): void {
    if (!this.sessionId || messages.length === 0) return

    this.ensureSession()

    const store = this.sessionStore ?? sessionStore
    try {
      for (const msg of messages) {
        const role = msg.role as "user" | "assistant" | "system" | "tool"
        const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
        store.addMessage(this.sessionId, { sessionId: this.sessionId, role, content })
      }
    } catch (err) {
      log.warn("Failed to persist user messages", { error: String(err) })
    }
  }

  private parameterToJsonSchema(p: ToolParameter): Record<string, unknown> {
    const typeMap: Record<string, string> = {
      string: "string",
      number: "number",
      boolean: "boolean",
      array: "array",
    }
    return {
      type: typeMap[p.type] || "string",
      description: p.description,
    }
  }

  private buildVercelTools(): ToolSet {
    const allTools = toolRegistry.list()
    const tools: ToolSet = {}

    for (const t of allTools) {
      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const p of t.parameters) {
        properties[p.name] = this.parameterToJsonSchema(p)
        if (p.required) {
          required.push(p.name)
        }
      }

      const schema: Record<string, unknown> = {
        type: "object",
        properties,
      }
      if (required.length > 0) {
        schema.required = required
      }

      const toolName = t.name

      ;(tools as any)[toolName] = {
        description: t.description,
        parameters: jsonSchema(schema),
        execute: async (args: any) => {
          const toolCtx: ToolContext = {
            agentId: this.runtime.context.agentId,
            agentType: this.runtime.context.agentType,
            cwd: this.runtime.context.cwd,
            permissions: FULL_TOOL_PERMISSIONS,
          }
          const result = await toolRegistry.execute(toolName, args, toolCtx)
          if (result.success) {
            return result.output || "(tool completed with no output)"
          }
          return `Error: ${result.error}`
        },
      }
    }

    return tools
  }

  private buildToolDescription(): string {
    const allTools = toolRegistry.list()
    const lines = ["You have access to the following tools:", ""]
    for (const t of allTools) {
      const params = t.parameters
        .map((p) => `${p.name}${p.required ? "" : "?"}: ${p.type}`)
        .join(", ")
      lines.push(`- **${t.name}**: ${t.description}`)
      if (params) lines.push(`  Parameters: ${params}`)
      lines.push("")
    }
    lines.push("When you need to accomplish a task, call the appropriate tool. The tool results will be provided to you in subsequent messages.")
    return lines.join("\n")
  }

  async streamChat(
    messages: ModelMessage[],
    callbacks?: {
      onChunk?: (chunk: string) => void
      onSignal?: AbortSignal
    },
  ): Promise<string> {
    const base = await this.runtime.buildSystemPrompt()
    const toolDesc = this.buildToolDescription()
    const systemPrompt = base.trim() ? `${base}\n\n---\n\n${toolDesc}` : toolDesc

    const tools = this.buildVercelTools()
    const toolKeys = Object.keys(tools)

    // Persist incoming user messages
    const lastUserMsg = messages.findLast((m) => m.role === "user")
    if (lastUserMsg) {
      const content = typeof lastUserMsg.content === "string" ? lastUserMsg.content : JSON.stringify(lastUserMsg.content)
      this.persistMessage("user", content)
    }

    const result = streamText({
      model: this.ai.getModel(),
      system: systemPrompt,
      messages,
      tools: toolKeys.length > 0 ? tools : undefined,
      stopWhen: stepCountIs(this.maxSteps),
      abortSignal: callbacks?.onSignal,
      temperature: this.ai.getConfig().temperature ?? 0.7,
    })

    let fullText = ""
    for await (const chunk of result.textStream) {
      fullText += chunk
      callbacks?.onChunk?.(chunk)
    }

    // Persist assistant response
    if (fullText) {
      this.persistMessage("assistant", fullText)
    }

    return fullText
  }

  async chat(messages: ModelMessage[]): Promise<{ text: string }> {
    const base = await this.runtime.buildSystemPrompt()
    const toolDesc = this.buildToolDescription()
    const systemPrompt = base.trim() ? `${base}\n\n---\n\n${toolDesc}` : toolDesc

    const tools = this.buildVercelTools()
    const toolKeys = Object.keys(tools)

    // Persist incoming user messages
    const lastUserMsg = messages.findLast((m) => m.role === "user")
    if (lastUserMsg) {
      const content = typeof lastUserMsg.content === "string" ? lastUserMsg.content : JSON.stringify(lastUserMsg.content)
      this.persistMessage("user", content)
    }

    const result = await generateText({
      model: this.ai.getModel(),
      system: systemPrompt,
      messages,
      tools: toolKeys.length > 0 ? tools : undefined,
      stopWhen: stepCountIs(this.maxSteps),
      temperature: this.ai.getConfig().temperature ?? 0.7,
    })

    // Persist assistant response
    if (result.text) {
      this.persistMessage("assistant", result.text)
    }

    return { text: result.text }
  }
}

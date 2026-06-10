import { streamText, generateText, jsonSchema, stepCountIs } from "ai"
import type { ModelMessage, ToolSet } from "ai"
import { AgentRuntime } from "./runtime"
import { toolRegistry, type ToolParameter, type ToolContext } from "../tools"
import { AIProviderManager } from "../ai"
import type { ToolPermission } from "./agent-types"
import { sessionStore, getProjectSessionStore, type SessionStore } from "../memory/session-persistence"
import { AuditRecorder } from "../audit/recorder"
import { experienceStore, type Outcome } from "../experience/store"
import { ExperienceRetriever } from "../experience/retrieval"
import { RatchetRuntime, type RatchetConfig } from "./ratchet"
import { Evaluator } from "../mesh/evaluator"
import type { EvaluationCriteria } from "../mesh/types"
import { createLogger } from "../cli/logger"
import { compactMessages, estimateMessagesTokens, estimateTokens, type CompactedState } from "../tools/precompact"
import { genaiTracer, type GenAIGenerationStart } from "../observability/genai-tracing"

const log = createLogger("agent-engine")

const FULL_TOOL_PERMISSIONS: ToolPermission[] = [
  { name: "read", allow: true },
  { name: "read_skill", allow: true },
  { name: "write", allow: true },
  { name: "edit", allow: true },
  { name: "bash", allow: true },
  { name: "grep", allow: true },
  { name: "glob", allow: true },
  { name: "ask_agent", allow: true },
]

export interface PlanStateHints {
  /** If true, instructs the model to maintain a TodoWrite plan via plan_state tool */
  enabled: boolean
  /** The goal/task description */
  goal?: string
}

export interface PreCompactConfig {
  /** Token threshold to trigger compaction (default 150000) */
  thresholdTokens: number
  /** Max tokens for the compacted summary (default 4000) */
  maxCompactTokens: number
}

export interface AgentEngineConfig {
  maxSteps?: number
  /**
   * Enable TodoWrite-style plan state via the plan_state tool.
   * When enabled, the system prompt includes instructions for the model
   * to call plan_state each turn to track progress.
   */
  planState?: boolean | PlanStateHints
  /**
   * Enable PreCompact hook for context window compaction.
   * When the estimated token count exceeds thresholdTokens,
   * older turns are summarized into a compact prior_state block.
   * Set to `true` for defaults, or pass a PreCompactConfig.
   */
  preCompact?: boolean | PreCompactConfig
  /**
   * Enable GenAI OpenTelemetry tracing with Langfuse export.
   * Records LLM generations and tool calls as spans with gen_ai.* attributes.
   * When LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY env vars are set,
   * spans are also exported to Langfuse via HTTP API.
   */
  tracing?: boolean
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
  /**
   * Enable git-aware ratchet: measure a metric after the session and revert
   * files when the outcome is "degraded". Pass `true` for defaults, or a
   * partial RatchetConfig (e.g., `{ testCommand: "npm test" }` or
   * `{ criteria: [{ metric: "typecheck" }] }`) to override.
   */
  ratchet?: boolean | Partial<RatchetConfig>
  /**
   * Evaluation criteria to compute a real scalar reward (0.0–1.0) for
   * experience recording. Falls back to neutral 0.5 when omitted.
   */
  evaluation?: EvaluationCriteria[]
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
  private ratchetRuntime?: RatchetRuntime
  private ratchetConfig?: RatchetConfig
  private evaluationCriteria?: EvaluationCriteria[]
  private sessionStartFiles: string[] = []
  private projectName = ""

  // ── Plan state ────────────────────────────────────────────
  private planStateEnabled = false
  private planStateGoal = ""

  // ── PreCompact ────────────────────────────────────────────
  private preCompactEnabled = false
  private preCompactThreshold = 150_000
  private preCompactMaxTokens = 4_000
  private lastCompactedState?: CompactedState
  private cumulativeTokenEstimate = 0

  // ── GenAI Tracing ─────────────────────────────────────────
  private tracingEnabled = false
  private currentTrace?: GenAIGenerationStart

  constructor(runtime: AgentRuntime, ai: AIProviderManager, config?: AgentEngineConfig) {
    this.runtime = runtime
    this.ai = ai
    this.maxSteps = config?.maxSteps ?? 10
    this.sessionId = config?.sessionId
    this.sessionName = config?.sessionName
    this.sessionGoal = config?.goal
    this.projectName = config?.project ?? ""
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

    // Stash evaluation criteria for completeSession()
    if (config?.evaluation) {
      this.evaluationCriteria = config.evaluation
    }

    // ── Plan state initialization ─────────────────────────
    if (config?.planState) {
      this.planStateEnabled = true
      if (typeof config.planState === "object") {
        this.planStateGoal = config.planState.goal ?? this.sessionGoal ?? ""
      } else {
        this.planStateGoal = this.sessionGoal ?? ""
      }
    }

    // ── PreCompact initialization ─────────────────────────
    if (config?.preCompact) {
      this.preCompactEnabled = true
      if (typeof config.preCompact === "object") {
        this.preCompactThreshold = config.preCompact.thresholdTokens ?? 150_000
        this.preCompactMaxTokens = config.preCompact.maxCompactTokens ?? 4_000
      }
    }

    // ── GenAI Tracing initialization ──────────────────────
    if (config?.tracing) {
      this.tracingEnabled = true
    }

    // Initialize ratchet runtime (git-aware measure/revert kernel)
    if (config?.ratchet) {
      this.ratchetRuntime = new RatchetRuntime()
      const cwd = this.runtime.context.cwd
      const base: RatchetConfig = { cwd }
      if (typeof config.ratchet === "object") {
        this.ratchetConfig = { ...base, ...config.ratchet }
      } else {
        this.ratchetConfig = base
      }
      if (this.ratchetRuntime.isGitRepo(cwd)) {
        this.sessionStartFiles = this.ratchetRuntime.getChangedFiles(cwd)
      }
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
   *
   * Wires the session-completion kernel:
   *  1. Evaluator (if `evaluation` criteria provided) → real scalar reward 0–1
   *  2. RatchetRuntime (if `ratchet` enabled) → measure, revert on regression
   *  3. Persist outcome + reward to experience store (if `experience` enabled)
   *  4. Record audit + session status updates
   *
   * Failure-safe: evaluator + ratchet each wrapped in try/catch with neutral
   * fallback so a faulty kernel never breaks session teardown.
   */
  async completeSession(status: "completed" | "failed" = "completed"): Promise<void> {
    if (!this.sessionId) return

    const store = this.sessionStore ?? sessionStore
    const cwd = this.runtime.context.cwd

    // Default: neutral reward when no signal (amendment ΔG5)
    let reward = 0.5
    let outcome: Outcome = "partial"
    const metrics: Record<string, unknown> = { steps: this.experienceActionCount }

    // ── Evaluator path (amendment ΔG1 failure-safe) ──────────────────
    if (this.evaluationCriteria && this.evaluationCriteria.length > 0) {
      try {
        const evaluator = new Evaluator(cwd)
        const evalResult = await evaluator.evaluate(
          this.sessionId,
          this.sessionGoal ?? "untitled",
          this.evaluationCriteria,
        )
        reward = evalResult.overallScore
        outcome = evalResult.overallPass ? "success" : evalResult.overallScore > 0 ? "partial" : "failed"
        metrics.evaluation = evalResult
      } catch (err) {
        log.warn("Evaluator failed, falling back to neutral reward", { error: String(err) })
        outcome = "partial"
        reward = 0.5
        metrics.evaluationError = String(err)
      }
    } else if (status === "completed") {
      // No criteria + successful chat = still partial (we don't know the result)
      outcome = "partial"
      reward = 0.5
    } else {
      outcome = "failed"
      reward = 0
    }

    // ── Ratchet path ─────────────────────────────────────────────────
    if (this.ratchetRuntime && this.ratchetConfig) {
      try {
        const measure = await this.ratchetRuntime.measure(this.ratchetConfig)
        const newFiles = measure.filesChanged.filter((f) => !this.sessionStartFiles.includes(f))
        if (measure.outcome === "degraded" && newFiles.length > 0) {
          this.ratchetRuntime.revertFiles(cwd, newFiles)
          outcome = "reverted"
          reward = Math.min(reward, measure.score)
          if (this.auditRecorder) {
            this.auditRecorder.recordRatchetRevert({
              files: newFiles,
              previousScore: -1,
              newScore: measure.score,
              reason: measure.outcome,
            })
          }
        } else if (this.evaluationCriteria) {
          reward = measure.score
        }
        metrics.ratchet = measure
      } catch (err) {
        log.warn("Ratchet measure failed", { error: String(err) })
      }
    }

    // ── Persist session status ───────────────────────────────────────
    try {
      store.updateSession(this.sessionId, {
        status: outcome === "success" || outcome === "partial" ? "completed" : "failed",
      })
    } catch (err) {
      log.warn("Failed to update session status", { error: String(err) })
    }

    // ── Audit end ────────────────────────────────────────────────────
    if (this.auditRecorder) {
      this.auditRecorder.recordSessionEnd(outcome === "success" ? "completed" : "failed")
    }

    // ── Experience recording ─────────────────────────────────────────
    if (this.experienceEnabled && this.sessionGoal) {
      try {
        experienceStore.recordExperience({
          id: this.sessionId,
          project: this.projectName,
          sessionId: this.sessionId,
          goal: this.sessionGoal,
          agentType: this.runtime.context.agentType ?? "agent",
          outcome,
          reward,
          actionCount: this.experienceActionCount,
          startedAt: this.experienceStartedAt,
          completedAt: new Date().toISOString(),
          summary: `Session ${outcome} (r=${reward.toFixed(2)}): ${this.sessionGoal.slice(0, 100)}`,
          tags: [],
          metrics: JSON.stringify(metrics),
        })
      } catch (err) {
        log.warn("Failed to record experience", { error: String(err) })
      }
    }

    // ── Mood/Emotion update ──────────────────────────────────────────
    if (this.runtime.context.agentId) {
      try {
        const { soulManager } = await import("./soul")
        const moodOutcome = outcome === "success" ? "success" : "failure"
        soulManager.updateMood(this.runtime.context.agentId, moodOutcome)
      } catch (err) {
        log.warn("Mood update failed", { error: String(err) })
      }
    }

    // ── Dream engine activity mark ────────────────────────────────────
    try {
      const { dreamEngine } = await import("../dream/engine")
      dreamEngine.markActivity()
    } catch {
      // non-fatal
    }

    // ── Knowledge graph integration ──────────────────────────────────
    if (this.sessionGoal) {
      try {
        const { GraphIntegration } = await import("../memory/graph-integration")
        const gi = new GraphIntegration()
        await gi.processAgentRun({
          goal: this.sessionGoal,
          summary: `Session ${outcome} (r=${reward.toFixed(2)}): ${this.sessionGoal.slice(0, 100)}`,
          outcome,
          agentType: this.runtime.context.agentType ?? "agent",
          sessionId: this.sessionId,
        })
      } catch (err) {
        log.warn("Knowledge graph integration failed", { error: String(err) })
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
          const startTime = performance.now()
          const result = await toolRegistry.execute(toolName, args, toolCtx)
          const elapsedMs = performance.now() - startTime

          // Record tool cost to billing tracker (best-effort)
          try {
            const { loadPricing } = await import("../economy/pricing-registry")
            const { billingTracker } = await import("../billing/tracker")
            const pricing = loadPricing()
            const toolPrice = pricing.tools[toolName]
            if (toolPrice) {
              const costUSD =
                toolPrice.api_usd ??
                (toolPrice.compute_usd_per_second ? (elapsedMs / 1000) * toolPrice.compute_usd_per_second : 0) ??
                0
              if (costUSD > 0) {
                billingTracker.recordToolUsage(
                  this.runtime.context.agentId,
                  toolName,
                  costUSD,
                  this.runtime.context.agentId,
                )
              }
            }
          } catch {
            // Cost tracking is best-effort
          }

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
      const params = t.parameters.map((p) => `${p.name}${p.required ? "" : "?"}: ${p.type}`).join(", ")
      lines.push(`- **${t.name}**: ${t.description}`)
      if (params) lines.push(`  Parameters: ${params}`)
      lines.push("")
    }
    lines.push(
      "When you need to accomplish a task, call the appropriate tool. The tool results will be provided to you in subsequent messages.",
    )

    // Append plan state guidance if enabled
    if (this.planStateEnabled && this.planStateGoal) {
      lines.push("")
      lines.push("── Plan State Instructions ──")
      lines.push("Your goal is: " + this.planStateGoal)
      lines.push("")
      lines.push("At the START of every turn, call the `plan_state` tool with `operation='get'` to review your current plan.")
      lines.push("After each tool call or significant progress, call `plan_state` with `operation='update'` to rewrite the ENTIRE plan with updated statuses.")
      lines.push("Replace 'pending' with 'in_progress' when you start an item, and 'done' when complete.")
      lines.push("Use the 'note' field to record key decisions, blockers, or observations.")
      lines.push("IMPORTANT: Rewrite the FULL plan each time — never send partial updates.")
      lines.push("")
      lines.push("Example plan_state update format:")
      lines.push('  plan_state(operation="update", goal="fix bug", items=\'[{"id":1,"description":"find the issue","status":"done","note":"found in worker.rs:42"},{"id":2,"description":"apply fix","status":"in_progress","note":""}]\')')
    }

    return lines.join("\n")
  }

  private buildExperienceContext(): string {
    if (!this.experienceEnabled || !this.sessionGoal) return ""
    try {
      const retriever = new ExperienceRetriever(experienceStore)
      const similar = retriever.searchSimilar(this.sessionGoal, {
        project: this.projectName || undefined,
        limit: 5,
      })
      return retriever.formatContext(similar)
    } catch (err) {
      log.warn("Failed to build experience context", { error: String(err) })
      return ""
    }
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
    const experienceCtx = this.buildExperienceContext()
    let systemPrompt = base.trim() ? `${base}\n\n---\n\n${toolDesc}` : toolDesc
    if (experienceCtx) {
      systemPrompt = `${experienceCtx}\n\n---\n\n${systemPrompt}`
    }

    // ── PreCompact: compact messages if nearing token limit ──
    let activeMessages = messages
    if (this.preCompactEnabled) {
      if (this.lastCompactedState?.summary) {
        activeMessages = [
          { role: "system", content: `[PRIOR STATE — compacted from ${this.lastCompactedState.originalTurnCount} earlier turns]\n${this.lastCompactedState.summary}` },
          ...messages,
        ]
      }
      const estimated = estimateMessagesTokens(activeMessages) + estimateTokens(systemPrompt)
      this.cumulativeTokenEstimate = estimated
      if (estimated > this.preCompactThreshold) {
        log.info("PreCompact triggered", { estimatedTokens: estimated, threshold: this.preCompactThreshold })
        const { compacted, state, tokensSaved } = await compactMessages(
          activeMessages,
          { thresholdTokens: this.preCompactThreshold, maxCompactTokens: this.preCompactMaxTokens },
          this.ai,
        )
        if (state.originalTurnCount > 0) {
          activeMessages = compacted
          this.lastCompactedState = state
          this.cumulativeTokenEstimate = estimated - tokensSaved
          log.info("PreCompact completed", {
            originalTurns: state.originalTurnCount,
            tokensSaved,
            newEstimated: this.cumulativeTokenEstimate,
          })
        }
      }
    }

    const tools = this.buildVercelTools()
    const toolKeys = Object.keys(tools)

    // Persist incoming user messages
    const lastUserMsg = activeMessages.findLast((m) => m.role === "user")
    if (lastUserMsg) {
      const content =
        typeof lastUserMsg.content === "string" ? lastUserMsg.content : JSON.stringify(lastUserMsg.content)
      this.persistMessage("user", content)
    }

    // ── GenAI Tracing: start generation span ──
    const aiConfig = this.ai.getConfig()
    const modelName = aiConfig.model ?? "unknown"
    const providerName = aiConfig.provider ?? "unknown"

    if (this.tracingEnabled && this.sessionId) {
      this.currentTrace = genaiTracer.startGeneration({
        sessionId: this.sessionId,
        agentId: this.runtime.context.agentId,
        model: modelName,
        provider: providerName,
        systemPrompt,
        userMessages: activeMessages.filter((m) => m.role === "user").map((m) =>
          typeof m.content === "string" ? m.content : JSON.stringify(m.content)
        ),
        maxTokens: aiConfig.maxTokens,
        temperature: aiConfig.temperature,
      })
    }

    const startedAt = Date.now()
    const result = streamText({
      model: this.ai.getModel(),
      system: systemPrompt,
      messages: activeMessages,
      tools: toolKeys.length > 0 ? tools : undefined,
      stopWhen: stepCountIs(this.maxSteps),
      abortSignal: callbacks?.onSignal,
      temperature: aiConfig.temperature ?? 0.7,
    })

    let fullText = ""
    for await (const chunk of result.textStream) {
      fullText += chunk
      callbacks?.onChunk?.(chunk)
    }

    const durationMs = Date.now() - startedAt

    // ── GenAI Tracing: end generation span ──
    if (this.tracingEnabled && this.currentTrace) {
      genaiTracer.endGeneration(this.currentTrace, {
        spanId: this.currentTrace.spanId,
        output: fullText,
        durationMs,
        status: "success",
      })
      this.currentTrace = undefined
    }

    // ── PreCompact: update cumulative estimate ──
    if (this.preCompactEnabled) {
      this.cumulativeTokenEstimate += estimateTokens(fullText) + 100
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
    const experienceCtx = this.buildExperienceContext()
    let systemPrompt = base.trim() ? `${base}\n\n---\n\n${toolDesc}` : toolDesc
    if (experienceCtx) {
      systemPrompt = `${experienceCtx}\n\n---\n\n${systemPrompt}`
    }

    // ── PreCompact: compact messages if nearing token limit ──
    let activeMessages = messages
    if (this.preCompactEnabled) {
      if (this.lastCompactedState?.summary) {
        activeMessages = [
          { role: "system", content: `[PRIOR STATE — compacted from ${this.lastCompactedState.originalTurnCount} earlier turns]\n${this.lastCompactedState.summary}` },
          ...messages,
        ]
      }
      const estimated = estimateMessagesTokens(activeMessages) + estimateTokens(systemPrompt)
      this.cumulativeTokenEstimate = estimated
      if (estimated > this.preCompactThreshold) {
        log.info("PreCompact triggered (chat)", { estimatedTokens: estimated, threshold: this.preCompactThreshold })
        const { compacted, state, tokensSaved } = await compactMessages(
          activeMessages,
          { thresholdTokens: this.preCompactThreshold, maxCompactTokens: this.preCompactMaxTokens },
          this.ai,
        )
        if (state.originalTurnCount > 0) {
          activeMessages = compacted
          this.lastCompactedState = state
          this.cumulativeTokenEstimate = estimated - tokensSaved
          log.info("PreCompact completed (chat)", {
            originalTurns: state.originalTurnCount,
            tokensSaved,
          })
        }
      }
    }

    const tools = this.buildVercelTools()
    const toolKeys = Object.keys(tools)

    // Persist incoming user messages
    const lastUserMsg = activeMessages.findLast((m) => m.role === "user")
    if (lastUserMsg) {
      const content =
        typeof lastUserMsg.content === "string" ? lastUserMsg.content : JSON.stringify(lastUserMsg.content)
      this.persistMessage("user", content)
    }

    // ── GenAI Tracing: start generation span ──
    const aiConfig = this.ai.getConfig()
    const modelName = aiConfig.model ?? "unknown"
    const providerName = aiConfig.provider ?? "unknown"

    if (this.tracingEnabled && this.sessionId) {
      this.currentTrace = genaiTracer.startGeneration({
        sessionId: this.sessionId,
        agentId: this.runtime.context.agentId,
        model: modelName,
        provider: providerName,
        systemPrompt,
        userMessages: activeMessages.filter((m) => m.role === "user").map((m) =>
          typeof m.content === "string" ? m.content : JSON.stringify(m.content)
        ),
        maxTokens: aiConfig.maxTokens,
        temperature: aiConfig.temperature,
      })
    }

    const startedAt = Date.now()
    const result = await generateText({
      model: this.ai.getModel(),
      system: systemPrompt,
      messages: activeMessages,
      tools: toolKeys.length > 0 ? tools : undefined,
      stopWhen: stepCountIs(this.maxSteps),
      temperature: aiConfig.temperature ?? 0.7,
    })

    const durationMs = Date.now() - startedAt

    // ── GenAI Tracing: end generation span ──
    if (this.tracingEnabled && this.currentTrace) {
      const usage = result.usage
      genaiTracer.endGeneration(this.currentTrace, {
        spanId: this.currentTrace.spanId,
        output: result.text,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        totalTokens: usage?.totalTokens,
        durationMs,
        status: "success",
      })
      this.currentTrace = undefined
    }

    // ── PreCompact: update cumulative estimate ──
    if (this.preCompactEnabled) {
      this.cumulativeTokenEstimate += estimateTokens(result.text) + 100
    }

    // Persist assistant response
    if (result.text) {
      this.persistMessage("assistant", result.text)
    }

    return { text: result.text }
  }
}

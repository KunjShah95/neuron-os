#!/usr/bin/env bun

import type { AgentIpcMessage } from "./types"

const HEARTBEAT_MS = 5_000
const AGENT_NAME = process.env.AEGIS_AGENT_NAME ?? "unnamed"
const AGENT_ID = process.env.AEGIS_AGENT_ID ?? "unknown"
const AGENT_TYPE = process.env.AEGIS_AGENT_TYPE

const MAX_TURNS = parseInt(process.env.AEGIS_MAX_TURNS ?? "20", 10)

let running = true
let taskCount = 0

function send(msg: Omit<AgentIpcMessage, "timestamp">): void {
  const line = JSON.stringify({ ...msg, timestamp: Date.now() }) + "\n"
  process.stdout.write(line)
}

function log(level: "info" | "warn" | "error" | "debug", text: string): void {
  send({ type: "log", payload: { level, text } })
}

function replyTo(msg: AgentIpcMessage, type: string, payload?: unknown): void {
  send({ id: msg.id, type, payload })
}

// Replace local builtin tools with runtime engine + registry integration.
// The Agent worker will use the central AgentRuntime/AgentEngine when available,
// falling back to the original builtin tool set for standalone usage.
import { createAgentRuntime } from "./runtime"
import { AIProviderManager, type AIConfig, resolveApiKey } from "../ai"
import { getDefaultModel } from "../ai/models"

import { AgentEngine } from "./engine"

let engine: AgentEngine | null = null

function buildAIConfig(): AIConfig {
  // Read provider + model from env, with a reasonable default
  const provider = (process.env.AEGIS_AI_PROVIDER || process.env.AEGIS_DEFAULT_PROVIDER || "openai") as any
  const model = process.env.AEGIS_AI_MODEL || process.env.AEGIS_DEFAULT_MODEL || getDefaultModel(provider)
  return {
    provider,
    model,
    apiKey: process.env.AEGIS_AI_API_KEY || resolveApiKey(provider),
    baseUrl: process.env.AEGIS_AI_BASE_URL,
    temperature: process.env.AEGIS_TEMPERATURE ? parseFloat(process.env.AEGIS_TEMPERATURE) : undefined,
    maxTokens: process.env.AEGIS_MAX_TOKENS ? parseInt(process.env.AEGIS_MAX_TOKENS, 10) : undefined,
  }
}

async function ensureEngine(): Promise<AgentEngine> {
  if (engine) return engine
  const runtime = createAgentRuntime(AGENT_ID, AGENT_TYPE, process.cwd())
  const ai = new AIProviderManager(buildAIConfig())
  engine = new AgentEngine(runtime, ai, {
    maxSteps: parseInt(process.env.AEGIS_MAX_TURNS ?? "20", 10),
    sessionId: AGENT_ID,
    sessionName: AGENT_NAME,
    goal: `Worker agent ${AGENT_NAME}`,
  })
  return engine
}

import { episodicMemory } from "../memory/store"

// ── ReAct Loop ─────────────────────────────────────────────────────────

async function runReActLoop(goal: string, taskId: number): Promise<string> {
  log("info", `Starting ReAct loop for task #${taskId}: ${goal.slice(0, 100)}`)
  send({ id: `task-${taskId}`, type: "log", payload: { level: "info", text: `🧠 ReAct: ${goal}` } })

  // Use AgentEngine + AgentRuntime so tool permissioning and skill loading are centralized.
  const engine = await ensureEngine()

  // Load previous context to survive crashes
  const history = episodicMemory.loadContext(AGENT_ID)
  const messages = history.length > 0 ? history : []

  // Only add the goal if we're not resuming an identical goal
  const lastMsg = messages[messages.length - 1]
  if (!lastMsg || lastMsg.content !== goal) {
    messages.push({ role: "user", content: goal })
  }

  let stepCount = 0
  let finalText = ""

  while (stepCount < MAX_TURNS) {
    stepCount++
    try {
      const reply = await engine.chat(messages)
      const stepText = reply.text || ""

      if (stepText) {
        finalText = stepText
        send({ id: `task-${taskId}`, type: "result", payload: { type: "thought", content: stepText, step: stepCount } })
      }

      // If engine returned no tool invocation hints (simple text), treat as final answer
      // The AgentEngine exposes tools via the AI SDK; tool calls will be executed by the engine
      // and included in follow-up messages. For compatibility, stop when text present and
      // there's no explicit instruction to continue.
      if (stepText && !/\bAction:|\bTool:|\bcall\b/i.test(stepText)) {
        log("info", `Task #${taskId}: Agent produced final answer at step ${stepCount}`)
        break
      }

      messages.push({ role: "assistant", content: stepText })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      log("error", `ReAct error at step ${stepCount}: ${msg}`)
      finalText = finalText || `Error: ${msg}`
      break
    }
  }

  if (stepCount >= MAX_TURNS) {
    finalText += "\n\n(Reached maximum turn limit)"
  }

  log("info", `Task #${taskId} completed in ${stepCount} steps`)
  return finalText
}

// ── Command handlers ──────────────────────────────────────────────────

function handlePing(msg: AgentIpcMessage): void {
  replyTo(msg, "result", { pong: true, name: AGENT_NAME, uptime: process.uptime() })
}

function handleEcho(msg: AgentIpcMessage): void {
  replyTo(msg, "result", { echo: msg.payload })
}

async function handleRunTask(msg: AgentIpcMessage): Promise<void> {
  const task = msg.payload as { command?: string; goal?: string } | undefined
  const goal = task?.goal || task?.command
  if (!goal) {
    replyTo(msg, "error", {
      message: "No goal provided. Use { goal: '...' } or { command: '...' }",
    })
    return
  }

  taskCount++
  log("info", `Running task #${taskCount}: ${goal.slice(0, 100)}`)

  try {
    const output = await runReActLoop(goal, taskCount)
    replyTo(msg, "result", { taskId: taskCount, output, steps: taskCount })
  } catch (err: unknown) {
    replyTo(msg, "error", { message: err instanceof Error ? err.message : String(err), taskId: taskCount })
  }
}

function handleShutdown(): void {
  log("info", "Shutdown requested, exiting gracefully…")
  running = false
}

// ── Dispatch handler (worker-to-worker routing) ───────────────────────

/**
 * Handle a dispatched task from another worker.
 * Executes the goal via the ReAct loop and replies with dispatch-result.
 */
async function handleDispatch(msg: AgentIpcMessage): Promise<void> {
  const payload = msg.payload as
    | {
        goal: string
        context?: string
        sourceAgentId: string
        timeoutMs?: number
      }
    | undefined

  if (!payload?.goal) {
    send({
      id: msg.id,
      type: "dispatch-result",
      payload: {
        success: false,
        output: "",
        durationMs: 0,
        error: "No goal provided in dispatch payload",
      },
    })
    return
  }

  log("info", `Received dispatched task from ${payload.sourceAgentId}: ${payload.goal.slice(0, 100)}`)

  // Build the full goal with optional context prepended
  const fullGoal = payload.context
    ? `Context from ${payload.sourceAgentId}:\n${payload.context}\n\nTask: ${payload.goal}`
    : payload.goal

  taskCount++

  try {
    const timeout = payload.timeoutMs ?? 300_000
    const result = await Promise.race([
      runReActLoop(fullGoal, taskCount),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Dispatch task timed out")), timeout)),
    ])

    send({
      id: msg.id,
      type: "dispatch-result",
      payload: {
        success: true,
        output: result,
        durationMs: Date.now() - (msg.timestamp || Date.now()),
      },
    })
  } catch (err: unknown) {
    send({
      id: msg.id,
      type: "dispatch-result",
      payload: {
        success: false,
        output: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - (msg.timestamp || Date.now()),
        error: err instanceof Error ? err.message : String(err),
      },
    })
  }
}

// ── IPC input reader ──────────────────────────────────────────────────

let buffer = ""

function processLine(line: string): void {
  if (!line.trim()) return

  let msg: AgentIpcMessage
  try {
    msg = JSON.parse(line) as AgentIpcMessage
  } catch {
    send({ type: "error", payload: { message: `Invalid JSON: ${line}` } })
    return
  }

  switch (msg.type) {
    case "ping":
      handlePing(msg)
      break
    case "echo":
      handleEcho(msg)
      break
    case "run-task":
      handleRunTask(msg).catch((err) => replyTo(msg, "error", { message: String(err) }))
      break
    case "dispatch":
      handleDispatch(msg).catch((err) => replyTo(msg, "dispatch-result", { success: false, error: String(err) }))
      break
    case "shutdown":
      handleShutdown()
      break
    default:
      replyTo(msg, "error", { message: `Unknown command type: ${msg.type}` })
  }
}

const decoder = new TextDecoder()
const stdinStream = Bun.stdin.stream()

async function readStdin(): Promise<void> {
  const reader = stdinStream.getReader()
  try {
    while (running) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        processLine(line)
        if (!running) break
      }
    }
  } catch (err) {
    send({ type: "error", payload: { message: `stdin error: ${String(err)}` } })
  } finally {
    reader.releaseLock()
  }
}

function startHeartbeat(): void {
  const interval = setInterval(() => {
    if (!running) {
      clearInterval(interval)
      return
    }
    send({ type: "heartbeat", payload: { name: AGENT_NAME, taskCount } })
  }, HEARTBEAT_MS)
}

import { taskQueue } from "./queue"

async function pollQueue(): Promise<void> {
  log("info", `Agent worker started in queue polling mode. Waiting for tasks...`)
  while (running) {
    const task = taskQueue.pull(AGENT_ID)
    if (task) {
      log("info", `Pulled task: ${task.id} (priority: ${task.priority})`)
      try {
        const output = await runReActLoop(task.goal, ++taskCount)
        taskQueue.complete(task.id, true, output)
      } catch (err: unknown) {
        taskQueue.complete(task.id, false, String(err))
      }
    } else {
      // Sleep briefly if no task
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
}

// ── Startup ───────────────────────────────────────────────────────────

log("info", `Agent "${AGENT_NAME}" (${AGENT_ID}) type=${AGENT_TYPE ?? "default"} starting…`)
send({ type: "result", payload: { status: "ready", name: AGENT_NAME, id: AGENT_ID, type: AGENT_TYPE } })

startHeartbeat()

// Default: poll the task queue for work AND listen on stdin for direct IPC.
// This wires the queue into the default lifecycle — agents always pull
// from the queue unless started with AEGIS_STDIN_MODE=true (direct IPC).
if (process.env.AEGIS_STDIN_MODE === "true") {
  await readStdin()
} else {
  await pollQueue()
}

log("info", "Agent worker exiting")
process.exit(0)

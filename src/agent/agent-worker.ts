#!/usr/bin/env bun
/**
 * Default Aegis agent worker.
 *
 * Communicates with the parent process over JSON-line protocol on stdin/stdout.
 * Runs an event loop: reads commands from stdin, processes them, writes results.
 *
 * Protocol (parent → worker):
 *   { "id":"...", "type":"ping" | "echo" | "run-task" | "shutdown", "payload":... }
 *
 * Protocol (worker → parent):
 *   { "id":"...", "type":"result" | "log" | "heartbeat" | "error", "payload":... }
 */

import type { AgentIpcMessage } from "./types"

// ── Configuration ─────────────────────────────────────────────────────
const HEARTBEAT_MS = 5_000
const AGENT_NAME = process.env.AEGIS_AGENT_NAME ?? "unnamed"
const AGENT_ID = process.env.AEGIS_AGENT_ID ?? "unknown"

let running = true
let taskCount = 0

// ── Helpers ───────────────────────────────────────────────────────────

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

// ── Command handlers ──────────────────────────────────────────────────

function handlePing(msg: AgentIpcMessage): void {
  replyTo(msg, "result", { pong: true, name: AGENT_NAME, uptime: process.uptime() })
}

function handleEcho(msg: AgentIpcMessage): void {
  replyTo(msg, "result", { echo: msg.payload })
}

async function handleRunTask(msg: AgentIpcMessage): Promise<void> {
  const task = msg.payload as { command?: string; args?: string[] } | undefined
  if (!task?.command) {
    replyTo(msg, "error", { message: "No command provided in task payload" })
    return
  }

  taskCount++
  log("info", `Starting task #${taskCount}: ${task.command}`)
  send({ type: "log", payload: { level: "info", text: `[task] ${task.command} ${(task.args ?? []).join(" ")}` } })

  // Simulate doing work
  const delay = 500
  await new Promise((resolve) => setTimeout(resolve, delay))

  replyTo(msg, "result", {
    taskId: taskCount,
    output: `Executed: ${task.command}`,
    duration: delay,
  })
}

function handleShutdown(): void {
  log("info", "Shutdown requested, exiting gracefully…")
  running = false
}

// ── IPC input reader (line-buffered) ──────────────────────────────────

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
      handleRunTask(msg).catch((err) => {
        replyTo(msg, "error", { message: String(err) })
      })
      break
    case "shutdown":
      handleShutdown()
      break
    default:
      replyTo(msg, "error", { message: `Unknown command type: ${msg.type}` })
  }
}

// ── Stdin reader using Bun.stdin.stream() ─────────────────────────────

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
      // Keep the last incomplete chunk in the buffer
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

// ── Heartbeat ─────────────────────────────────────────────────────────

function startHeartbeat(): void {
  const interval = setInterval(() => {
    if (!running) {
      clearInterval(interval)
      return
    }
    send({ type: "heartbeat", payload: { name: AGENT_NAME, taskCount } })
  }, HEARTBEAT_MS)
}

// ── Startup ───────────────────────────────────────────────────────────

log("info", `Agent "${AGENT_NAME}" (${AGENT_ID}) starting up…`)
send({ type: "result", payload: { status: "ready", name: AGENT_NAME, id: AGENT_ID } })

startHeartbeat()
await readStdin()

log("info", "Agent worker exiting")
process.exit(0)

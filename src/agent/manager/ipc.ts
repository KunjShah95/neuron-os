import type { AgentEvent, AgentIpcMessage, AgentLogLevel } from "../types"
import { billingTracker } from "../../billing/tracker"
import { log, now, type ManagerContext } from "./state"

export function isValidIpcMessage(value: unknown): value is AgentIpcMessage {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const type = (value as { type?: unknown }).type
  if (typeof type !== "string") return false
  return type.trim().length > 0
}

export function parseIpcLine(line: string): AgentIpcMessage | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return null
  }

  if (!isValidIpcMessage(parsed)) return null

  const msg = parsed as AgentIpcMessage
  return {
    ...msg,
    type: msg.type,
    timestamp: typeof msg.timestamp === "number" ? msg.timestamp : now(),
  }
}

export async function sendIpcMessage(ctx: ManagerContext, id: string, msg: AgentIpcMessage): Promise<void> {
  const instance = ctx.agents.get(id)
  if (!instance) throw new Error(`Agent "${id}" not found`)

  if (msg.type === "dispatch") {
    ctx.cancelPrewarmTimeout(id)
  }

  const stdin = instance.process.stdin
  if (stdin === undefined || stdin === null || typeof stdin === "number") {
    throw new Error(`Agent "${id}" has no writable stdin (already exited?)`)
  }

  let traceSpanId: string | undefined
  try {
    const { traceCollector } = await import("../../observability")
    const span = traceCollector.startSpan(
      `ipc:${msg.type}`,
      "ipc",
      instance.metadata?.traceSpanId as string | undefined,
    )
    traceSpanId = span.id
  } catch {
    /* non-fatal */
  }

  try {
    const line = JSON.stringify(msg) + "\n"
    const encoded = new TextEncoder().encode(line)
    stdin.write(encoded)
    stdin.flush()
    if (traceSpanId) {
      try {
        const { traceCollector } = await import("../../observability")
        traceCollector.endSpan(traceSpanId, "ok")
      } catch {
        /* non-fatal */
      }
    }
  } catch (err) {
    if (traceSpanId) {
      try {
        const { traceCollector } = await import("../../observability")
        traceCollector.endSpan(traceSpanId, "error")
      } catch {
        /* non-fatal */
      }
    }
    instance.log.push(ctx.makeLog("error", `Failed to send IPC message: ${String(err)}`))
    throw err
  }
}

export async function routeIpcMessage(
  ctx: ManagerContext,
  fromId: string,
  toId: string,
  msg: AgentIpcMessage,
): Promise<unknown> {
  const fromAgent = ctx.agents.get(fromId)
  if (!fromAgent) throw new Error(`Source agent "${fromId}" not found`)

  const toAgent = ctx.agents.get(toId)
  if (!toAgent) throw new Error(`Target agent "${toId}" not found`)

  const routedMsg: AgentIpcMessage = {
    ...msg,
    id: msg.id || `route-${now()}`,
    payload: {
      ...(typeof msg.payload === "object" && msg.payload !== null ? (msg.payload as Record<string, unknown>) : {}),
      _routedFrom: fromId,
      _routedTo: toId,
    },
    timestamp: now(),
  }

  fromAgent.log.push(ctx.makeLog("info", `Routing IPC ${msg.type} → agent "${toAgent.def.name}" (${toId})`))
  toAgent.log.push(
    ctx.makeLog("info", `Received routed IPC ${msg.type} from agent "${fromAgent.def.name}" (${fromId})`),
  )

  return new Promise((resolve, reject) => {
    let settled = false

    const timeout = setTimeout(() => {
      finish(new Error(`Route IPC timed out (${msg.type} from ${fromId} to ${toId})`))
    }, 60_000)

    function cleanup(): void {
      clearTimeout(timeout)
      ctx.listeners.delete(handler)
    }

    function finish(err: unknown, value?: unknown): void {
      if (settled) return
      settled = true
      cleanup()
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      } else {
        resolve(value)
      }
    }

    function handler(event: AgentEvent): void {
      if (event.type === "agent:result" && event.agentId === toId && event.data) {
        const data = event.data as { id?: string }
        if (data.id === routedMsg.id) {
          finish(null, event.data)
          return
        }
      }
      if (event.type === "agent:error" && event.agentId === toId) {
        finish(event.data || new Error(`Agent "${toId}" error during route`))
      }
    }

    ctx.listeners.add(handler)

    ctx.sendIpc(toId, routedMsg).catch((err: unknown) => {
      finish(err instanceof Error ? err : new Error(String(err)))
    })
  })
}

export function readAgentStream(
  ctx: ManagerContext,
  id: string,
  stream: ReadableStream<Uint8Array>,
  label: "stdout" | "stderr",
): void {
  const instance = ctx.agents.get(id)
  if (!instance) return

  const decoder = new TextDecoder()
  let buffer = ""

  const reader = stream.getReader()
  const pump = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        for (const line of lines) {
          if (!line.trim()) continue

          if (label === "stdout") {
            const msg = parseIpcLine(line)
            if (msg) {
              void handleIpcMessage(ctx, id, msg).catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err)
                instance.log.push(ctx.makeLog("error", `IPC handler failed: ${message}`))
                ctx.emit("agent:error", id, { message })
              })
              continue
            }
          }

          instance.log.push({
            level: label === "stderr" ? "error" : "info",
            text: line,
            timestamp: now(),
            stream: label,
          })
          ctx.emit("agent:log", id, { level: label === "stderr" ? "error" : "info", text: line })
        }
      }
    } catch {
      /* Stream closed */
    }
  }

  pump()
}

export async function handleIpcMessage(ctx: ManagerContext, id: string, msg: AgentIpcMessage): Promise<void> {
  const instance = ctx.agents.get(id)
  if (!instance) return

  if (!isValidIpcMessage(msg)) {
    instance.log.push(ctx.makeLog("warn", "Ignoring IPC message without a valid type field"))
    return
  }

  instance.lastActivity = now()

  const isBusyTrigger = msg.type.includes("tool") || msg.type.includes("dispatch")
  const isIdleTrigger =
    msg.type === "result" || msg.type === "heartbeat" || msg.type === "dispatch-result"

  if (isBusyTrigger && instance.status !== "spawning" && instance.status !== "stopping" && instance.status !== "stopped" && instance.status !== "error") {
    instance.status = "busy"
  } else if (isIdleTrigger && instance.status === "busy") {
    instance.status = "idle"
  }

  switch (msg.type) {
    case "result": {
      const payload = msg.payload as { status?: string; output?: string } | undefined
      if (payload?.status === "ready") {
        instance.status = "running"
        ctx.emit("agent:ready", id)
      }
      ctx.emit("agent:result", id, { ...msg, agentId: id })
      try {
        await ctx.hooks.run("result", "post", id, instance, msg.payload)
      } catch (hookErr) {
        instance.log.push(ctx.makeLog("warn", `Result hook failed for agent "${id}": ${String(hookErr)}`))
      }
      break
    }
    case "log": {
      const p = msg.payload as { level?: AgentLogLevel; text?: string } | undefined
      if (p?.text) {
        instance.log.push(ctx.makeLog(p.level ?? "info", p.text))
        ctx.emit("agent:log", id, { level: p.level ?? "info", text: p.text })
      }
      break
    }
    case "heartbeat": {
      if (instance.status === "spawning") {
        instance.status = "running"
      }
      ctx.emit("agent:heartbeat", id)
      break
    }
    case "dispatch-result": {
      ctx.emit("agent:result", id, { ...msg, agentId: id })
      break
    }
    case "error": {
      const p2 = msg.payload as { message?: string } | undefined
      instance.log.push(ctx.makeLog("error", p2?.message ?? "Unknown error"))
      ctx.emit("agent:error", id, { message: p2?.message })
      break
    }
    case "spend-report": {
      const p3 = msg.payload as { costUsd: number; description?: string } | undefined
      if (p3?.costUsd !== undefined) {
        const guard = ctx.budgetGuards.get(id)
        if (guard) {
          guard.recordSpend(p3.costUsd)
          const status = guard.status()
          instance.metadata.budget_spent = String(guard.spent)
          if (status.recommendation === "skip_optional") {
            log.warn(`Agent "${id}" nearing budget: $${guard.spent.toFixed(4)} of $${guard.budget.toFixed(4)}`)
          } else if (status.recommendation === "abort") {
            log.warn(`Agent "${id}" over budget: $${guard.spent.toFixed(4)} of $${guard.budget.toFixed(4)} — stopping agent`)
            instance.metadata.budget_status = "abort"
            const controller = ctx.abortControllers.get(id)
            if (controller) {
              try {
                controller.abort()
              } catch {
                /* the controller may already be aborted */
              }
            }
            void ctx.kill(id).catch((err: unknown) => {
              log.warn(`Failed to stop over-budget agent "${id}": ${String(err)}`)
            })
          }
        }
        billingTracker.recordToolUsage(id, "agent-spend", p3.costUsd, id)
      }
      break
    }
  }
}

export function waitForAgentReady(ctx: ManagerContext, id: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false

    const timer = setTimeout(() => {
      fail(`Agent "${id}" did not become ready within ${timeoutMs}ms`)
    }, timeoutMs)

    const statusTimer = setTimeout(() => {
      const inst = ctx.agents.get(id)
      if (inst?.status === "running") {
        succeed()
      } else if (inst?.status === "error") {
        fail(`Agent "${id}" entered error state during startup`)
      }
    }, 100)

    function cleanup(): void {
      clearTimeout(timer)
      clearTimeout(statusTimer)
      ctx.listeners.delete(handler)
    }

    function succeed(): void {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    function fail(message: string): void {
      if (settled) return
      settled = true
      cleanup()
      reject(new Error(message))
    }

    function handler(event: AgentEvent): void {
      if (event.type === "agent:ready" && event.agentId === id) {
        succeed()
      }
      if (event.type === "agent:error" && event.agentId === id) {
        const data = event.data as { message?: string } | undefined
        fail(data?.message ?? `Agent "${id}" entered error state during startup`)
      }
    }

    ctx.listeners.add(handler)
  })
}

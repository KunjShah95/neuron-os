/**
 * warm-worker — Lightweight pre-warmed agent worker.
 *
 * Unlike the full agent-worker.ts, this script does NOT connect to an
 * LLM backend. It simply:
 *   1. Sends an IPC "ready" message to the parent
 *   2. Responds to pings with heartbeats
 *   3. Idles until killed or dispatched a real task
 *
 * This keeps the warm agent's resource usage minimal (no LLM calls,
 * no tool registrations, no memory loading) while keeping the process
 * alive so it can be quickly promoted to a full agent when needed.
 */

// ── IPC helpers ───────────────────────────────────────────────────────

function send(msg: unknown): void {
  const line = JSON.stringify(msg) + "\n"
  const encoded = new TextEncoder().encode(line)
  process.stdout.write(encoded)
}

function sendReady(agentType: string): void {
  send({
    type: "result",
    id: "warm-ready",
    payload: {
      status: "ready",
      agentType,
      prewarmed: true,
      timestamp: Date.now(),
    },
    timestamp: Date.now(),
  })
}

function sendHeartbeat(): void {
  send({
    type: "heartbeat",
    id: `warm-hb-${Date.now().toString(36)}`,
    payload: { uptime: process.uptime(), prewarmed: true },
    timestamp: Date.now(),
  })
}

function sendLog(level: string, text: string): void {
  send({
    type: "log",
    id: `warm-log-${Date.now().toString(36)}`,
    payload: { level, text },
    timestamp: Date.now(),
  })
}

// ── Main ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const agentType = process.env.AEGIS_AGENT_TYPE || "unknown"

  // Signal ready to parent
  sendReady(agentType)
  sendLog("info", `Warm agent standing by (type: ${agentType})`)

  // Heartbeat every 25s to stay well within the manager's 30s timeout
  const heartbeatInterval = setInterval(() => {
    sendHeartbeat()
  }, 25_000)

  // Read IPC messages from stdin using Bun's stream API
  let buffer = ""
  const decoder = new TextDecoder()

  const stdinStream = Bun.stdin.stream()
  for await (const chunk of stdinStream) {
    buffer += decoder.decode(chunk as Uint8Array, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const msg = JSON.parse(line)
        handleMessage(msg)
      } catch {
        // ignore malformed messages
      }
    }
  }

  // stdin closed — clean exit
  clearInterval(heartbeatInterval)
  process.exit(0)
}

function handleMessage(msg: { type: string; id?: string; payload?: Record<string, unknown>; timestamp?: number }): void {
  switch (msg.type) {
    case "ping":
      send({
        type: "result",
        id: msg.id || "pong",
        payload: { status: "ok", prewarmed: true, timestamp: Date.now() },
        timestamp: Date.now(),
      })
      break

    case "shutdown":
      sendLog("info", "Warm agent shutting down on request")
      process.exit(0)
      break

    case "dispatch":
      sendLog("info", "Warm agent received dispatch — real task incoming")
      // The parent should cancel auto-shutdown timer via cancelPrewarmTimeout()
      break

    default:
      // Unknown message type — ignore silently (warm agents are minimal)
      break
  }
}

main().catch((err) => {
  console.error(`Warm worker error: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})

import { useState, useMemo, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"
import { MetricCard, ActivityBadge } from "../components/UI"
import SoundToggle from "../components/SoundToggle"
import { api, getWsUrl, getSseUrl } from "../api/client"
import { useWebSocket } from "../hooks/useWebSocket"
import { useNotificationSounds } from "../hooks/useNotificationSounds"
import type { Agent } from "../api/types"

function formatUptime(s: number) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatTimestamp(ts: number) {
  const d = new Date(ts)
  const now = Date.now()
  const diff = now - ts
  if (diff < 5000) return "just now"
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  return d.toLocaleTimeString()
}

const connectionConfig = {
  connected: { color: "bg-emerald-400", pulse: "shadow-[0_0_12px_rgba(52,211,153,0.5)]", label: "Live" },
  connecting: { color: "bg-amber-400", pulse: "shadow-[0_0_12px_rgba(245,158,11,0.4)]", label: "Connecting" },
  reconnecting: { color: "bg-amber-400", pulse: "shadow-[0_0_12px_rgba(245,158,11,0.4)]", label: `Reconnecting` },
  disconnected: { color: "bg-rose-500", pulse: "shadow-[0_0_12px_rgba(244,63,94,0.5)]", label: "Offline" },
}

interface EventLogEntry {
  id: number
  type: "agent:spawn" | "agent:kill" | "agent:status" | "agent:event" | "connected" | "pong" | string
  summary: string
  detail: string
  timestamp: number
}

export default function Status() {
  const [health, setHealth] = useState<{ status: string; agents: number; uptime: number } | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [eventFilter, setEventFilter] = useState<string>("all")
  const [autoScroll, setAutoScroll] = useState(true)
  const feedRef = useRef<HTMLDivElement>(null)

  // Initial fetch & polling fallback
  useEffect(() => {
    api.health().then(setHealth)
    api.listAgents().then(setAgents)
    const id = setInterval(() => {
      api.health().then(setHealth)
    }, 10000)
    return () => clearInterval(id)
  }, [])

  // ── Notification sounds ───────────────────────────────────────
  const { handleEvent: handleSoundEvent } = useNotificationSounds()

  // ── WebSocket hook ─────────────────────────────────────────────
  const { status: wsStatus, events, retryCount, clearEvents } = useWebSocket({
    url: getWsUrl(),
    sseUrl: getSseUrl(),
    sseFallback: true,
    reconnect: true,
    baseDelay: 1000,
    onEvent: (event) => {
      // Play notification sound for relevant events
      handleSoundEvent(event)

      // Update agent list on relevant events
      if (event.data && typeof event.data === "object") {
        const data = event.data as Record<string, unknown>
        if (data.agents && Array.isArray(data.agents)) {
          setAgents(data.agents as Agent[])
        }
      }
    },
  })

  // ── Derive event log entries ───────────────────────────────────
  const eventLog = useMemo<EventLogEntry[]>(() => {
    let id = 0
    return events.map((ev) => {
      id++
      const data = ev.data as Record<string, unknown>
      const agentId = (data?.agentId as string) || ""
      const eventData = (data?.data as Record<string, unknown>) || {}

      let summary = ""
      let detail = ""
      let type = ev.event

      switch (ev.event) {
        case "connected":
          summary = "Connected to real-time feed"
          detail = agentId ? `Client ID: ${agentId}` : ""
          break
        case "agent:spawn":
          summary = `Agent spawned: ${(eventData.name as string) || agentId}`
          detail = `Type: ${(eventData.type as string) || "unknown"} · Status: ${(eventData.status as string) || "spawning"}`
          break
        case "agent:kill":
          summary = `Agent killed: ${agentId}`
          detail = ""
          break
        case "agent:status":
          summary = `Agent status: ${(eventData.status as string) || "unknown"}`
          detail = agentId ? `Agent: ${agentId}` : ""
          break
        default:
          summary = `Event: ${ev.event}`
          detail = agentId ? `Agent: ${agentId}` : JSON.stringify(eventData).slice(0, 60)
      }

      return { id, type, summary, detail, timestamp: ev.timestamp }
    })
  }, [events])

  // ── Filtered event log ─────────────────────────────────────────
  const filteredLog = useMemo(() => {
    if (eventFilter === "all") return eventLog
    return eventLog.filter((e) => e.type.includes(eventFilter))
  }, [eventLog, eventFilter])

  // ── Auto-scroll event feed ────────────────────────────────────
  useEffect(() => {
    if (feedRef.current && autoScroll) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [filteredLog.length, autoScroll])

  // ── Agent metrics from live data ───────────────────────────────
  const running = agents.filter((a) => a.status === "running" || a.status === "idle").length
  const agentTypes = [...new Set(agents.filter((a) => a.type).map((a) => a.type!))]

  const statusColor = connectionConfig[wsStatus as keyof typeof connectionConfig] || connectionConfig.disconnected
  const connLabel = wsStatus === "reconnecting" ? `Reconnecting (${retryCount})` : statusColor.label

  return (
    <AnimatedPage className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl text-surface-50">System Status</h1>
          <p className="text-xs text-surface-500 mt-1">Real-time system health, agents, and event feed</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Sound toggle */}
          <SoundToggle />

          {/* Connection indicator */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider ${
              wsStatus === "connected" ? "bg-emerald-500/10 text-emerald-400" :
              wsStatus === "reconnecting" ? "bg-amber-500/10 text-amber-400" :
              wsStatus === "connecting" ? "bg-amber-500/10 text-amber-400" :
              "bg-rose-500/10 text-rose-400"
            }`}
          >
            <motion.span
              className={`w-2 h-2 rounded-full ${statusColor.color}`}
              animate={wsStatus === "connected" || wsStatus === "reconnecting" ? {
                opacity: [1, 0.4, 1],
              } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            />
            {connLabel}
          </motion.div>
        </div>
      </div>

      {/* Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-4 gap-4 mb-8"
      >
        <MetricCard label="Status" value={health?.status === "ok" ? "Online" : "Checking..."} sub={wsStatus === "connected" ? "real-time" : health ? "polling" : ""} icon="◎" />
        <MetricCard label="Agents" value={agents.length} sub={running > 0 ? `${running} active` : "idle"} icon="⬡" />
        <MetricCard label="Uptime" value={health ? formatUptime(health.uptime) : "—"} sub="since last restart" icon="⏱" />
        <MetricCard label="Events" value={eventLog.length} sub={`last ${Math.min(eventLog.length, 200)} captured`} icon="✦" />
      </motion.div>

      <div className="grid grid-cols-5 gap-6">
        {/* Live Agent List (3 cols) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider">Live Agents</h2>
            <span className="text-[10px] text-surface-600">{agents.length} total</span>
          </div>

          <div className="glass rounded-2xl p-4 space-y-1 max-h-[420px] overflow-y-auto">
            {agents.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2 opacity-20">⬡</div>
                <p className="text-surface-500 text-xs">No agents running.</p>
              </div>
            ) : (
              <AnimatePresence>
                {agents.map((agent, i) => (
                  <motion.div
                    key={agent.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12, height: 0, marginBottom: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-800/40 transition-colors group"
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      agent.status === "running" ? "bg-emerald-400" :
                      agent.status === "idle" ? "bg-amber-400" :
                      agent.status === "error" ? "bg-rose-500" :
                      agent.status === "spawning" ? "bg-cyan-400" : "bg-surface-500"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-surface-50 font-medium truncate">{agent.name}</span>
                        <ActivityBadge type={agent.status === "error" ? "error" : "info"} />
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-surface-500 font-mono">PID {agent.pid}</span>
                        {agent.type && (
                          <span className="text-[10px] text-surface-600 uppercase tracking-wider">{agent.type}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`text-[11px] font-medium ${
                        agent.status === "running" ? "text-emerald-400" :
                        agent.status === "error" ? "text-rose-400" :
                        agent.status === "spawning" ? "text-cyan-400" :
                        "text-surface-500"
                      }`}>
                        {agent.status}
                      </div>
                      <div className="text-[10px] text-surface-600">{formatUptime(agent.uptime)}</div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </motion.div>

        {/* Live Event Feed (3 cols) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="col-span-3"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider">Event Feed</h2>
              <select
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="text-[10px] bg-surface-800/60 border border-surface-700/30 rounded-lg px-2 py-1 text-surface-400 focus:outline-none focus:border-amber-400/40"
              >
                <option value="all" className="bg-surface-800">All</option>
                <option value="agent:spawn" className="bg-surface-800">Spawns</option>
                <option value="agent:kill" className="bg-surface-800">Kills</option>
                <option value="agent:status" className="bg-surface-800">Status</option>
                <option value="connected" className="bg-surface-800">Connection</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`text-[10px] px-2 py-1 rounded-lg transition-colors ${
                  autoScroll ? "bg-amber-500/10 text-amber-400" : "text-surface-600 hover:text-surface-400"
                }`}
              >
                Auto-scroll
              </button>
              <button
                onClick={clearEvents}
                className="text-[10px] px-2 py-1 rounded-lg text-surface-600 hover:text-surface-400 hover:bg-surface-800/40 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="glass rounded-2xl p-4 max-h-[420px] overflow-y-auto" ref={feedRef}>
            {filteredLog.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2 opacity-20">✦</div>
                <p className="text-surface-500 text-xs">
                  {wsStatus === "connected" ? "No events yet. Events appear here in real-time." :
                   wsStatus === "connecting" || wsStatus === "reconnecting" ? "Connecting to event stream..." :
                   "Disconnected. Reconnecting..."}
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-surface-700/50" />

                <AnimatePresence mode="popLayout">
                  {filteredLog.map((entry) => (
                    <motion.div
                      key={entry.id}
                      layout
                      initial={{ opacity: 0, x: -16, height: 0 }}
                      animate={{ opacity: 1, x: 0, height: "auto" }}
                      exit={{ opacity: 0, x: 16, height: 0 }}
                      transition={{ duration: 0.25 }}
                      className="flex items-start gap-3 pl-1 py-2 group"
                    >
                      {/* Timeline dot */}
                      <span className={`w-3 h-3 rounded-full border-2 border-surface-800 mt-1 z-10 flex-shrink-0 ${
                        entry.type.includes("spawn") ? "bg-emerald-400" :
                        entry.type.includes("kill") ? "bg-rose-500" :
                        entry.type.includes("error") ? "bg-rose-500" :
                        entry.type.includes("connected") ? "bg-cyan-400" :
                        "bg-amber-400"
                      }`} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-surface-100 font-medium">{entry.summary}</span>
                          <ActivityBadge type={
                            entry.type.includes("spawn") ? "success" :
                            entry.type.includes("kill") ? "error" :
                            entry.type.includes("error") ? "error" :
                            "info"
                          } />
                        </div>
                        {entry.detail && (
                          <p className="text-xs text-surface-500 mt-0.5">{entry.detail}</p>
                        )}
                        <p className="text-[10px] text-surface-600 mt-0.5 font-mono">{formatTimestamp(entry.timestamp)}</p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Environment info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-8"
      >
        <div className="glass rounded-2xl p-6">
          <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">Connection Details</h2>
          <div className="grid grid-cols-3 gap-6 text-sm">
            {[
              { label: "WebSocket", value: getWsUrl() },
              { label: "SSE Fallback", value: getSseUrl() },
              { label: "Status", value: wsStatus },
              { label: "Retries", value: String(retryCount) },
              { label: "Events Buffered", value: String(events.length) },
              { label: "Platform", value: navigator.platform },
              { label: "Connection", value: wsStatus === "connected" ? "WebSocket" : "Polling" },
              { label: "API Endpoint", value: "/api/v1" },
              { label: "Protocol", value: window.location.protocol },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-2 border-b border-surface-700/30 last:border-0">
                <span className="text-surface-400">{row.label}</span>
                <span className="text-surface-100 font-mono text-xs truncate ml-2 text-right">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </AnimatedPage>
  )
}

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"
import { MetricCard, ActivityBadge } from "../components/UI"
import SoundToggle from "../components/SoundToggle"
import { api, getWsUrl, getSseUrl } from "../api/client"
import { useWebSocket } from "../hooks/useWebSocket"
import { useNotificationSounds } from "../hooks/useNotificationSounds"
import { useProject } from "../contexts/ProjectContext"
import type { Agent } from "../api/types"

function formatUptime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  return "Good evening"
}

function getQuote() {
  const quotes = [
    "The best way to predict the future is to invent it.",
    "Build something people want.",
    "Simplicity is the ultimate sophistication.",
    "First, solve the problem. Then, write the code.",
    "The only way to go fast is to go well.",
  ]
  return quotes[Math.floor(Math.random() * quotes.length)]
}

export default function Dashboard() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [health, setHealth] = useState<{ status: string; agents: number; uptime: number } | null>(null)
  const [sessionStats, setSessionStats] = useState<{ totalSessions: number; activeSessions: number; totalMessages: number } | null>(null)
  const { currentProject, hasProject } = useProject()

  // ── Notification sounds ───────────────────────────────────────
  const { handleEvent: handleSoundEvent } = useNotificationSounds()

  // ── WebSocket for real-time agent updates ─────────────────────
  const { status: wsStatus, events: wsEvents } = useWebSocket({
    url: getWsUrl(),
    sseUrl: getSseUrl(),
    sseFallback: true,
    reconnect: true,
    baseDelay: 1000,
    onEvent: (event) => {
      // Play notification sound for relevant events
      handleSoundEvent(event)

      // Update agent list on connected/agent events
      if (event.data && typeof event.data === "object") {
        const data = event.data as Record<string, unknown>
        if (data.agents && Array.isArray(data.agents)) {
          setAgents(data.agents as Agent[])
        }
      }
    },
  })

  // ── Fallback polling (reduced cadence — 30s instead of 5s) ──
  useEffect(() => {
    api.health().then(setHealth)
    api.listAgents().then(setAgents)
    api.getSessionStats(currentProject).then(setSessionStats).catch(() => {})
    const id = setInterval(() => {
      api.health().then(setHealth)
      api.getSessionStats(currentProject).then(setSessionStats).catch(() => {})
      // Only poll agents list if WebSocket isn't connected
      if (wsStatus !== "connected") {
        api.listAgents().then(setAgents)
      }
    }, 30000)
    return () => clearInterval(id)
  }, [wsStatus, currentProject])

  const running = agents.filter((a) => a.status === "running" || a.status === "idle").length
  const agentTypes = [...new Set(agents.filter((a) => a.type).map((a) => a.type!))]

  const isLive = wsStatus === "connected"

  return (
    <AnimatedPage className="p-8">
      {/* Briefing */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-10"
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-4xl text-surface-50 mb-2">
              {getGreeting()}
              <span className="text-amber-400">.</span>
            </h1>
            <p className="text-surface-400 text-sm max-w-xl leading-relaxed">
              {health
                ? `${running} agent${running !== 1 ? "s" : ""} running · System uptime ${formatUptime(health.uptime)}`
                : "Connecting to Aegis..."}
            </p>
            <div className="mt-4 glass inline-block rounded-xl px-4 py-2 text-xs text-surface-400 italic">
              "{getQuote()}"
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Project indicator */}
            {hasProject && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                {currentProject}
              </div>
            )}

            {/* Sound toggle */}
            <SoundToggle />

            {/* Real-time indicator */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider ${
                isLive
                  ? "bg-emerald-500/10 text-emerald-400"
                  : wsStatus === "reconnecting"
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-surface-800/60 text-surface-500"
              }`}
            >
              <motion.span
                className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-400" : "bg-surface-500"}`}
                animate={isLive ? { opacity: [1, 0.4, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              />
              {isLive ? "Live" : wsStatus === "reconnecting" ? "Reconnecting" : "Polling"}
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="grid grid-cols-4 gap-4 mb-10"
      >
        <MetricCard label="Agents" value={agents.length} sub={running > 0 ? `${running} active` : "idle"} icon="⬡" />
        <MetricCard label="Uptime" value={health ? formatUptime(health.uptime) : "—"} sub="since last restart" icon="◎" />
        <MetricCard label="Types" value={agentTypes.length || "—"} sub={agentTypes.join(", ") || "none deployed"} icon="◇" />        <MetricCard label="Sessions"
          value={sessionStats ? sessionStats.totalSessions : "…"}
          sub={sessionStats ? `${sessionStats.activeSessions} active · ${sessionStats.totalMessages} msgs` : "loading"}
          icon="◇"
        />
        <MetricCard label="Status"
          value={isLive ? "Real-time" : health?.status === "ok" ? "Online" : "—"}
          sub={isLive ? "WebSocket" : health ? "polling 30s" : "offline"}
          icon="✦"
        />
      </motion.div>

      {/* Story Feed — Activity Timeline */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <h2 className="font-display text-xl text-surface-50">Story Feed</h2>
          <span className="text-[10px] uppercase tracking-widest text-surface-600">Live</span>
          <span className="text-[10px] text-surface-600 ml-auto">{wsEvents.length} events</span>
        </div>

        <div className="glass rounded-2xl p-6">
          {agents.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4 opacity-30">⬡</div>
              <p className="text-surface-500 text-sm">No agents are running yet.</p>
              <p className="text-surface-600 text-xs mt-1">
                Navigate to <span className="text-amber-400">Agents</span> to spawn one.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {agents.map((agent, i) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.4 + i * 0.08 }}
                  className="flex items-start gap-4 py-3 border-b border-surface-700/30 last:border-0"
                >
                  <div className="mt-1.5">
                    <span className={`w-2 h-2 rounded-full block ${
                      agent.status === "running" ? "bg-emerald-400" :
                      agent.status === "idle" ? "bg-amber-400" :
                      agent.status === "error" ? "bg-rose-500" : "bg-surface-500"
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-body font-medium text-surface-50 text-sm">{agent.name}</span>
                      <ActivityBadge type={agent.status === "error" ? "error" : agent.status === "idle" ? "warn" : "success"} />
                      {agent.type && (
                        <span className="text-[10px] text-surface-500 uppercase tracking-wider">{agent.type}</span>
                      )}
                    </div>
                    <p className="text-xs text-surface-500 mt-0.5">
                      PID {agent.pid} · Up {formatUptime(agent.uptime)}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-surface-600 uppercase tracking-wider">{agent.status}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatedPage>
  )
}

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useNavigate } from "react-router-dom"
import AnimatedPage from "../components/AnimatedPage"
import StatusDot from "../components/UI"
import { api } from "../api/client"
import type { Agent } from "../api/types"

const statusColors: Record<string, string> = {
  running: "border-emerald-400/30 bg-emerald-400/5",
  idle: "border-amber-400/30 bg-amber-400/5",
  error: "border-rose-500/30 bg-rose-500/5",
  stopped: "border-surface-600 bg-surface-800/40",
  spawning: "border-cyan-400/30 bg-cyan-400/5",
}

export default function Agents() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [spawnName, setSpawnName] = useState("")
  const [spawnType, setSpawnType] = useState("build")
  const [spawning, setSpawning] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.listAgents().then(setAgents)
    const id = setInterval(() => api.listAgents().then(setAgents), 3000)
    return () => clearInterval(id)
  }, [])

  async function handleSpawn() {
    if (!spawnName.trim() || spawning) return
    setSpawning(true)
    try {
      await api.spawnAgent(spawnName, spawnType)
      setSpawnName("")
      const updated = await api.listAgents()
      setAgents(updated)
    } catch (e) {
      console.error(e)
    }
    setSpawning(false)
  }

  async function handleKill(id: string) {
    await api.killAgent(id)
    setAgents((prev) => prev.filter((a) => a.id !== id))
  }

  function formatUptime(s: number) {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <AnimatedPage className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl text-surface-50">Agents</h1>
          <p className="text-xs text-surface-500 mt-1">{agents.length} total · {agents.filter(a => a.status === "running").length} running</p>
        </div>
      </div>

      {/* Spawn */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-5 mb-8"
      >
        <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-3">Spawn New Agent</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={spawnName}
            onChange={(e) => setSpawnName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSpawn()}
            placeholder="Agent name..."
            className="flex-1 bg-surface-800/60 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors"
          />
          <select
            value={spawnType}
            onChange={(e) => setSpawnType(e.target.value)}
            className="bg-surface-800/60 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-surface-100 focus:outline-none focus:border-amber-400/40"
          >
            {["build", "plan", "read", "write", "test", "validate", "review", "debug", "document", "refactor", "deploy", "monitor", "explore"].map((t) => (
              <option key={t} value={t} className="bg-surface-800">{t}</option>
            ))}
          </select>
          <button
            onClick={handleSpawn}
            disabled={!spawnName.trim() || spawning}
            className="px-5 py-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-sm font-medium hover:bg-amber-500/20 transition-all disabled:opacity-30"
          >
            {spawning ? "Spawning..." : "Spawn"}
          </button>
        </div>
      </motion.div>

      {/* Agent Cards */}
      <div className="grid grid-cols-3 gap-4">
        <AnimatePresence>
          {agents.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="col-span-3 text-center py-16"
            >
              <div className="text-5xl mb-4 opacity-20">⬡</div>
              <p className="text-surface-500 text-sm">No agents running. Spawn one above.</p>
            </motion.div>
          )}
          {agents.map((agent, i) => (
            <motion.div
              key={agent.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: i * 0.05 }}
              className={`glass rounded-2xl p-5 border ${statusColors[agent.status] || "border-surface-700"} cursor-pointer hover:border-amber-400/30 transition-colors`}
              onClick={() => navigate(`/agents/${agent.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <StatusDot status={agent.status} />
                  <div>
                    <h3 className="font-medium text-surface-50 text-sm">{agent.name}</h3>
                    {agent.type && <span className="text-[10px] text-surface-500 uppercase tracking-wider">{agent.type}</span>}
                  </div>
                </div>
                <button
                  onClick={() => handleKill(agent.id)}
                  className="text-[10px] text-surface-600 hover:text-rose-400 transition-colors uppercase tracking-wider"
                >
                  Kill
                </button>
              </div>

              <div className="space-y-1.5 text-xs text-surface-500">
                <div className="flex justify-between">
                  <span>PID</span>
                  <span className="text-surface-400 font-mono">{agent.pid}</span>
                </div>
                <div className="flex justify-between">
                  <span>Status</span>
                  <span className={agent.status === "running" ? "text-emerald-400" : agent.status === "error" ? "text-rose-400" : "text-surface-400"}>
                    {agent.status}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Uptime</span>
                  <span className="text-surface-400">{formatUptime(agent.uptime)}</span>
                </div>
              </div>

              {agent.status === "running" && (
                <motion.div
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: agent.uptime > 0 ? 0 : 3, repeat: Infinity }}
                  className="mt-3 h-0.5 bg-gradient-to-r from-emerald-400/0 via-emerald-400/40 to-emerald-400/0 rounded-full"
                />
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </AnimatedPage>
  )
}

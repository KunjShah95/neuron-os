import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"
import { api } from "../api/client"

interface EnvInfo {
  key: string
  value: string
  source: string
}

export default function Config() {
  const [health, setHealth] = useState<{ status: string; version: string; agents: number; uptime: number } | null>(null)
  const [envVars] = useState<EnvInfo[]>([
    { key: "AEGIS_DEFAULT_PROVIDER", value: import.meta.env.VITE_AEGIS_DEFAULT_PROVIDER || "not set (use VITE_AEGIS_DEFAULT_PROVIDER)", source: "env" },
    { key: "AEGIS_LOG_LEVEL", value: import.meta.env.VITE_AEGIS_LOG_LEVEL || "not set (use VITE_AEGIS_LOG_LEVEL)", source: "env" },
    { key: "WS Connection", value: `${window.location.host}/api/v1/ws`, source: "runtime" },
    { key: "API Endpoint", value: "/api/v1", source: "runtime" },
  ])

  useEffect(() => {
    api.health().then(setHealth).catch(() => {})
  }, [])

  return (
    <AnimatedPage className="p-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-surface-50">Configuration</h1>
        <p className="text-xs text-surface-500 mt-1">System configuration and connection details</p>
      </div>

      {/* Server Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-6 mb-6"
      >
        <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">Server</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Version", value: health?.version || "—" },
            { label: "Status", value: health?.status || "offline" },
            { label: "Uptime", value: health ? `${Math.floor(health.uptime)}s` : "—" },
            { label: "Agents", value: String(health?.agents ?? "—") },
            { label: "Connection", value: health ? "connected" : "waiting" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2 border-b border-surface-700/30 last:border-0">
              <span className="text-xs text-surface-400">{row.label}</span>
              <span className="text-xs text-surface-100 font-mono">{row.value}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Environment Details */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl overflow-hidden"
      >
        <div className="px-6 py-3 border-b border-surface-700/30">
          <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider">Environment</h2>
        </div>
        <div className="grid grid-cols-[1fr_2fr_auto] gap-4 px-6 py-2 text-[10px] text-surface-500 uppercase tracking-wider border-b border-surface-700/20">
          <span>Key</span>
          <span>Value</span>
          <span>Source</span>
        </div>
        {envVars.map((c) => (
          <div
            key={c.key}
            className="grid grid-cols-[1fr_2fr_auto] gap-4 px-6 py-3 text-sm border-b border-surface-700/20 last:border-0 hover:bg-surface-800/30 transition-colors"
          >
            <span className="text-surface-100 font-mono text-xs">{c.key}</span>
            <span className="font-mono text-xs text-surface-400">{c.value}</span>
            <span className="text-[10px] text-surface-500 uppercase tracking-wider self-center">{c.source}</span>
          </div>
        ))}
      </motion.div>

      <p className="text-[10px] text-surface-600 mt-4">
        Manage credentials via CLI: <span className="font-mono text-surface-500">aegis config set &lt;key&gt; &lt;value&gt;</span>
        {" · "}
        <span className="font-mono text-surface-500">aegis config list</span>
      </p>
    </AnimatedPage>
  )
}

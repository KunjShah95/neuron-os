import AnimatedPage from "../components/AnimatedPage"
import { MetricCard } from "../components/UI"
import { api } from "../api/client"
import { useState, useEffect } from "react"

function formatUptime(s: number) {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function Status() {
  const [health, setHealth] = useState<{ status: string; agents: number; uptime: number } | null>(null)

  useEffect(() => {
    api.health().then(setHealth)
    const id = setInterval(() => api.health().then(setHealth), 5000)
    return () => clearInterval(id)
  }, [])

  return (
    <AnimatedPage className="p-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-surface-50">System Status</h1>
        <p className="text-xs text-surface-500 mt-1">Real-time system health and metrics</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard label="Status" value={health?.status === "ok" ? "Online" : "Checking..."} sub={health ? "all nominal" : ""} icon="◎" />
        <MetricCard label="Agents" value={health?.agents ?? "—"} sub="total spawned" icon="⬡" />
        <MetricCard label="Uptime" value={health ? formatUptime(health.uptime) : "—"} sub="since last restart" icon="⏱" />
        <MetricCard label="Runtime" value="Bun" sub={process.versions?.bun ? `v${process.versions.bun}` : "v1.3.x"} icon="⚡" />
      </div>

      <div className="glass rounded-2xl p-6">
        <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">Environment</h2>
        <div className="space-y-3 text-sm">
          {[
            { label: "Platform", value: navigator.platform },
            { label: "User Agent", value: navigator.userAgent },
            { label: "Language", value: navigator.language },
            { label: "API Endpoint", value: "/api/v1" },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between py-2 border-b border-surface-700/30 last:border-0">
              <span className="text-surface-400">{row.label}</span>
              <span className="text-surface-100 font-mono text-xs max-w-[60%] truncate text-right">{row.value}</span>
            </div>
          ))}
        </div>
      </div>
    </AnimatedPage>
  )
}

import { motion } from "framer-motion"
import type { SLOMetrics } from "../api/client"

interface SLOSparklinesProps {
  data: SLOMetrics | undefined
  isLoading?: boolean
}

function MiniSparkline({ values, color = "#34D399" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null
  const max = Math.max(...values)
  const min = Math.min(...values)
  const range = max - min || 1
  const width = 80
  const height = 24
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width
    const y = height - ((v - min) / range) * height
    return `${x},${y}`
  }).join(" ")

  return (
    <svg width={width} height={height} className="flex-shrink-0">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}

function SLOCard({
  label,
  value,
  sub,
  sparkline,
  color,
  icon,
  delay = 0,
}: {
  label: string
  value: string | number
  sub?: string
  sparkline?: number[]
  color?: string
  icon: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="liquid-glass rounded-xl p-4 card-hover"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-ink-300 uppercase tracking-[0.18em] font-mono">{label}</span>
        <span className="text-base text-white/55">{icon}</span>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-display text-white num-display">{value}</div>
          {sub && <div className="text-xs text-ink-400 mt-1.5">{sub}</div>}
        </div>
        {sparkline && <MiniSparkline values={sparkline} color={color} />}
      </div>
    </motion.div>
  )
}

export default function SLOSparklines({ data, isLoading }: SLOSparklinesProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="liquid-glass rounded-xl p-4 h-[100px] animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-4 gap-4">
      <SLOCard
        label="Uptime"
        value={data ? `${data.uptimePercent.toFixed(2)}%` : "—"}
        sub={data ? `${data.totalRequests.toLocaleString()} requests` : ""}
        sparkline={data?.uptimeHistory}
        color="#34D399"
        icon="◎"
        delay={0}
      />
      <SLOCard
        label="p95 Latency"
        value={data ? `${data.p95LatencyMs.toFixed(0)}ms` : "—"}
        sub="across all endpoints"
        color="#22D3EE"
        icon="⏱"
        delay={0.05}
      />
      <SLOCard
        label="Error Rate"
        value={data ? `${(data.errorRate * 100).toFixed(2)}%` : "—"}
        sub={data ? `burn rate: ${data.burnRate.toFixed(2)}x` : ""}
        color="#F43F5E"
        icon="△"
        delay={0.1}
      />
      <SLOCard
        label="Agent Success"
        value={data ? `${(data.agentSuccessRate * 100).toFixed(1)}%` : "—"}
        sub="task completion"
        color="#F59E0B"
        icon="⬡"
        delay={0.15}
      />
    </div>
  )
}

import { motion } from "framer-motion"
import type { ReactNode } from "react"

const statusColors: Record<string, string> = {
  running: "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]",
  idle: "bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]",
  error: "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]",
  stopped: "bg-white/30",
  spawning: "bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.4)]",
}

export default function StatusDot({ status, pulse = true }: { status: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex items-center justify-center w-2.5 h-2.5">
      <span className={`absolute inset-0 rounded-full ${statusColors[status] || "bg-white/30"}`} />
      {pulse && (status === "running" || status === "spawning") && (
        <motion.span
          className={`absolute inset-0 rounded-full ${statusColors[status] || "bg-white/30"}`}
          animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      )}
    </span>
  )
}

export function ActivityBadge({ type, children }: { type: string; children?: ReactNode }) {
  const colors: Record<string, string> = {
    info: "bg-white/[0.04] text-white/70 border-white/[0.08]",
    success: "bg-emerald-400/[0.06] text-emerald-400 border-emerald-400/20",
    warn: "bg-amber-400/[0.06] text-amber-400 border-amber-400/20",
    error: "bg-rose-500/[0.06] text-rose-400 border-rose-400/20",
  }
  return (
    <span
      className={`text-[9px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full border font-mono ${
        colors[type] || colors.info
      }`}
    >
      {children ?? type}
    </span>
  )
}

export function MetricCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string | number
  sub?: ReactNode
  icon: string
}) {
  return (
    <div className="liquid-glass rounded-xl p-4 card-hover">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-ink-300 uppercase tracking-[0.18em] font-mono">
          {label}
        </span>
        <span className="text-base text-white/55">{icon}</span>
      </div>
      <motion.div
        key={String(value)}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-display text-white num-display"
      >
        {value}
      </motion.div>
      {sub && <div className="text-xs text-ink-400 mt-1.5">{sub}</div>}
    </div>
  )
}

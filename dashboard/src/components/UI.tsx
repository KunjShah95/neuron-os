import { motion } from "framer-motion"

const statusColors: Record<string, string> = {
  running: "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.5)]",
  idle: "bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.4)]",
  error: "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.5)]",
  stopped: "bg-surface-500",
  spawning: "bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.4)]",
}

export default function StatusDot({ status, pulse = true }: { status: string; pulse?: boolean }) {
  return (
    <span className="relative inline-flex items-center justify-center w-2.5 h-2.5">
      <span className={`absolute inset-0 rounded-full ${statusColors[status] || "bg-surface-500"}`} />
      {pulse && (status === "running" || status === "spawning") && (
        <motion.span
          className={`absolute inset-0 rounded-full ${statusColors[status] || "bg-surface-500"}`}
          animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      )}
    </span>
  )
}

export function ActivityBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    info: "bg-cyan-400/10 text-cyan-400 border-cyan-400/20",
    success: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
    warn: "bg-amber-400/10 text-amber-400 border-amber-400/20",
    error: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  }
  return (
    <span className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${colors[type] || colors.info}`}>
      {type}
    </span>
  )
}

export function MetricCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: string }) {
  return (
    <div className="glass rounded-xl p-4 card-hover">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-surface-400 uppercase tracking-wider">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <motion.div
        key={String(value)}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-2xl font-display text-surface-50"
      >
        {value}
      </motion.div>
      {sub && <div className="text-xs text-surface-500 mt-1">{sub}</div>}
    </div>
  )
}

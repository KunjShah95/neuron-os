import { motion } from "framer-motion"
import type { FailureCluster as FailureClusterType } from "../api/client"

interface FailureClusterProps {
  clusters: FailureClusterType[]
  isLoading?: boolean
}

function SeverityBadge({ score }: { score: number }) {
  if (score >= 8) return <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-400/20 font-mono">critical</span>
  if (score >= 5) return <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20 font-mono">high</span>
  if (score >= 3) return <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-400 border border-cyan-400/20 font-mono">medium</span>
  return <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-surface-500/10 text-surface-400 border border-surface-600 font-mono">low</span>
}

export default function FailureClusterView({ clusters, isLoading }: FailureClusterProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass rounded-2xl p-5 h-[120px] animate-pulse" />
        ))}
      </div>
    )
  }

  const maxCount = Math.max(...clusters.map((c) => c.count), 1)

  return (
    <div className="space-y-3">
      {clusters.map((cluster, i) => (
        <motion.div
          key={cluster.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="glass rounded-2xl p-5"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-sm font-medium text-surface-100 truncate">{cluster.type}</h3>
                <SeverityBadge score={cluster.severity} />
              </div>
              {cluster.sampleMessages.length > 0 && (
                <p className="text-xs text-surface-500 font-mono truncate">{cluster.sampleMessages[0]}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <div className="text-lg font-display text-surface-50 num-display">{cluster.count}</div>
              <div className="text-[10px] text-surface-600">occurrences</div>
            </div>
          </div>

          {/* Frequency bar */}
          <div className="h-1.5 bg-surface-800/60 rounded-full overflow-hidden mb-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(cluster.count / maxCount) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.1 }}
              className={`h-full rounded-full ${
                cluster.severity >= 8 ? "bg-rose-500" :
                cluster.severity >= 5 ? "bg-amber-400" :
                cluster.severity >= 3 ? "bg-cyan-400" : "bg-surface-500"
              }`}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] text-surface-600">
            <span>{cluster.frequency.toFixed(1)}/hr</span>
            <span>{new Date(cluster.lastOccurrence).toLocaleString()}</span>
          </div>
        </motion.div>
      ))}

      {clusters.length === 0 && (
        <div className="text-center py-12">
          <div className="text-3xl mb-2 opacity-20">△</div>
          <p className="text-surface-500 text-xs">No failure clusters found.</p>
        </div>
      )}
    </div>
  )
}

import { motion } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"
import FailureClusterView from "../components/FailureCluster"
import { useQuery } from "@tanstack/react-query"
import { api, type FailureCluster } from "../api/client"

export default function Failures() {
  const { data, isLoading } = useQuery<{ clusters: FailureCluster[] }>({
    queryKey: ["failures"],
    queryFn: () => api.getFailures(),
    refetchInterval: 30000,
    staleTime: 15000,
  })

  const clusters = data?.clusters || []
  const totalFailures = clusters.reduce((sum: number, c: FailureCluster) => sum + c.count, 0)
  const criticalCount = clusters.filter((c: FailureCluster) => c.severity >= 8).length

  return (
    <AnimatedPage className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl text-surface-50">Failure Clusters</h1>
          <p className="text-xs text-surface-500 mt-1">
            {clusters.length} clusters · {totalFailures.toLocaleString()} total failures
            {criticalCount > 0 && <span className="text-rose-400 ml-2">· {criticalCount} critical</span>}
          </p>
        </div>
      </div>

      {/* Summary metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-4 mb-8"
      >
        <div className="liquid-glass rounded-xl p-4">
          <div className="text-[10px] text-ink-300 uppercase tracking-[0.18em] font-mono mb-2">Total Clusters</div>
          <div className="text-2xl font-display text-white num-display">{clusters.length}</div>
        </div>
        <div className="liquid-glass rounded-xl p-4">
          <div className="text-[10px] text-ink-300 uppercase tracking-[0.18em] font-mono mb-2">Total Failures</div>
          <div className="text-2xl font-display text-white num-display">{totalFailures.toLocaleString()}</div>
        </div>
        <div className="liquid-glass rounded-xl p-4">
          <div className="text-[10px] text-ink-300 uppercase tracking-[0.18em] font-mono mb-2">Critical</div>
          <div className={`text-2xl font-display num-display ${criticalCount > 0 ? "text-rose-400" : "text-emerald-400"}`}>
            {criticalCount}
          </div>
        </div>
      </motion.div>

      {/* Failure clusters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <FailureClusterView clusters={clusters} isLoading={isLoading} />
      </motion.div>
    </AnimatedPage>
  )
}

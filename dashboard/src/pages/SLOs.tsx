import { motion } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"
import SLOSparklines from "../components/SLOSparklines"
import { useQuery } from "@tanstack/react-query"
import { api, type SLOMetrics } from "../api/client"

export default function SLOs() {
  const { data, isLoading } = useQuery<SLOMetrics>({
    queryKey: ["slo"],
    queryFn: () => api.getSLO(),
    refetchInterval: 15000,
    staleTime: 10000,
  })

  return (
    <AnimatedPage className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl text-surface-50">SLO Monitoring</h1>
          <p className="text-xs text-surface-500 mt-1">Service level objectives, latency, and error rates</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-surface-500">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Live
        </div>
      </div>

      {/* Sparkline cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8"
      >
        <SLOSparklines data={data} isLoading={isLoading} />
      </motion.div>

      {/* p95 latency per endpoint */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-8"
      >
        <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">p95 Latency by Endpoint</h3>
        <div className="glass rounded-2xl p-5">
          {data?.p95LatencyByEndpoint && data.p95LatencyByEndpoint.length > 0 ? (
            <div className="space-y-3">
              {data.p95LatencyByEndpoint
                .sort((a: { p95Ms: number }, b: { p95Ms: number }) => b.p95Ms - a.p95Ms)
                .map((ep: { endpoint: string; p95Ms: number; count: number }) => {
                  const maxLatency = Math.max(...data.p95LatencyByEndpoint.map((e: { p95Ms: number }) => e.p95Ms))
                  return (
                    <div key={ep.endpoint} className="flex items-center justify-between">
                      <div className="flex-1 min-w-0 mr-4">
                        <span className="text-sm text-surface-300 font-mono truncate block">{ep.endpoint}</span>
                        <span className="text-[10px] text-surface-600">{ep.count.toLocaleString()} calls</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-32 h-1.5 bg-surface-800/60 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              ep.p95Ms > 1000 ? "bg-rose-500" : ep.p95Ms > 500 ? "bg-amber-400" : "bg-emerald-400"
                            }`}
                            style={{ width: `${(ep.p95Ms / maxLatency) * 100}%` }}
                          />
                        </div>
                        <span className={`text-xs font-mono w-16 text-right ${
                          ep.p95Ms > 1000 ? "text-rose-400" : ep.p95Ms > 500 ? "text-amber-400" : "text-emerald-400"
                        }`}>
                          {ep.p95Ms.toFixed(0)}ms
                        </span>
                      </div>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="text-center py-8 text-surface-500 text-xs">
              {isLoading ? "Loading..." : "No endpoint data"}
            </div>
          )}
        </div>
      </motion.div>

      {/* Burn rate detail */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">Error Budget</h3>
        <div className="glass rounded-2xl p-5">
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Burn Rate</div>
              <div className={`text-2xl font-display num-display ${
                (data?.burnRate ?? 0) > 2 ? "text-rose-400" : (data?.burnRate ?? 0) > 1 ? "text-amber-400" : "text-emerald-400"
              }`}>
                {data ? `${data.burnRate.toFixed(2)}x` : "—"}
              </div>
              <div className="text-[10px] text-surface-600 mt-1">target: &lt;1x</div>
            </div>
            <div>
              <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Total Requests</div>
              <div className="text-2xl font-display text-surface-50 num-display">
                {data?.totalRequests.toLocaleString() || "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-surface-500 uppercase tracking-wider mb-1">Total Errors</div>
              <div className="text-2xl font-display text-surface-50 num-display">
                {data?.totalErrors.toLocaleString() || "—"}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatedPage>
  )
}

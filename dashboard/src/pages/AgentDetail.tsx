import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useParams, useNavigate } from "react-router-dom"
import AnimatedPage from "../components/AnimatedPage"
import { MetricCard, ActivityBadge } from "../components/UI"
import AgentTimeline from "../components/AgentTimeline"
import { api, type AgentDetail as AgentDetailType } from "../api/client"

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [agent, setAgent] = useState<AgentDetailType | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.getAgentDetail(id)
      .then(setAgent)
      .catch(() => setAgent(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <AnimatedPage className="p-8">
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-surface-800/40 rounded-xl animate-pulse" />
          ))}
        </div>
      </AnimatedPage>
    )
  }

  if (!agent) {
    return (
      <AnimatedPage className="p-8">
        <div className="text-center py-16">
          <div className="text-5xl mb-4 opacity-20">⬡</div>
          <p className="text-surface-500 text-sm mb-4">Agent not found.</p>
          <button
            onClick={() => navigate("/agents")}
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            ← Back to Agents
          </button>
        </div>
      </AnimatedPage>
    )
  }

  return (
    <AnimatedPage className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => navigate("/agents")}
              className="text-xs text-surface-500 hover:text-surface-300 transition-colors"
            >
              ← Agents
            </button>
            <h1 className="font-display text-2xl text-surface-50">{agent.name}</h1>
            <ActivityBadge type={agent.status === "running" ? "success" : agent.status === "error" ? "error" : "info"}>
              {agent.status}
            </ActivityBadge>
          </div>
          <p className="text-xs text-surface-500 mt-1">ID: {agent.id}</p>
        </div>
      </div>

      {/* Metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-4 gap-4 mb-8"
      >
        <MetricCard
          label="Type"
          value={agent.type || "—"}
          sub="agent type"
          icon="⬡"
        />
        <MetricCard
          label="Duration"
          value={`${(agent.duration / 1000).toFixed(1)}s`}
          sub="total runtime"
          icon="⏱"
        />
        <MetricCard
          label="Cost"
          value={`$${agent.costUsd.toFixed(4)}`}
          sub="accumulated"
          icon="$"
        />
        <MetricCard
          label="Tool Calls"
          value={agent.toolCalls.length}
          sub="executed"
          icon="✦"
        />
      </motion.div>

      <div className="grid grid-cols-3 gap-6">
        {/* Tool call timeline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="col-span-2"
        >
          <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">Tool Calls</h3>
          <div className="glass rounded-2xl p-5">
            {agent.toolCalls.length > 0 ? (
              <div className="space-y-2">
                {agent.toolCalls.map((tc, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-surface-700/20 last:border-0">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      tc.status === "success" ? "bg-emerald-400" :
                      tc.status === "error" ? "bg-rose-500" : "bg-amber-400"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-surface-100 font-medium">{tc.name}</span>
                        <ActivityBadge type={tc.status === "success" ? "success" : tc.status === "error" ? "error" : "info"}>
                          {tc.status}
                        </ActivityBadge>
                      </div>
                      <p className="text-[10px] text-surface-600 font-mono mt-0.5">
                        {new Date(tc.startTime).toLocaleTimeString()} → {new Date(tc.endTime).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-surface-500 text-xs">No tool calls recorded.</div>
            )}
          </div>

          {/* Trace spans */}
          <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4 mt-8">Trace Spans</h3>
          <div className="glass rounded-2xl p-5">
            {agent.traceSpans.length > 0 ? (
              <div className="space-y-2">
                {agent.traceSpans.map((span) => (
                  <div key={span.id} className="flex items-center justify-between py-2 border-b border-surface-700/20 last:border-0">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-surface-100">{span.name}</span>
                      <p className="text-[10px] text-surface-600 font-mono mt-0.5">
                        {span.duration.toFixed(1)}ms
                      </p>
                    </div>
                    <div className="text-[10px] text-surface-500 font-mono">
                      {new Date(span.startTime).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-surface-500 text-xs">No trace spans.</div>
            )}
          </div>
        </motion.div>

        {/* Sidebar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-6"
        >
          {/* Memory contributions */}
          <div>
            <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">Memory Contributions</h3>
            <div className="glass rounded-2xl p-5">
              {agent.memoryContributions.length > 0 ? (
                <div className="space-y-3">
                  {agent.memoryContributions.map((mem, i) => (
                    <div key={i} className="border-b border-surface-700/20 pb-2 last:border-0 last:pb-0">
                      <p className="text-xs text-surface-300 line-clamp-3">{mem.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-surface-600">{mem.category}</span>
                        <span className="text-[10px] text-surface-600">·</span>
                        <span className="text-[10px] text-surface-600">{new Date(mem.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-surface-500 text-xs">No memory contributions.</div>
              )}
            </div>
          </div>

          {/* Live event stream */}
          <AgentTimeline agentId={agent.id} />
        </motion.div>
      </div>
    </AnimatedPage>
  )
}

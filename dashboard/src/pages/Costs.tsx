import { useState } from "react"
import { motion } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"
import { MetricCard } from "../components/UI"
import CostChart from "../components/CostChart"
import { useCosts } from "../hooks/useCosts"

export default function Costs() {
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({})
  const { data, isLoading } = useCosts(dateRange)

  const budgetPercent = data ? (data.totalCostUsd / data.budgetUsd) * 100 : 0
  const budgetColor = budgetPercent > 90 ? "text-rose-400" : budgetPercent > 70 ? "text-amber-400" : "text-emerald-400"

  return (
    <AnimatedPage className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl text-surface-50">Cost Analytics</h1>
          <p className="text-xs text-surface-500 mt-1">Track spend across models, agents, and budgets</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={dateRange.from || ""}
            onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value || undefined }))}
            className="bg-surface-800/60 border border-surface-700/50 rounded-xl px-3 py-2 text-xs text-surface-300 focus:outline-none focus:border-amber-400/40"
          />
          <input
            type="date"
            value={dateRange.to || ""}
            onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value || undefined }))}
            className="bg-surface-800/60 border border-surface-700/50 rounded-xl px-3 py-2 text-xs text-surface-300 focus:outline-none focus:border-amber-400/40"
          />
        </div>
      </div>

      {/* Metric cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-4 gap-4 mb-8"
      >
        <MetricCard
          label="Total Spend"
          value={`$${data?.totalCostUsd.toFixed(4) || "0.00"}`}
          sub="this period"
          icon="$"
        />
        <MetricCard
          label="Budget"
          value={`$${data?.budgetUsd.toFixed(2) || "0.00"}`}
          sub={
            <span className={budgetColor}>
              {budgetPercent.toFixed(1)}% used
            </span>
          }
          icon="◎"
        />
        <MetricCard
          label="Models Used"
          value={data ? Object.keys(data.byModel).length : 0}
          sub="unique models"
          icon="⬡"
        />
        <MetricCard
          label="Agent Types"
          value={data ? Object.keys(data.byAgentType).length : 0}
          sub="unique types"
          icon="✦"
        />
      </motion.div>

      {/* Cost chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-8"
      >
        <CostChart data={data} isLoading={isLoading} />
      </motion.div>

      <div className="grid grid-cols-2 gap-6">
        {/* Per-model breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">By Model</h3>
          <div className="glass rounded-2xl p-5 space-y-3">
            {data?.byModel && Object.entries(data.byModel).length > 0 ? (
              Object.entries(data.byModel)
                .sort(([, a]: [string, number], [, b]: [string, number]) => b - a)
                .map(([model, cost]: [string, number]) => (
                  <div key={model} className="flex items-center justify-between">
                    <span className="text-sm text-surface-300 font-mono truncate mr-3">{model}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 bg-surface-800/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${(cost / Math.max(...Object.values(data.byModel))) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-surface-100 font-mono w-20 text-right">${cost.toFixed(4)}</span>
                    </div>
                  </div>
                ))
            ) : (
              <div className="text-center py-6 text-surface-500 text-xs">No data</div>
            )}
          </div>
        </motion.div>

        {/* Per-agent breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">By Agent Type</h3>
          <div className="glass rounded-2xl p-5 space-y-3">
            {data?.byAgentType && Object.entries(data.byAgentType).length > 0 ? (
              Object.entries(data.byAgentType)
                .sort(([, a]: [string, number], [, b]: [string, number]) => b - a)
                .map(([agentType, cost]: [string, number]) => (
                  <div key={agentType} className="flex items-center justify-between">
                    <span className="text-sm text-surface-300 truncate mr-3">{agentType}</span>
                    <div className="flex items-center gap-3">
                      <div className="w-24 h-1.5 bg-surface-800/60 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-400 rounded-full"
                          style={{ width: `${(cost / Math.max(...Object.values(data.byAgentType))) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-surface-100 font-mono w-20 text-right">${cost.toFixed(4)}</span>
                    </div>
                  </div>
                ))
            ) : (
              <div className="text-center py-6 text-surface-500 text-xs">No data</div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Budget vs actual */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mt-8"
      >
        <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">Budget vs Actual</h3>
        <div className="glass rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-surface-300">Budget: ${data?.budgetUsd.toFixed(2) || "0.00"}</span>
            <span className="text-sm text-surface-300">Spent: ${data?.totalCostUsd.toFixed(4) || "0.00"}</span>
          </div>
          <div className="h-3 bg-surface-800/60 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(budgetPercent, 100)}%` }}
              transition={{ duration: 0.8 }}
              className={`h-full rounded-full ${
                budgetPercent > 90 ? "bg-rose-500" : budgetPercent > 70 ? "bg-amber-400" : "bg-emerald-400"
              }`}
            />
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-surface-600">
            <span>$0</span>
            <span>${data?.budgetUsd.toFixed(2) || "0.00"}</span>
          </div>
        </div>
      </motion.div>
    </AnimatedPage>
  )
}

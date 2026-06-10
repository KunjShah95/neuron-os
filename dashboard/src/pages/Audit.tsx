import { useState } from "react"
import { motion } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"
import AuditTable from "../components/AuditTable"
import { useAudit, type AuditFilters } from "../hooks/useAudit"

export default function Audit() {
  const [filters, setFilters] = useState<AuditFilters>({})
  const [search, setSearch] = useState("")
  const { data, isLoading } = useAudit({ ...filters, search: search || undefined })

  function handleFilterChange(key: keyof AuditFilters, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }))
  }

  return (
    <AnimatedPage className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl text-surface-50">Audit Log</h1>
          <p className="text-xs text-surface-500 mt-1">{data?.total || 0} entries · filterable by action, agent, user, date</p>
        </div>
      </div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-5 mb-8"
      >
        <div className="flex flex-wrap gap-3">
          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search keywords..."
              className="w-full bg-surface-800/60 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 transition-colors"
            />
          </div>

          {/* Action filter */}
          <select
            value={filters.action || ""}
            onChange={(e) => handleFilterChange("action", e.target.value)}
            className="bg-surface-800/60 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-surface-100 focus:outline-none focus:border-amber-400/40"
          >
            <option value="" className="bg-surface-800">All Actions</option>
            <option value="agent:spawn" className="bg-surface-800">Agent Spawn</option>
            <option value="agent:kill" className="bg-surface-800">Agent Kill</option>
            <option value="task:submit" className="bg-surface-800">Task Submit</option>
            <option value="task:complete" className="bg-surface-800">Task Complete</option>
            <option value="memory:write" className="bg-surface-800">Memory Write</option>
            <option value="config:update" className="bg-surface-800">Config Update</option>
          </select>

          {/* Agent filter */}
          <input
            type="text"
            value={filters.agent || ""}
            onChange={(e) => handleFilterChange("agent", e.target.value)}
            placeholder="Agent ID..."
            className="bg-surface-800/60 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-amber-400/40 w-[160px]"
          />

          {/* Date range */}
          <input
            type="date"
            value={filters.from || ""}
            onChange={(e) => handleFilterChange("from", e.target.value)}
            className="bg-surface-800/60 border border-surface-700/50 rounded-xl px-3 py-2.5 text-xs text-surface-300 focus:outline-none focus:border-amber-400/40"
          />
          <input
            type="date"
            value={filters.to || ""}
            onChange={(e) => handleFilterChange("to", e.target.value)}
            className="bg-surface-800/60 border border-surface-700/50 rounded-xl px-3 py-2.5 text-xs text-surface-300 focus:outline-none focus:border-amber-400/40"
          />
        </div>
      </motion.div>

      {/* Audit table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <AuditTable entries={data?.entries || []} isLoading={isLoading} />
      </motion.div>
    </AnimatedPage>
  )
}

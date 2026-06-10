import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { AuditEntry } from "../api/client"
import { ActivityBadge } from "./UI"

interface AuditTableProps {
  entries: AuditEntry[]
  isLoading?: boolean
}

const severityColors: Record<string, string> = {
  info: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  warn: "bg-amber-400/10 text-amber-400 border-amber-400/20",
  error: "bg-rose-500/10 text-rose-400 border-rose-400/20",
}

export default function AuditTable({ entries, isLoading }: AuditTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-surface-800/40 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-700/30">
              <th className="text-left text-[10px] text-surface-400 uppercase tracking-wider font-medium px-4 py-3">Time</th>
              <th className="text-left text-[10px] text-surface-400 uppercase tracking-wider font-medium px-4 py-3">Action</th>
              <th className="text-left text-[10px] text-surface-400 uppercase tracking-wider font-medium px-4 py-3">Agent</th>
              <th className="text-left text-[10px] text-surface-400 uppercase tracking-wider font-medium px-4 py-3">Resource</th>
              <th className="text-left text-[10px] text-surface-400 uppercase tracking-wider font-medium px-4 py-3">Severity</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <>
                <motion.tr
                  key={entry.id}
                  layout
                  className="border-b border-surface-700/20 hover:bg-surface-800/30 cursor-pointer transition-colors"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <td className="px-4 py-3 font-mono text-[11px] text-surface-400 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-surface-100 font-medium">{entry.action}</span>
                  </td>
                  <td className="px-4 py-3 text-surface-300 text-xs">
                    {entry.agentName || entry.agentId || "—"}
                  </td>
                  <td className="px-4 py-3 text-surface-400 text-xs font-mono truncate max-w-[200px]">
                    {entry.resource}
                  </td>
                  <td className="px-4 py-3">
                    <ActivityBadge type={entry.severity}>{entry.severity}</ActivityBadge>
                  </td>
                </motion.tr>
                <AnimatePresence>
                  {expandedId === entry.id && (
                    <motion.tr
                      key={`${entry.id}-detail`}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <td colSpan={5} className="px-4 py-3 bg-surface-800/20">
                        <pre className="text-xs text-surface-300 font-mono overflow-x-auto max-h-[200px] overflow-y-auto">
                          {JSON.stringify(entry.detail, null, 2)}
                        </pre>
                      </td>
                    </motion.tr>
                  )}
                </AnimatePresence>
              </>
            ))}
          </tbody>
        </table>
      </div>
      {entries.length === 0 && (
        <div className="text-center py-12">
          <div className="text-3xl mb-2 opacity-20">✦</div>
          <p className="text-surface-500 text-xs">No audit entries found.</p>
        </div>
      )}
    </div>
  )
}

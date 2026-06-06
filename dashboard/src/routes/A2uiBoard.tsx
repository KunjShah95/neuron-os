import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"
import { A2uiWidgetRenderer, type A2uiWidget } from "../components/A2uiWidgets"
import { useA2uiStream } from "../contexts/A2uiStreamContext"

/** Widget with its scope for the "all scopes" flattened view */
interface ScopedWidget {
  widget: A2uiWidget
  scope: string
}

export default function A2uiBoard() {
  const { scopedWidgets, lastUpdate, isConnected, clearAll, clearScope, sendAction } = useA2uiStream()
  const [selectedScope, setSelectedScope] = useState<string | null>(null)
  const [actionLog, setActionLog] = useState<Array<{ ts: number; msg: string }>>([])

  // Collect all scopes
  const scopes = useMemo(() => {
    return Array.from(scopedWidgets.keys())
  }, [scopedWidgets])

  // Unified flattened widget list with scope context
  const scopedWidgetList = useMemo<ScopedWidget[]>(() => {
    const result: ScopedWidget[] = []
    for (const [scope, widgets] of scopedWidgets) {
      for (const [, widget] of widgets) {
        result.push({ widget, scope })
      }
    }
    return result
  }, [scopedWidgets])

  // Count per scope
  const scopeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const [scope, widgets] of scopedWidgets) {
      counts.set(scope, widgets.size)
    }
    return counts
  }, [scopedWidgets])

  // Filter widgets by selected scope, or show all
  const displayWidgets = useMemo(() => {
    if (selectedScope) {
      return scopedWidgetList.filter((sw) => sw.scope === selectedScope)
    }
    return scopedWidgetList
  }, [scopedWidgetList, selectedScope])

  const handleAction = (action: string, widgetId: string, scope?: string) => {
    const targetScope = scope || selectedScope || "all"
    sendAction(action, widgetId, targetScope, {})
    setActionLog((prev) => [{ ts: Date.now(), msg: `Action: ${action} (scope: ${targetScope})` }, ...prev].slice(0, 20))
  }

  return (
    <AnimatedPage className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl text-surface-50">A2UI Dashboard</h1>
          <p className="text-xs text-surface-500 mt-1">
            Agent-generated interactive widgets in real-time
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection indicator */}
          <motion.div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-wider ${
              isConnected
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-surface-800/60 text-surface-500"
            }`}
          >
            <motion.span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-emerald-400" : "bg-surface-500"
              }`}
              animate={isConnected ? { opacity: [1, 0.4, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            />
            {isConnected ? "Live" : "Disconnected"}
          </motion.div>

          <button
            onClick={clearAll}
            className="text-[10px] text-surface-600 hover:text-rose-400 transition-colors uppercase tracking-wider"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Scope filter bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 mb-6 overflow-x-auto pb-2"
      >
        <button
          onClick={() => setSelectedScope(null)}
          className={`px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap transition-all border ${
            selectedScope === null
              ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
              : "bg-surface-800/40 border-surface-700/30 text-surface-500 hover:text-surface-300"
          }`}
        >
          All Scopes
          <span className="ml-1.5 text-[10px] opacity-60">{displayWidgets.length}</span>
        </button>
        {scopes.map((scope) => (
          <button
            key={scope}
            onClick={() => setSelectedScope(scope)}
            className={`px-3 py-1.5 rounded-full text-[11px] whitespace-nowrap transition-all border ${
              selectedScope === scope
                ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-surface-800/40 border-surface-700/30 text-surface-500 hover:text-surface-300"
            }`}
          >
            {scope}
            <span className="ml-1.5 text-[10px] opacity-60">
              {scopeCounts.get(scope) ?? 0}
            </span>
          </button>
        ))}
      </motion.div>

      {/* Widget grid */}
      {displayWidgets.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-24"
        >
          <div className="text-5xl mb-4 opacity-15">◇</div>
          <p className="text-surface-500 text-sm mb-1">
            No A2UI widgets yet
          </p>
          <p className="text-surface-600 text-xs">
            Widgets appear here when agents emit them via the{" "}
            <code className="text-amber-400/70">a2ui_emit</code> tool.
          </p>
          <p className="text-surface-600 text-xs mt-2">
            Try: <code className="text-amber-400/70">aegis agent spawn demo --type build</code>
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {displayWidgets.map(({ widget, scope }) => (
              <motion.div
                key={`${scope}-${widget.id}`}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.25 }}
              >
                <div className="relative group">
                  <A2uiWidgetRenderer
                    widget={widget}
                    onAction={(action, widgetId) => handleAction(action, widgetId, scope)}
                  />
                  <button
                    onClick={() => clearScope(scope)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[9px] text-surface-600 hover:text-rose-400 transition-all uppercase tracking-wider"
                    title={`Clear ${scope} widgets`}
                  >
                    ✕
                  </button>
                  <span className="absolute bottom-2 right-3 text-[8px] text-surface-700 font-mono">
                    {scope}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Action Log */}
      {actionLog.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 glass rounded-2xl p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-surface-500 uppercase tracking-wider font-mono">Action Log</span>
            <button
              onClick={() => setActionLog([])}
              className="text-[9px] text-surface-600 hover:text-surface-400 transition-colors"
            >
              Clear
            </button>
          </div>
          <div className="space-y-1">
            {actionLog.map((entry, i) => (
              <div key={`${entry.ts}-${i}`} className="flex items-center gap-2 text-[10px] font-mono">
                <span className="text-surface-600 w-12">{new Date(entry.ts).toLocaleTimeString()}</span>
                <span className="text-emerald-400/70">→</span>
                <span className="text-surface-400">{entry.msg}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Timestamp */}
      {lastUpdate && (
        <div className="mt-6 text-[9px] text-surface-700 font-mono text-center">
          Last update: {new Date(lastUpdate).toLocaleTimeString()}
        </div>
      )}
    </AnimatedPage>
  )
}

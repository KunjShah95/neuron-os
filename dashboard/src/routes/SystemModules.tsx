import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"

// ── Module categories with colors ─────────────────────────────────────

interface SystemModule {
  id: string
  name: string
  description: string
  category: string
  status: "active" | "inactive" | "error"
  icon: string
}

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  core: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
  agents: { bg: "bg-blue-500/10", border: "border-blue-500/30", text: "text-blue-400" },
  memory: { bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400" },
  tools: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
  monitoring: { bg: "bg-rose-500/10", border: "border-rose-500/30", text: "text-rose-400" },
  integration: { bg: "bg-cyan-500/10", border: "border-cyan-500/30", text: "text-cyan-400" },
}

const SYSTEM_MODULES: SystemModule[] = [
  // Core
  { id: "core.manager", name: "Agent Manager", description: "Orchestrates agent lifecycle and communication", category: "core", status: "active", icon: "◈" },
  { id: "core.ipc", name: "IPC Protocol", description: "Typed message passing between agents", category: "core", status: "active", icon: "◎" },
  { id: "core.config", name: "Configuration", description: "System and project configuration", category: "core", status: "active", icon: "⚙" },
  { id: "core.lifecycle", name: "Lifecycle Hooks", description: "Startup, shutdown, and recovery", category: "core", status: "active", icon: "↻" },
  
  // Agents
  { id: "agents.build", name: "Build Agent", description: "Code generation and implementation", category: "agents", status: "active", icon: "✦" },
  { id: "agents.plan", name: "Plan Agent", description: "Task decomposition and planning", category: "agents", status: "active", icon: "◇" },
  { id: "agents.test", name: "Test Agent", description: "Test generation and validation", category: "agents", status: "active", icon: "✓" },
  { id: "agents.review", name: "Review Agent", description: "Code review and quality checks", category: "agents", status: "active", icon: "⊙" },
  { id: "agents.debug", name: "Debug Agent", description: "Bug diagnosis and resolution", category: "agents", status: "active", icon: "◎" },
  { id: "agents.deploy", name: "Deploy Agent", description: "Deployment orchestration", category: "agents", status: "active", icon: "↗" },
  
  // Memory
  { id: "memory.session", name: "Session Store", description: "Persistent session storage (SQLite)", category: "memory", status: "active", icon: "◇" },
  { id: "memory.episodic", name: "Episodic Memory", description: "Task history and learnings", category: "memory", status: "inactive", icon: "◈" },
  { id: "memory.semantic", name: "Semantic Search", description: "Embedding-based retrieval", category: "memory", status: "inactive", icon: "◎" },
  { id: "memory.project", name: "Project Context", description: "Per-project isolation", category: "memory", status: "active", icon: "✦" },
  
  // Tools
  { id: "tools.skills", name: "Skills Engine", description: "Capability modules marketplace", category: "tools", status: "inactive", icon: "◆" },
  { id: "tools.cron", name: "Cron Scheduler", description: "Scheduled task execution", category: "tools", status: "inactive", icon: "⏱" },
  { id: "tools.mcp", name: "MCP Server", description: "Model Context Protocol integration", category: "tools", status: "inactive", icon: "⊞" },
  { id: "tools.wakeup", name: "Wakeup System", description: "Startup event triggers", category: "tools", status: "active", icon: "⚡" },
  
  // Monitoring
  { id: "monitor.telemetry", name: "Telemetry", description: "Command tracking and metrics", category: "monitoring", status: "active", icon: "📊" },
  { id: "monitor.health", name: "Health Monitor", description: "System health and uptime", category: "monitoring", status: "active", icon: "♥" },
  { id: "monitor.audit", name: "Audit Log", description: "Tool call history (planned)", category: "monitoring", status: "inactive", icon: "📋" },
  { id: "monitor.cost", name: "Cost Attribution", description: "Token usage tracking", category: "monitoring", status: "inactive", icon: "◇" },
  
  // Integration
  { id: "int.api", name: "HTTP API", description: "REST API for external access", category: "integration", status: "active", icon: "↗" },
  { id: "int.websocket", name: "WebSocket", description: "Real-time event streaming", category: "integration", status: "active", icon: "◎" },
  { id: "int.providers", name: "LLM Providers", description: "13 provider integrations", category: "integration", status: "active", icon: "✦" },
  { id: "int.gateways", name: "Gateway Support", description: "Telegram, Discord, Slack", category: "integration", status: "active", icon: "◈" },
]

// ── Module Card Component ─────────────────────────────────────────────

function ModuleCard({ module }: { module: SystemModule }) {
  const colors = CATEGORY_COLORS[module.category]
  
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`liquid-glass rounded-xl p-4 border ${colors.border} ${colors.bg} card-hover`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-lg ${colors.text}`}>{module.icon}</span>
          <div>
            <h3 className="text-sm font-medium text-surface-100">{module.name}</h3>
            <span className="text-[9px] text-surface-500 font-mono uppercase tracking-wider">{module.id}</span>
          </div>
        </div>
        <span className={`text-[8px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider ${
          module.status === "active" 
            ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
            : module.status === "error"
            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
            : "bg-surface-800/60 text-surface-500 border border-surface-700/30"
        }`}>
          {module.status}
        </span>
      </div>
      
      <p className="text-[10px] text-surface-400 leading-relaxed">{module.description}</p>
    </motion.div>
  )
}

// ── Main Component ────────────────────────────────────────────────────

export default function SystemModules() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  
  const categories = useMemo(() => Object.keys(CATEGORY_COLORS), [])
  
  const filtered = useMemo(() => {
    if (!selectedCategory) return SYSTEM_MODULES
    return SYSTEM_MODULES.filter(m => m.category === selectedCategory)
  }, [selectedCategory])
  
  const stats = useMemo(() => ({
    total: SYSTEM_MODULES.length,
    active: SYSTEM_MODULES.filter(m => m.status === "active").length,
    inactive: SYSTEM_MODULES.filter(m => m.status === "inactive").length,
    categories: categories.length,
  }), [categories])

  return (
    <AnimatedPage className="p-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8"
      >
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl text-surface-50">System Modules</h1>
            <p className="text-xs text-surface-400 mt-2">
              {stats.total} modules · {stats.active} active · {stats.inactive} planned
            </p>
          </div>
          
          {/* View toggle */}
          <div className="flex items-center gap-2 glass rounded-xl p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all ${
                viewMode === "grid" 
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  : "text-surface-500 hover:text-surface-300"
              }`}
            >
              Grid
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all ${
                viewMode === "list"
                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  : "text-surface-500 hover:text-surface-300"
              }`}
            >
              List
            </button>
          </div>
        </div>
      </motion.div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex items-center gap-4 mb-6"
      >
        {[
          { label: "Total Modules", value: stats.total, icon: "◈" },
          { label: "Active", value: stats.active, icon: "✓", color: "text-emerald-400" },
          { label: "Planned", value: stats.inactive, icon: "◇", color: "text-surface-500" },
          { label: "Categories", value: stats.categories, icon: "📂" },
        ].map((stat) => (
          <div key={stat.label} className="liquid-glass rounded-xl px-4 py-3 flex items-center gap-3">
            <span className={`text-lg ${stat.color || "text-surface-500"}`}>{stat.icon}</span>
            <div>
              <div className="text-lg font-display text-surface-100">{stat.value}</div>
              <div className="text-[8px] text-surface-600 uppercase tracking-wider font-mono">{stat.label}</div>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Category Filter */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="flex items-center gap-2 mb-6 flex-wrap"
      >
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all border ${
            !selectedCategory
              ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
              : "bg-surface-800/40 border-surface-700/30 text-surface-500 hover:text-surface-300"
          }`}
        >
          All
        </button>
        {categories.map((cat) => {
          const colors = CATEGORY_COLORS[cat]
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono transition-all border ${
                selectedCategory === cat
                  ? `${colors.bg} ${colors.border} ${colors.text}`
                  : "bg-surface-800/40 border-surface-700/30 text-surface-500 hover:text-surface-300"
              }`}
            >
              {cat}
            </button>
          )
        })}
      </motion.div>

      {/* Grid View */}
      {viewMode === "grid" ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((module) => (
              <ModuleCard key={module.id} module={module} />
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        /* List View */
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-2xl overflow-hidden"
        >
          <div className="divide-y divide-surface-700/20">
            <AnimatePresence mode="popLayout">
              {filtered.map((module) => {
                const colors = CATEGORY_COLORS[module.category]
                return (
                  <motion.div
                    key={module.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-4 p-4 hover:bg-surface-800/20 transition-colors"
                  >
                    <span className={`text-lg ${colors.text}`}>{module.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-surface-100">{module.name}</h3>
                        <span className={`text-[8px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider ${
                          module.status === "active" 
                            ? "bg-emerald-400/10 text-emerald-400 border border-emerald-400/20"
                            : "bg-surface-800/60 text-surface-500 border border-surface-700/30"
                        }`}>
                          {module.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-surface-500 mt-0.5">{module.description}</p>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-mono ${colors.bg} ${colors.text}`}>
                      {module.category}
                    </span>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </motion.div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-20">◈</div>
          <p className="text-surface-600 text-xs">No modules match your filters.</p>
        </div>
      )}
    </AnimatedPage>
  )
}

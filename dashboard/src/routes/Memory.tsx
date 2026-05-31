import { useState } from "react"
import { motion } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"

const demoFacts = [
  { fact: "User prefers TypeScript for backend projects", category: "preference", confidence: 0.92 },
  { fact: "User's preferred AI provider is Anthropic", category: "preference", confidence: 0.88 },
  { fact: "Completed 12 agent tasks today", category: "activity", confidence: 0.95 },
  { fact: "Project uses Bun as the runtime", category: "technical", confidence: 0.99 },
  { fact: "Dashboard was the most used view this week", category: "activity", confidence: 0.76 },
]

const demoMemories = [
  { content: "Resolved merge conflict in chat/renderer.ts — model picker integration", timestamp: "2h ago", type: "success" },
  { content: "Refactored agent manager to support exponential backoff recovery", timestamp: "4h ago", type: "info" },
  { content: "Added web fetch and web search tools to the tool registry", timestamp: "6h ago", type: "info" },
  { content: "Spike in CPU usage detected during cron job execution", timestamp: "8h ago", type: "warn" },
  { content: "Deployed MCP server for tool interoperability", timestamp: "12h ago", type: "success" },
]

export default function Memory() {
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<typeof demoFacts>([])

  function handleSearch() {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    const results = demoFacts.filter((f) => f.fact.toLowerCase().includes(query.toLowerCase()))
    setSearchResults(results)
  }

  return (
    <AnimatedPage className="p-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-surface-50">Memory</h1>
        <p className="text-xs text-surface-500 mt-1">Recall, facts, and the story of your work</p>
      </div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-5 mb-8"
      >
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search memories and facts..."
            className="flex-1 bg-surface-800/60 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-cyan-400/40 transition-colors"
          />
          <button
            onClick={handleSearch}
            className="px-5 py-2.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl text-sm font-medium hover:bg-cyan-500/20 transition-all"
          >
            Search
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-6">
        {/* Facts */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">Learned Facts</h2>
          <div className="space-y-3">
            {(searchResults.length > 0 ? searchResults : demoFacts).map((fact, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass rounded-xl p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="text-cyan-400 mt-0.5 text-xs">◇</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-100">{fact.fact}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[10px] text-surface-500 uppercase tracking-wider bg-surface-700/50 px-2 py-0.5 rounded">
                        {fact.category}
                      </span>
                      <span className="text-[10px] text-surface-600">
                        {Math.round(fact.confidence * 100)}% confidence
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">Recent Activity</h2>
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-surface-700" />
            <div className="space-y-4">
              {demoMemories.map((mem, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex items-start gap-4 pl-1"
                >
                  <span className={`w-3 h-3 rounded-full border-2 border-surface-800 mt-1 z-10 ${
                    mem.type === "success" ? "bg-emerald-400" :
                    mem.type === "warn" ? "bg-amber-400" : "bg-cyan-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-100">{mem.content}</p>
                    <p className="text-[10px] text-surface-600 mt-0.5">{mem.timestamp}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatedPage>
  )
}

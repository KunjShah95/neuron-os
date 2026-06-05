import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import AnimatedPage from "../components/AnimatedPage"
import { api } from "../api/client"
import { useProject } from "../contexts/ProjectContext"
import type { MemoryEntry } from "../api/types"

function formatTime(ts: string | number) {
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 5000) return "just now"
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return d.toLocaleDateString()
}

export default function Memory() {
  const [query, setQuery] = useState("")
  const [memoryContent, setMemoryContent] = useState<string>("")
  const [searchResults, setSearchResults] = useState<MemoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const { currentProject, hasProject } = useProject()

  // Load memory on mount and on project change
  useEffect(() => {
    setLoading(true)
    setSearchResults([])
    api.getMemory(currentProject)
      .then((content) => {
        setMemoryContent(content)
      })
      .catch(() => {
        setMemoryContent("")
      })
      .finally(() => setLoading(false))
  }, [currentProject])

  async function handleSearch() {
    if (!query.trim()) {
      setSearchResults([])
      return
    }
    setSearching(true)
    try {
      const results = await api.searchMemory(query, currentProject)
      setSearchResults(results)
    } catch {
      setSearchResults([])
    } finally {
      setSearching(false)
    }
  }

  // Extract memory sections for display
  const sections = memoryContent
    .split(/^## /m)
    .filter(Boolean)
    .slice(0, 10)
    .map((s) => {
      const lines = s.split("\n")
      const title = lines[0]?.trim() || ""
      const body = lines.slice(1).join("\n").trim()
      return { title, body, time: new Date(title).getTime() || 0 }
    })

  return (
    <AnimatedPage className="p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl text-surface-50">Memory</h1>
          {hasProject && (
            <span className="text-[10px] text-amber-400 uppercase tracking-wider bg-amber-400/10 px-2 py-0.5 rounded-full">
              {currentProject}
            </span>
          )}
        </div>
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
            placeholder={hasProject ? `Search ${currentProject} memories...` : "Search memories and facts..."}
            className="flex-1 bg-surface-800/60 border border-surface-700/50 rounded-xl px-4 py-2.5 text-sm text-surface-100 placeholder:text-surface-600 focus:outline-none focus:border-cyan-400/40 transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="px-5 py-2.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-xl text-sm font-medium hover:bg-cyan-500/20 transition-all disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>
      </motion.div>

      <div className="grid grid-cols-2 gap-6">
        {/* Memory Content */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">
            {searchResults.length > 0 ? `Search Results (${searchResults.length})` : hasProject ? `${currentProject} Memory` : "Memory"}
          </h2>

          {loading ? (
            <div className="text-center py-12 text-surface-500 text-sm">Loading...</div>
          ) : searchResults.length > 0 ? (
            <div className="space-y-3">
              {searchResults.map((entry, i) => (
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
                      <p className="text-sm text-surface-100 line-clamp-4">{entry.content}</p>
                      <div className="flex items-center gap-3 mt-2">
                        {entry.category && (
                          <span className="text-[10px] text-surface-500 uppercase tracking-wider bg-surface-700/50 px-2 py-0.5 rounded">
                            {entry.category}
                          </span>
                        )}
                        <span className="text-[10px] text-surface-600">{formatTime(entry.timestamp)}</span>
                        {entry.score && (
                          <span className="text-[10px] text-surface-600">
                            {Math.round(entry.score * 100)}% match
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : sections.length > 0 ? (
            <div className="space-y-3">
              {sections.map((sec, i) => (
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
                      <p className="text-sm text-surface-100 font-medium mb-1">
                        {sec.time ? new Date(sec.time).toLocaleString() : sec.title || "Untitled"}
                      </p>
                      <p className="text-xs text-surface-400 line-clamp-3">{sec.body}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-4xl mb-4 opacity-20">◇</div>
              <p className="text-surface-500 text-sm">No memory data yet.</p>
              <p className="text-surface-600 text-xs mt-1">
                Memories appear here as you use agents.
              </p>
            </div>
          )}
        </motion.div>

        {/* Current Project Info */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-4">
            {hasProject ? `Project: ${currentProject}` : "Default Context"}
          </h2>
          <div className="glass rounded-2xl p-5">
            {hasProject ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-surface-100">
                  <span className="text-amber-400">◆</span>
                  <span>Sessions, memory, and state are isolated to this project.</span>
                </div>
                <div className="flex items-center gap-2 text-surface-100">
                  <span className="text-cyan-400">◇</span>
                  <span>All API calls include <code className="text-[10px] bg-surface-700/50 px-1 py-0.5 rounded">?project={currentProject}</code> scope.</span>
                </div>
                <div className="flex items-center gap-2 text-surface-500">
                  <span className="text-surface-500">⬡</span>
                  <span>Switch projects from the sidebar selector.</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-sm text-surface-400">
                <p>No project selected — showing default memory.</p>
                <p className="text-xs text-surface-600">
                  Use <span className="text-amber-400">aegis project init</span> to create a project,
                  then select it from the sidebar to isolate sessions and memory.
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatedPage>
  )
}

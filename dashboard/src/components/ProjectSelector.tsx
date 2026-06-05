import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useProject } from "../contexts/ProjectContext"

export default function ProjectSelector() {
  const { currentProject, projects, setProject, loading, hasProject } = useProject()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const label = hasProject ? currentProject : "default"

  return (
    <div ref={ref} className="relative px-5 py-3 border-t border-surface-700/30">
      <div className="text-[10px] text-surface-600 uppercase tracking-[0.15em] mb-1.5">Project</div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-800/40 border border-surface-700/30 hover:border-amber-400/30 transition-all text-left"
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasProject ? "bg-amber-400" : "bg-surface-500"}`} />
        <span className="text-xs text-surface-100 truncate flex-1">{label}</span>
        <svg
          className={`w-3 h-3 text-surface-500 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden"
          >
            <div className="glass rounded-xl border border-surface-700/50 shadow-xl py-1 max-h-[200px] overflow-y-auto">
              {/* Default option */}
              <button
                onClick={() => { setProject(null); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                  !hasProject ? "text-amber-400 bg-amber-400/5" : "text-surface-400 hover:text-surface-100 hover:bg-surface-800/40"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-surface-500" />
                default
              </button>

              {/* Divider */}
              {projects.length > 0 && (
                <div className="mx-3 my-1 border-t border-surface-700/30" />
              )}

              {projects.length === 0 && loading ? (
                <div className="px-3 py-2 text-[10px] text-surface-500 text-center">Loading...</div>
              ) : projects.length === 0 ? (
                <div className="px-3 py-2 text-[10px] text-surface-600 text-center">
                  No projects registered
                </div>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => { setProject(p.name); setOpen(false) }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
                      currentProject === p.name
                        ? "text-amber-400 bg-amber-400/5"
                        : "text-surface-400 hover:text-surface-100 hover:bg-surface-800/40"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

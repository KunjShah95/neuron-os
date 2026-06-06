import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useProject } from "../contexts/ProjectContext"

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 5L6 8L9 5" />
    </svg>
  )
}

export default function ProjectSelector() {
  const { currentProject, projects, setProject, loading, hasProject } = useProject()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

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
    <div ref={ref} className="relative px-4 py-3.5 hairline-b">
      <div className="text-[9px] text-white/30 uppercase tracking-[0.2em] mb-2 font-mono">
        Project
      </div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg liquid-glass hover:bg-white/[0.025] transition-all text-left"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            hasProject ? "bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]" : "bg-white/30"
          }`}
        />
        <span className="text-[12px] text-white/85 truncate flex-1 font-medium">
          {label}
        </span>
        <span className={`text-white/40 transition-transform ${open ? "rotate-180" : ""}`}>
          <ChevronDown />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden z-50"
          >
            <div className="liquid-glass-strong rounded-xl py-1 max-h-[220px] overflow-y-auto">
              <button
                onClick={() => {
                  setProject(null)
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                  !hasProject
                    ? "text-white bg-white/[0.04]"
                    : "text-ink-300 hover:text-white hover:bg-white/[0.03]"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
                default
              </button>

              {projects.length > 0 && (
                <div className="mx-3 my-1 border-t border-white/[0.05]" />
              )}

              {projects.length === 0 && loading ? (
                <div className="px-3 py-2 text-[10px] text-white/30 text-center font-mono">
                  Loading...
                </div>
              ) : projects.length === 0 ? (
                <div className="px-3 py-2 text-[10px] text-white/30 text-center font-mono">
                  No projects registered
                </div>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.name}
                    onClick={() => {
                      setProject(p.name)
                      setOpen(false)
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors ${
                      currentProject === p.name
                        ? "text-white bg-white/[0.04]"
                        : "text-ink-300 hover:text-white hover:bg-white/[0.03]"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
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

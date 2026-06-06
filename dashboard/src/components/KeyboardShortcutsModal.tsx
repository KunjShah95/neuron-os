import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"

// ── Shortcut definitions ─────────────────────────────────────────────

interface ShortcutDef {
  keys: string[]
  label: string
  /** Optional context where this shortcut applies */
  context?: string
}

type ShortcutGroup = {
  title: string
  icon: string
  shortcuts: ShortcutDef[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "Global",
    icon: "◇",
    shortcuts: [
      { keys: ["?"], label: "Open keyboard shortcuts" },
      { keys: ["Escape"], label: "Close modals & overlays" },
    ],
  },
  {
    title: "A2UI Playground",
    icon: "▤",
    shortcuts: [
      { keys: ["Ctrl", "1"], label: "Switch to Builder tab" },
      { keys: ["Ctrl", "2"], label: "Switch to Gallery tab" },
      { keys: ["Ctrl", "3"], label: "Switch to JSON Editor tab" },
      { keys: ["Ctrl", "4"], label: "Switch to Events tab" },
      { keys: ["Ctrl", "5"], label: "Switch to Saved Skills tab" },
      { keys: ["Ctrl", "Enter"], label: "Build & Emit (Builder tab)" },
      { keys: ["Ctrl", "S"], label: "Save most recent widget as skill" },
      { keys: ["Ctrl", "Z"], label: "Undo last emitted widget in preview" },
    ],
  },
]

// ── Key renderer ──────────────────────────────────────────────────────

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k, i) => (
        <span key={i} className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 rounded bg-surface-800/80 border border-surface-700/50 text-[9px] text-surface-400 font-mono min-w-[18px] text-center">
            {k}
          </kbd>
          {i < keys.length - 1 && (
            <span className="text-surface-700 text-[8px]">+</span>
          )}
        </span>
      ))}
    </span>
  )
}

// ── Modal component ───────────────────────────────────────────────────

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function KeyboardShortcutsModal({ isOpen, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-2xl border border-surface-700/30 shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-6 pb-4 hairline-b sticky top-0 z-10 bg-black/40 backdrop-blur-xl rounded-t-2xl">
              <div className="flex items-center gap-3">
                <span className="text-lg text-amber-400/70">⌨</span>
                <div>
                  <h2 className="text-sm font-medium text-surface-100">
                    Keyboard Shortcuts
                  </h2>
                  <p className="text-[10px] text-surface-600 mt-0.5">
                    Press <kbd className="px-1 py-0.5 rounded bg-surface-800 border border-surface-700/50 text-[8px] text-surface-500 font-mono">?</kbd> to toggle this panel
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-6 h-6 rounded-lg bg-surface-800/60 border border-surface-700/30 text-[10px] text-surface-500 hover:text-surface-300 transition-colors flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Shortcut groups */}
            <div className="p-6 space-y-6">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] text-surface-500">{group.icon}</span>
                    <h3 className="text-[10px] text-surface-500 uppercase tracking-[0.15em] font-medium">
                      {group.title}
                    </h3>
                  </div>
                  <div className="space-y-1.5">
                    {group.shortcuts.map((sc, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-800/30 border border-surface-700/20"
                      >
                        <span className="text-[11px] text-surface-300">{sc.label}</span>
                        <KeyCombo keys={sc.keys} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer tip */}
            <div className="px-6 pb-5">
              <div className="px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <p className="text-[9px] text-amber-400/60 leading-relaxed">
                  <span className="text-amber-400/80">Tip:</span> Press{" "}
                  <kbd className="px-1 py-0.5 rounded bg-surface-800 border border-surface-700/50 text-[8px] text-surface-500 font-mono">?</kbd>{" "}
                  at any time to reopen this panel.
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Global hook for ? key ─────────────────────────────────────────────

export function useKeyboardShortcutsModal(): [boolean, (v: boolean) => void] {
  const [isOpen, setIsOpen] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // ? opens/closes the modal — but not when typing in inputs
    if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return
      e.preventDefault()
      setIsOpen((prev) => !prev)
    }
  }, [])

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return [isOpen, setIsOpen]
}

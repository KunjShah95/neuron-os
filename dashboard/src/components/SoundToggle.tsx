import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import { useNotificationSounds } from "../hooks/useNotificationSounds"

interface SoundToggleProps {
  /** Optional class name for positioning */
  className?: string
  /** Called when toggle state changes */
  onChange?: (enabled: boolean) => void
}

/**
 * A small toggle button for notification sounds.
 *
 * Persists preference in localStorage via `useNotificationSounds`.
 * Renders as a small icon button with a subtle popover description on hover.
 */
export default function SoundToggle({ className = "", onChange }: SoundToggleProps) {
  const { isEnabled, toggleSounds } = useNotificationSounds()
  const [showHint, setShowHint] = useState(false)

  const enabled = isEnabled()

  const handleClick = useCallback(() => {
    const next = toggleSounds()
    onChange?.(next)
  }, [toggleSounds, onChange])

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={handleClick}
        onMouseEnter={() => setShowHint(true)}
        onMouseLeave={() => setShowHint(false)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] uppercase tracking-wider transition-all duration-200 ${
          enabled
            ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
            : "bg-surface-800/60 text-surface-600 hover:text-surface-400"
        }`}
        title={enabled ? "Mute notification sounds" : "Enable notification sounds"}
      >
        <motion.span
          animate={enabled ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: enabled ? 0.3 : 0 }}
          className="text-sm"
        >
          {enabled ? "♪" : "♪"}
        </motion.span>
        <span>{enabled ? "Sound On" : "Muted"}</span>
      </button>

      {/* Hint popover */}
      {showHint && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-full right-0 mt-1.5 px-2 py-1 bg-surface-800 border border-surface-700 rounded-lg text-[10px] text-surface-400 whitespace-nowrap z-50 shadow-lg"
        >
          {enabled
            ? "Notifications on · spawn/kill/error"
            : "Notifications off · click to enable"}
        </motion.div>
      )}
    </div>
  )
}

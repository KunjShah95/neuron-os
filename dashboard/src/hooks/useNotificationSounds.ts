import { useCallback } from "react"
import type { WsEvent } from "./useWebSocket"
import {
  playSpawnSound,
  playKillSound,
  playErrorSound,
  playConnectSound,
  playNotificationSound,
} from "../lib/sounds"

const STORAGE_KEY = "aegis:sound-enabled"

/**
 * Module-level mute state — shared across all hook instances.
 * This ensures Dashboard and Status pages stay in sync without React context.
 */
let _soundEnabled: boolean | null = null

function isSoundEnabled(): boolean {
  if (_soundEnabled !== null) return _soundEnabled
  // First access: read from localStorage
  if (typeof window === "undefined") return false
  const stored = localStorage.getItem(STORAGE_KEY)
  _soundEnabled = stored === null ? true : stored === "true"
  return _soundEnabled
}

function setSoundEnabled(enabled: boolean): void {
  _soundEnabled = enabled
  localStorage.setItem(STORAGE_KEY, String(enabled))
}

/** Throttle misc notifications to max 1 per 2s */
let lastNotificationTime = 0
const NOTIFICATION_THROTTLE_MS = 2000

/**
 * Hook that plays notification sounds in response to WebSocket events.
 *
 * Detects event types like agent:spawn, agent:kill, agent:error, connected
 * and plays the corresponding sound.
 *
 * Respects a persisted mute toggle in localStorage. Mute state is shared
 * across all hook instances via a module-level variable.
 */
export function useNotificationSounds() {
  const handleEvent = useCallback((event: WsEvent) => {
    if (!isSoundEnabled()) return

    switch (event.event) {
      case "agent:spawn":
        playSpawnSound()
        break
      case "agent:kill":
        playKillSound()
        break
      case "agent:error":
        playErrorSound()
        break
      case "connected":
        playConnectSound()
        break
      case "agent:status": {
        // Play error sound if agent entered error state
        const data = event.data as Record<string, unknown>
        const eventData = (data?.data as Record<string, unknown>) || {}
        if (eventData.status === "error") {
          playErrorSound()
        }
        break
      }
      default: {
        // Throttled subtle pop for misc events
        const now = Date.now()
        if (now - lastNotificationTime > NOTIFICATION_THROTTLE_MS) {
          lastNotificationTime = now
          playNotificationSound()
        }
        break
      }
    }
  }, [])

  const toggleSounds = useCallback(() => {
    const next = !isSoundEnabled()
    setSoundEnabled(next)
    return next
  }, [])

  const isEnabled = useCallback(() => isSoundEnabled(), [])

  return { handleEvent, toggleSounds, isEnabled }
}

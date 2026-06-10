import { useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useWebSocket } from "../hooks/useWebSocket"
import { getWsUrl, getSseUrl } from "../api/client"
import { ActivityBadge } from "./UI"

interface TimelineEvent {
  id: number
  type: string
  agentId: string
  summary: string
  detail: string
  timestamp: number
}

const eventColors: Record<string, string> = {
  "agent:spawn": "bg-emerald-400",
  "agent:kill": "bg-rose-500",
  "agent:status": "bg-amber-400",
  "agent:event": "bg-cyan-400",
  "task:start": "bg-emerald-400",
  "task:complete": "bg-emerald-400",
  "task:error": "bg-rose-500",
  "tool:call": "bg-violet-400",
  "tool:result": "bg-violet-400",
}

export default function AgentTimeline({ agentId }: { agentId?: string }) {
  const feedRef = useRef<HTMLDivElement>(null)

  const { status: wsStatus, events } = useWebSocket({
    url: getWsUrl(),
    sseUrl: getSseUrl(),
    sseFallback: true,
    reconnect: true,
  })

  // Auto-scroll
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [events.length])

  const timelineEvents: TimelineEvent[] = events
    .filter((ev) => !agentId || (ev.data?.agentId as string) === agentId)
    .map((ev, i) => ({
      id: i,
      type: ev.event,
      agentId: (ev.data?.agentId as string) || "",
      summary: ev.event,
      detail: ev.data ? JSON.stringify(ev.data).slice(0, 80) : "",
      timestamp: ev.timestamp,
    }))

  const connStatus = wsStatus === "connected" ? "live" : wsStatus === "connecting" ? "connecting" : "offline"

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider">Event Stream</h3>
          <ActivityBadge type={connStatus === "live" ? "success" : "error"}>
            {connStatus}
          </ActivityBadge>
        </div>
      </div>

      <div className="max-h-[400px] overflow-y-auto" ref={feedRef}>
        {timelineEvents.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-3xl mb-2 opacity-20">✦</div>
            <p className="text-surface-500 text-xs">
              {wsStatus === "connected" ? "Waiting for events..." : "Connecting..."}
            </p>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-surface-700/50" />
            <AnimatePresence mode="popLayout">
              {timelineEvents.map((entry) => (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-start gap-3 pl-1 py-2"
                >
                  <span className={`w-3 h-3 rounded-full border-2 border-surface-800 mt-1 z-10 flex-shrink-0 ${
                    eventColors[entry.type] || "bg-amber-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-surface-100 font-medium">{entry.type}</span>
                      {entry.agentId && (
                        <span className="text-[10px] text-surface-600 font-mono">{entry.agentId.slice(0, 8)}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-surface-600 mt-0.5 font-mono">{entry.detail}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}

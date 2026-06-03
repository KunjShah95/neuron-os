import { useState } from "react"

export default function SiteDemo() {
  const [open, setOpen] = useState(true)

  return (
    <div className="min-h-screen py-24 bg-gradient-to-b from-surface-900 to-surface-950 text-surface-50">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="font-display text-3xl mb-4">Live demo</h2>
        <p className="text-surface-400 mb-6">Interact with a read-only preview of the dashboard.</p>

        <div className="bg-surface-800/50 rounded-xl border border-surface-700/30 overflow-hidden">
          <div className="p-4 border-b border-surface-700/20 flex items-center justify-between">
            <div className="text-sm">Demo sandbox</div>
            <div className="text-xs text-surface-500">Read-only preview</div>
          </div>

          <div className="p-6">
            <p className="text-sm text-surface-300">Demo placeholder — embed the dashboard or provide an interactive iframe here.</p>
            <div className="mt-4">
              <button className="btn btn-primary" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} sandbox</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

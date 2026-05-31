import AnimatedPage from "../components/AnimatedPage"

export default function Serve() {
  return (
    <AnimatedPage className="p-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-surface-50">API Server</h1>
        <p className="text-xs text-surface-500 mt-1">REST API for remote Aegis access</p>
      </div>

      <div className="glass rounded-2xl p-6 mb-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-3">Endpoints</h3>
            <div className="space-y-2 text-xs">
              {[
                { method: "GET", path: "/api/v1/health", desc: "Health check" },
                { method: "GET", path: "/api/v1/agents", desc: "List agents" },
                { method: "POST", path: "/api/v1/agents", desc: "Spawn agent" },
                { method: "DELETE", path: "/api/v1/agents/:id", desc: "Kill agent" },
                { method: "POST", path: "/api/v1/agents/:id/tasks", desc: "Assign task" },
                { method: "GET", path: "/api/v1/memory", desc: "Get memory" },
                { method: "POST", path: "/api/v1/memory", desc: "Append memory" },
              ].map((ep) => (
                <div key={ep.path} className="flex items-center gap-3">
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    ep.method === "GET" ? "text-emerald-400 bg-emerald-400/10" :
                    ep.method === "POST" ? "text-amber-400 bg-amber-400/10" :
                    "text-rose-400 bg-rose-400/10"
                  }`}>{ep.method}</span>
                  <span className="font-mono text-surface-400">{ep.path}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-surface-400 uppercase tracking-wider mb-3">Start</h3>
            <div className="bg-surface-900 rounded-xl p-4 font-mono text-xs">
              <div className="text-surface-300">$ <span className="text-amber-400">aegis serve</span></div>
              <div className="text-surface-600 mt-2"># --port 8080 (default)</div>
              <div className="text-surface-600"># --host 0.0.0.0</div>
              <div className="text-surface-600"># --key &lt;api-key&gt; (optional)</div>
            </div>
          </div>
        </div>
      </div>
    </AnimatedPage>
  )
}

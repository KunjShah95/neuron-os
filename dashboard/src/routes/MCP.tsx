import AnimatedPage from "../components/AnimatedPage"

const servers = [
  { name: "Anthropic MCP", url: "https://mcp.anthropic.com", status: "connected", tools: 8 },
  { name: "Local Filesystem", url: "http://localhost:3100", status: "disconnected", tools: 0 },
  { name: "GitHub Integration", url: "https://mcp.github.com", status: "connected", tools: 12 },
]

export default function MCP() {
  return (
    <AnimatedPage className="p-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-surface-50">MCP Servers</h1>
        <p className="text-xs text-surface-500 mt-1">Model Context Protocol — tool interoperability layer</p>
      </div>

      <div className="space-y-3">
        {servers.map((srv) => (
          <div key={srv.name} className="glass rounded-2xl p-5 card-hover">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full ${srv.status === "connected" ? "bg-emerald-400" : "bg-surface-600"}`} />
                <div>
                  <h3 className="font-medium text-surface-50 text-sm">{srv.name}</h3>
                  <span className="text-[10px] text-surface-500 font-mono">{srv.url}</span>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-[10px] uppercase tracking-wider ${srv.status === "connected" ? "text-emerald-400" : "text-surface-600"}`}>
                  {srv.status}
                </span>
                {srv.tools > 0 && (
                  <div className="text-[10px] text-surface-500 mt-0.5">{srv.tools} tools</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </AnimatedPage>
  )
}

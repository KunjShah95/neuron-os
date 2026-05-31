import AnimatedPage from "../components/AnimatedPage"

const configs = [
  { key: "AEGIS_DEFAULT_PROVIDER", value: "anthropic", scope: "global", masked: false },
  { key: "ANTHROPIC_API_KEY", value: "sk-ant-**************abcd", scope: "global", masked: true },
  { key: "OPENAI_API_KEY", value: "sk-**************efgh", scope: "global", masked: true },
  { key: "AEGIS_LOG_LEVEL", value: "info", scope: "global", masked: false },
  { key: "AEGIS_MAX_TURNS", value: "20", scope: "global", masked: false },
]

export default function Config() {
  return (
    <AnimatedPage className="p-8">
      <div className="mb-8">
        <h1 className="font-display text-2xl text-surface-50">Credentials</h1>
        <p className="text-xs text-surface-500 mt-1">Stored API keys and configuration values</p>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[1fr_2fr_auto] gap-4 px-6 py-3 text-[10px] text-surface-500 uppercase tracking-wider border-b border-surface-700/30">
          <span>Key</span>
          <span>Value</span>
          <span>Scope</span>
        </div>
        {configs.map((c) => (
          <div
            key={c.key}
            className="grid grid-cols-[1fr_2fr_auto] gap-4 px-6 py-3.5 text-sm border-b border-surface-700/20 last:border-0 hover:bg-surface-800/30 transition-colors"
          >
            <span className="text-surface-100 font-mono text-xs">{c.key}</span>
            <span className={`font-mono text-xs ${c.masked ? "text-surface-500" : "text-surface-300"}`}>
              {c.value}
            </span>
            <span className="text-[10px] text-surface-500 uppercase tracking-wider self-center">{c.scope}</span>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-surface-600 mt-4">
        Use CLI: <span className="font-mono text-surface-500">aegis config set &lt;key&gt; &lt;value&gt;</span>
      </p>
    </AnimatedPage>
  )
}

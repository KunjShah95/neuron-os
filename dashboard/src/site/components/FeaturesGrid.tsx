import ScrollReveal from "./ScrollReveal"

const features = [
  {
    title: "Session Replay & Audit",
    desc: "Record every tool call, every decision, every LLM token. Replay full sessions with timelines, annotations, and provenance.",
    icon: "▶",
    span: "md:col-span-2",
    detail: (
      <div className="mt-4 flex gap-2 items-center">
        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full w-3/4 rounded-full bg-white/20" />
        </div>
        <span className="text-[10px] text-white/30 font-mono tracking-wider">12:34 / 16:18</span>
      </div>
    ),
  },
  {
    title: "14 Agent Types",
    desc: "Build, plan, read, write, test, validate, review, debug, document, refactor, deploy, monitor, explore, and reflect.",
    icon: "◈",
    span: "",
    detail: (
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {["B", "P", "R", "W", "T", "V", "Re", "D", "Do", "Rf", "Dp", "M", "E", "→"].map((a, i) => (
          <div
            key={i}
            className="h-6 rounded bg-white/[0.04] flex items-center justify-center text-[9px] text-white/30 font-mono border border-white/[0.04]"
          >
            {a}
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Vector Memory",
    desc: "Semantic search across conversations, code, and facts. TF-IDF indexing, user profiles, infinite-horizon context.",
    icon: "◇",
    span: "",
    detail: (
      <div className="mt-4 space-y-1.5">
        {["query: deployment config", "result: 3 matches (0.94 sim)", "source: session#47a2"].map((line, i) => (
          <div
            key={i}
            className="text-[10px] font-mono text-white/35 px-2.5 py-1.5 bg-white/[0.02] rounded border border-white/[0.04]"
          >
            {line}
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Multi-Provider AI",
    desc: "Stream from Anthropic, OpenAI, DeepSeek, Ollama, or any custom endpoint. Switch providers at runtime without restart.",
    icon: "✦",
    span: "",
    detail: (
      <div className="mt-4 flex gap-2 flex-wrap">
        {["Anthropic", "OpenAI", "DeepSeek", "Ollama", "Custom"].map((p) => (
          <span
            key={p}
            className="text-[10px] px-2.5 py-1 rounded-full border border-white/[0.06] text-white/40 bg-white/[0.02] font-mono"
          >
            {p}
          </span>
        ))}
      </div>
    ),
  },
  {
    title: "Extensible Skills",
    desc: "Plugin-first architecture with local registry and skills.sh API. Drop in connectors, tools, custom toolchains.",
    icon: "⚡",
    span: "",
    detail: (
      <div className="mt-4 flex items-center gap-2">
        <div className="flex-1 h-8 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center px-3">
          <span className="text-[10px] text-white/25 font-mono">$ aegis skills install ...</span>
        </div>
      </div>
    ),
  },
  {
    title: "MCP Native",
    desc: "Model Context Protocol client and server. Connect Claude Code, Cursor, VS Code, and any compliant runtime.",
    icon: "⊞",
    span: "md:col-span-2",
    detail: (
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        {["IDE", "MCP", "Neuron OS"].map((node, i) => (
          <div key={node} className="flex items-center gap-3">
            <div className="px-3 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] text-[10px] text-white/40 tracking-wider uppercase font-mono">
              {node}
            </div>
            {i < 2 && (
              <div className="flex items-center gap-0.5">
                <div className="w-4 h-px bg-white/10" />
                <div className="w-1.5 h-1.5 rounded-full bg-white/30" />
                <div className="w-4 h-px bg-white/10" />
              </div>
            )}
          </div>
        ))}
      </div>
    ),
  },
]

export default function FeaturesGrid() {
  return (
    <section id="features" className="relative py-28 md:py-36 hairline-t bg-black">
      <div className="max-w-6xl mx-auto px-6">
        <ScrollReveal>
          <span className="section-label">01 / Capabilities</span>
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-white mt-3 tracking-tight">
            Everything you need to orchestrate
          </h2>
          <p className="text-ink-300 mt-3 max-w-xl text-[15px] leading-relaxed">
            From session replay to multi-provider AI, Neuron OS gives you the complete toolkit for autonomous agent development.
          </p>
        </ScrollReveal>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4">
          {features.map((f, i) => (
            <ScrollReveal
              key={f.title}
              variant="fade-up"
              delay={i * 0.08}
              className={f.span}
            >
              <div className="liquid-glass rounded-2xl p-6 h-full group transition-all duration-300 hover:bg-white/[0.02]">
                <div className="flex items-start justify-between">
                  <span className="text-xl text-white/70">{f.icon}</span>
                  <span className="text-[10px] text-white/20 font-mono">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="font-heading font-semibold text-white/90 text-lg mt-4">
                  {f.title}
                </h3>
                <p className="text-ink-300 text-sm mt-2 leading-relaxed">
                  {f.desc}
                </p>
                {f.detail}
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

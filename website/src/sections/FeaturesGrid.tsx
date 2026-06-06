import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"
import SectionHeader from "../components/SectionHeader"
import GlassCard from "../components/GlassCard"

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
    <section id="features" className="relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32">
      <SectionHeader
        eyebrow="— FEATURES"
        tone="cyan"
        title="Everything you need. Nothing you don't."
        body="From session replay to multi-provider AI, Neuron OS gives you the complete toolkit for autonomous agent development."
      />

      <motion.div
        variants={stagger(0.08)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {features.map((f, i) => (
          <motion.div key={f.title} variants={fadeUp} className={f.span}>
            <GlassCard interactive className="p-7 h-full">
              <div
                className="w-12 h-12 rounded-xl mb-5 flex items-center justify-center text-xl"
                style={{ background: "linear-gradient(135deg, #8b5cf6, #ec4899, #06b6d4)", opacity: 0.9 }}
              >
                {f.icon}
              </div>
              <span className="text-[10px] text-white/20 font-mono">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="font-heading font-semibold text-white/90 text-lg mt-4">
                {f.title}
              </h3>
              <p className="text-ink-300 text-sm mt-2 leading-relaxed">
                {f.desc}
              </p>
              {f.detail}
            </GlassCard>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

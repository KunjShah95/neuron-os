import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"

const features = [
  {
    title: "Session Replay",
    desc: "Every tool call, every token, every decision. Scrub the timeline, share a URL, find the hallucination in four seconds.",
    icon: "▶",
    span: "md:col-span-2",
  },
  {
    title: "14 Agent Types",
    desc: "Build, plan, test, review, reflect — each typed with scoped tools.",
    icon: "◈",
    span: "md:col-span-1",
  },
  {
    title: "Bring Your Own Model",
    desc: "Anthropic, OpenAI, DeepSeek, Ollama, OpenRouter. Swap at runtime without rewriting a line.",
    icon: "✦",
    span: "md:col-span-1",
  },
  {
    title: "Vector Memory",
    desc: "Semantic search across your sessions, code, and facts. 95.2% R@5 on the 60k benchmark.",
    icon: "◇",
    span: "md:col-span-1",
  },
  {
    title: "MCP Native",
    desc: "Drop-in Model Context Protocol. Plug into Claude Code, Cursor, VS Code, Zed, or your own editor. No glue code.",
    icon: "⊞",
    span: "md:col-span-2",
  },
  {
    title: "Local-First Vault",
    desc: "Your data stays on your machine. Encrypted with your key. Zero telemetry. rsync-friendly.",
    icon: "◆",
    span: "md:col-span-1",
  },
]

export default function FeaturesBento() {
  return (
    <section id="features" className="relative w-full py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="section-label mb-3 inline-block">FEATURES</span>
          <h2
            className="text-3xl md:text-5xl font-medium tracking-tight text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            Everything you need.{" "}
            <span className="serif-italic font-normal text-neutral-400">Nothing you don't.</span>
          </h2>
        </div>

        <motion.div
          variants={stagger(0.06)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {features.map((f) => (
            <motion.div
              key={f.title}
              variants={fadeUp}
              className={`${f.span} bento-card border-beam p-6 md:p-8 min-h-[200px] flex flex-col justify-between group cursor-default`}
            >
              <div className="flex items-start justify-between">
                <span className="text-2xl text-neutral-400 group-hover:text-white transition-colors">
                  {f.icon}
                </span>
              </div>
              <div>
                <h3 className="text-white font-medium text-lg mb-2 tracking-tight">
                  {f.title}
                </h3>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

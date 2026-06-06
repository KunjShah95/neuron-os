import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"
import SectionHeader from "../components/SectionHeader"

type Tag = "FEATURE" | "FIX" | "BREAKING" | "PERF"

interface ChangelogEntry {
  date: string
  version: string
  title: string
  description: string
  changes: { tag: Tag; text: string }[]
}

const entries: ChangelogEntry[] = [
  {
    date: "JUN 02, 2026",
    version: "v0.1.4",
    title: "Reflection loop + 2 new agent types",
    description: "Agents can now critique their own output and feed the feedback back into the planner. Added `reviewer` and `document` to the agent type registry.",
    changes: [
      { tag: "FEATURE", text: "Reflection loop with structured critique schema" },
      { tag: "FEATURE", text: "Two new agent types: reviewer, document" },
      { tag: "FEATURE", text: "Public changelog command (aegis changelog)" },
      { tag: "PERF", text: "40% faster plan agent DAG construction" },
    ],
  },
  {
    date: "MAY 21, 2026",
    version: "v0.1.2",
    title: "Session replay with annotations",
    description: "Replay any session with full timeline, token-level cost tracking, and inline annotations. Shareable URLs included.",
    changes: [
      { tag: "FEATURE", text: "Annotated session replay" },
      { tag: "FEATURE", text: "Shareable replay URLs" },
      { tag: "FEATURE", text: "Per-token cost attribution" },
      { tag: "FIX", text: "Race condition in audit log writer" },
    ],
  },
  {
    date: "MAY 07, 2026",
    version: "v0.1.0",
    title: "Initial public release",
    description: "The first cut of Neuron OS. 14 agent types, 12 TUI modes, vector memory, multi-provider streaming, and the audit log.",
    changes: [
      { tag: "FEATURE", text: "14 typed agent types" },
      { tag: "FEATURE", text: "12 TUI modes + command palette" },
      { tag: "FEATURE", text: "Vector memory with TF-IDF + semantic" },
      { tag: "FEATURE", text: "Multi-provider streaming (Anthropic, OpenAI, DeepSeek, Ollama, custom)" },
      { tag: "FEATURE", text: "Encrypted local vault" },
      { tag: "BREAKING", text: "Replaces wanderful-os: not backwards compatible" },
    ],
  },
]

const tagStyles: Record<Tag, { color: string; bg: string }> = {
  FEATURE: { color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  FIX: { color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  BREAKING: { color: "#ec4899", bg: "rgba(236,72,153,0.12)" },
  PERF: { color: "#06b6d4", bg: "rgba(6,182,212,0.12)" },
}

export default function ChangelogSection() {
  return (
    <section id="changelog" className="relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32">
      <SectionHeader
        eyebrow="— CHANGELOG"
        tone="cyan"
        title="Shipping every week."
        body="Public changelog with feature notes, migration guides, and breaking changes. Every release is signed and reproducible."
      />

      <motion.div
        className="mt-14 flex flex-col gap-4"
        variants={stagger(0.1)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.15 }}
      >
        {entries.map((entry) => (
          <motion.div
            key={entry.version}
            variants={fadeUp}
            className="glass-card p-6 md:p-8"
            style={{ borderRadius: 16 }}
          >
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <span
                className="font-mono"
                style={{ fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)" }}
              >
                {entry.date}
              </span>
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  padding: "2px 8px",
                  border: "1px solid rgba(139,92,246,0.3)",
                  background: "rgba(139,92,246,0.08)",
                  color: "#a78bfa",
                  borderRadius: 999,
                  letterSpacing: "0.05em",
                }}
              >
                {entry.version}
              </span>
            </div>

            <h3
              className="serif-italic text-white"
              style={{ fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.02em" }}
            >
              {entry.title}
            </h3>

            <p className="text-ink-300 mt-3" style={{ fontSize: 14, lineHeight: 1.6, maxWidth: 720 }}>
              {entry.description}
            </p>

            <ul className="mt-5 flex flex-col gap-2">
              {entry.changes.map((change, i) => {
                const style = tagStyles[change.tag]
                return (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      className="font-mono mt-1.5"
                      style={{
                        fontSize: 9,
                        letterSpacing: "0.12em",
                        color: style.color,
                        background: style.bg,
                        padding: "2px 7px",
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    >
                      {change.tag}
                    </span>
                    <span className="text-ink-200" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                      {change.text}
                    </span>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        ))}
      </motion.div>

      <div className="mt-10 text-center">
        <a
          href="#"
          className="btn-landing-outline inline-flex items-center gap-2"
        >
          <span>View all releases</span>
          <span className="font-mono text-ink-400">↗</span>
        </a>
      </div>
    </section>
  )
}

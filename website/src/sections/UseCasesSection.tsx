import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"
import SectionHeader from "../components/SectionHeader"
import GlassCard from "../components/GlassCard"

interface UseCase {
  icon: string
  gradientFrom: string
  gradientTo: string
  persona: string
  tagline: string
  description: string
  bullets: string[]
}

const cases: UseCase[] = [
  {
    icon: "⚡",
    gradientFrom: "#8b5cf6",
    gradientTo: "#ec4899",
    persona: "FOR INDIE DEVS",
    tagline: "Side projects that actually ship.",
    description: "Spin up a coding agent in 30 seconds. No infrastructure, no config — just a typed agent loop and a local audit log.",
    bullets: [
      "Local-first, zero signup",
      "Auto-save sessions to your repo",
      "Switch models per task (free, fast, smart)",
    ],
  },
  {
    icon: "◇",
    gradientFrom: "#06b6d4",
    gradientTo: "#8b5cf6",
    persona: "FOR TEAMS",
    tagline: "Agents your CTO can audit.",
    description: "Every tool call, every decision, every token logged. SOC-2 friendly audit trail. Role-based access via the local vault.",
    bullets: [
      "SQLite-backed audit log per workspace",
      "Role-based access (read/write/scope)",
      "Replay any session with annotations",
    ],
  },
  {
    icon: "◈",
    gradientFrom: "#fbbf24",
    gradientTo: "#ec4899",
    persona: "FOR RESEARCH",
    tagline: "Reproducible by default.",
    description: "Pin a model, a temperature, a tool set, a prompt — replay the same run later with byte-identical results. Benchmark with confidence.",
    bullets: [
      "Deterministic session recording",
      "95.2% R@5 on LongMemEval",
      "Export to JSONL / parquet / DuckDB",
    ],
  },
  {
    icon: "✦",
    gradientFrom: "#22c55e",
    gradientTo: "#06b6d4",
    persona: "FOR MCP BUILDERS",
    tagline: "Drop-in protocol support.",
    description: "Native MCP client and server. Connect Claude Code, Cursor, VS Code — and any compliant runtime. Ship tools once, use them everywhere.",
    bullets: [
      "Built-in MCP server",
      "First-class MCP client with auth",
      "Skills registry (local + skills.sh)",
    ],
  },
]

export default function UseCasesSection() {
  return (
    <section id="use-cases" className="relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32">
      <SectionHeader
        eyebrow="— USE CASES"
        tone="cyan"
        title="Built for builders."
        body="Whether you're shipping production agents or researching AI capabilities, Neuron OS fits the way you work."
      />

      <motion.div
        className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-5"
        variants={stagger(0.08)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        {cases.map((c) => (
          <motion.div key={c.persona} variants={fadeUp}>
            <GlassCard interactive className="p-7 h-full">
              <div className="flex items-start justify-between gap-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${c.gradientFrom}, ${c.gradientTo})`,
                    opacity: 0.9,
                    fontSize: 22,
                    color: "#fff",
                  }}
                >
                  {c.icon}
                </div>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 9,
                    letterSpacing: "0.2em",
                    color: "rgba(255,255,255,0.35)",
                  }}
                >
                  {c.persona}
                </span>
              </div>

              <h3
                className="serif-italic text-white mt-5"
                style={{ fontSize: 26, lineHeight: 1.1, letterSpacing: "-0.02em" }}
              >
                {c.tagline}
              </h3>

              <p className="text-ink-300 mt-3" style={{ fontSize: 14, lineHeight: 1.6 }}>
                {c.description}
              </p>

              <ul className="mt-5 flex flex-col gap-1.5">
                {c.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 inline-block w-1 h-1 rounded-full"
                      style={{ background: c.gradientFrom, flexShrink: 0 }}
                    />
                    <span className="text-ink-200" style={{ fontSize: 13, lineHeight: 1.55 }}>
                      {b}
                    </span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

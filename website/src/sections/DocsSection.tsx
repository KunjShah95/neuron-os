import { useState } from "react"
import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"
import SectionHeader from "../components/SectionHeader"
import GlassCard from "../components/GlassCard"

const navGroups = [
  {
    label: "GETTING STARTED",
    items: ["Installation", "Quickstart", "Your first agent", "Configuration"],
  },
  {
    label: "AGENTS",
    items: ["14 agent types", "Spawn & supervise", "Tool scoping", "Reflection loop"],
  },
  {
    label: "MEMORY & SESSIONS",
    items: ["Vector store", "Session replay", "Audit log", "Provenance"],
  },
  {
    label: "INTEGRATIONS",
    items: ["MCP server", "CLI reference", "Webhooks", "API"],
  },
]

const codeLines = [
  { tone: "comment" as const, text: "# Spawn a plan agent with reflection" },
  { tone: "default" as const, text: "aegis agent spawn plan \\" },
  { tone: "default" as const, text: "  --model claude-opus-4 \\" },
  { tone: "default" as const, text: "  --reflect \\" },
  { tone: "default" as const, text: "  --max-iterations 8" },
  { tone: "blank" as const, text: "" },
  { tone: "comment" as const, text: "# Stream output to a file" },
  { tone: "default" as const, text: "aegis agent run plan \\" },
  { tone: "default" as const, text: "  --goal 'refactor auth module' \\" },
  { tone: "default" as const, text: "  --stream ./out.jsonl" },
  { tone: "blank" as const, text: "" },
  { tone: "comment" as const, text: "# Inspect session after the run" },
  { tone: "default" as const, text: "aegis session replay --last 2>&1 | less" },
]

const tableRows = [
  { name: "spawn", type: "Command", desc: "Start a new agent in the current session" },
  { name: "run", type: "Command", desc: "Run an agent end-to-end with a goal" },
  { name: "session", type: "Group", desc: "Inspect, replay, and export sessions" },
  { name: "skills", type: "Group", desc: "Manage installed and local skills" },
  { name: "memory", type: "Group", desc: "Query and manage the vector store" },
]

const toneClass: Record<"comment" | "default" | "blank", string> = {
  comment: "text-ink-500",
  default: "text-white",
  blank: "",
}

export default function DocsSection() {
  const [activeNav, setActiveNav] = useState<string>("Quickstart")

  return (
    <section id="docs" className="relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32">
      <SectionHeader
        eyebrow="— DOCS"
        tone="cyan"
        title="Documentation that gets out of your way."
        body="A full reference, type-safe guides, and searchable API docs — generated from the same source your agents use."
      />

      <motion.div
        className="mt-14 grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6"
        variants={stagger(0.08)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
      >
        <motion.div variants={fadeUp}>
          <GlassCard className="p-5">
            <div
              className="flex items-center gap-2 px-3 py-2 mb-5 font-mono text-ink-400"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              <span style={{ color: "#8b5cf6" }}>⌕</span>
              <span>Search docs</span>
              <span
                className="ml-auto text-ink-500"
                style={{ fontSize: 10, border: "1px solid rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: 4 }}
              >
                ⌘K
              </span>
            </div>

            <nav className="flex flex-col gap-5">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <div
                    className="font-mono text-ink-500 mb-2"
                    style={{ fontSize: 10, letterSpacing: "0.18em" }}
                  >
                    {group.label}
                  </div>
                  <ul className="flex flex-col gap-1">
                    {group.items.map((item) => (
                      <li key={item}>
                        <button
                          onClick={() => setActiveNav(item)}
                          className="w-full text-left px-2 py-1.5 rounded-md transition-colors text-[13px]"
                          style={{
                            background: activeNav === item ? "rgba(139,92,246,0.12)" : "transparent",
                            color: activeNav === item ? "#fff" : "rgba(255,255,255,0.55)",
                            borderLeft: activeNav === item ? "2px solid #8b5cf6" : "2px solid transparent",
                            paddingLeft: 8,
                          }}
                        >
                          {item}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </GlassCard>
        </motion.div>

        <motion.div variants={fadeUp}>
          <GlassCard className="p-6 md:p-8" glow="purple">
            <div
              className="flex items-center gap-2 mb-2 font-mono text-ink-500"
              style={{ fontSize: 10, letterSpacing: "0.18em" }}
            >
              <span>DOCS / AGENTS /</span>
              <span className="text-ink-300">{activeNav}</span>
            </div>
            <h3 className="serif-italic text-white" style={{ fontSize: 32, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
              {activeNav}
            </h3>
            <p className="text-ink-300 mt-3" style={{ fontSize: 14, lineHeight: 1.6 }}>
              Each agent runs in its own sandbox with scoped tools, a typed tool registry, and an isolated
              audit log. Spawn one, supervise many, and reflect on the entire run.
            </p>

            <div
              className="mt-6 rounded-xl overflow-hidden"
              style={{ background: "rgba(0,0,0,0.5)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div
                className="px-4 py-2 font-mono text-ink-500"
                style={{ fontSize: 10, background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
              >
                $ shell · aegis-cli
              </div>
              <pre className="px-5 py-4 font-mono" style={{ fontSize: 12.5, lineHeight: 1.75, color: "#e5e5e5", overflowX: "auto" }}>
                {codeLines.map((line, i) => (
                  <div key={i} className={toneClass[line.tone]}>
                    {line.tone === "comment" ? line.text : line.text || "\u00A0"}
                  </div>
                ))}
              </pre>
            </div>

            <h4 className="text-white mt-8 mb-3" style={{ fontSize: 16, fontWeight: 500 }}>
              Reference
            </h4>
            <div className="overflow-hidden rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <table className="w-full text-left">
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <th className="px-4 py-2.5 font-mono text-ink-400" style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 500 }}>COMMAND</th>
                    <th className="px-4 py-2.5 font-mono text-ink-400" style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 500 }}>KIND</th>
                    <th className="px-4 py-2.5 font-mono text-ink-400" style={{ fontSize: 10, letterSpacing: "0.18em", fontWeight: 500 }}>DESCRIPTION</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, i) => (
                    <tr key={row.name} style={{ borderBottom: i < tableRows.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <td className="px-4 py-2.5 font-mono text-white" style={{ fontSize: 12.5 }}>{row.name}</td>
                      <td className="px-4 py-2.5 font-mono text-ink-300" style={{ fontSize: 12 }}>{row.type}</td>
                      <td className="px-4 py-2.5 text-ink-300" style={{ fontSize: 13 }}>{row.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex items-center gap-3 flex-wrap">
              <a
                href="#"
                className="btn-landing-gradient inline-flex items-center gap-2"
                style={{ padding: "8px 14px", fontSize: 12 }}
              >
                Read full guide →
              </a>
              <a
                href="https://github.com/KunjShah95/neuron-os"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-landing-outline inline-flex items-center gap-2"
                style={{ padding: "8px 14px", fontSize: 12 }}
              >
                View on GitHub ↗
              </a>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </section>
  )
}

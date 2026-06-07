import { motion } from "framer-motion"
import { fadeUp } from "../lib/motion"
import GlassCard from "../components/GlassCard"

interface ComparisonRow {
  feature: string
  neuron: string
  others: string
  highlight?: boolean
}

const competitors = ["LangChain", "AutoGPT", "CrewAI"]

const rows: ComparisonRow[] = [
  {
    feature: "Local-first architecture",
    neuron: "✅ All data stays on your machine",
    others: "❌ Cloud-dependent or hybrid",
    highlight: true,
  },
  {
    feature: "Single binary install",
    neuron: "✅ `npx neuron-aegis` or `curl | sh`",
    others: "❌ pip install + venv + deps",
    highlight: true,
  },
  {
    feature: "Agent types with scoped tools",
    neuron: "✅ 14 typed agent types with permissions",
    others: "⚠️ One-size-fits-all or manual tool config",
  },
  {
    feature: "Multi-provider routing",
    neuron: "✅ 13 providers, auto-selects cheapest",
    others: "❌ Single provider or manual switching",
  },
  {
    feature: "Knowledge graph",
    neuron: "✅ SQLite-backed entity-relationship store",
    others: "❌ None or external vector DB needed",
  },
  {
    feature: "Session replay",
    neuron: "✅ Full timeline scrub with provenance",
    others: "❌ Only raw logs",
  },
  {
    feature: "Credential vault",
    neuron: "✅ AES-256-GCM encrypted, key rotation",
    others: "❌ .env files or keychain only",
    highlight: true,
  },
  {
    feature: "RBAC",
    neuron: "✅ Admin/operator/developer/viewer roles",
    others: "❌ None",
  },
  {
    feature: "Docker sandbox",
    neuron: "✅ Cap-drop, seccomp, no-new-privs",
    others: "❌ No sandbox or basic only",
    highlight: true,
  },
  {
    feature: "Built-in audit logging",
    neuron: "✅ Append-only, structured JSON",
    others: "❌ None or third-party",
  },
  {
    feature: "MCP native",
    neuron: "✅ Client + server, drop-in protocol",
    others: "❌ Custom integrations only",
  },
  {
    feature: "Distributed runtime",
    neuron: "✅ Multi-host with encrypted transport",
    others: "❌ Single process only",
  },
  {
    feature: "Self-improving agents",
    neuron: "✅ Skill extraction, failure clustering, adversarial",
    others: "⚠️ Experimental or none",
    highlight: true,
  },
  {
    feature: "Plugin ecosystem",
    neuron: "✅ Local registry + marketplace (skills.sh)",
    others: "⚠️ Limited or community-only",
  },
  {
    feature: "Windows support",
    neuron: "✅ Native + Docker + WSL",
    others: "⚠️ Partial or Linux-only",
  },
]

export default function ComparisonSection() {
  return (
    <section id="comparison" className="relative w-full py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="section-label mb-3 inline-block">WHY NEURON OS</span>
          <h2
            className="text-3xl md:text-5xl font-medium tracking-tight text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            Built different.{" "}
            <span className="serif-italic font-normal text-neutral-400">Ship faster.</span>
          </h2>
          <p className="mt-4 text-neutral-400 max-w-2xl mx-auto">
            Neuron OS is the only local-first, TypeScript-native agent OS with built-in security,
            observability, and self-improvement. Compare for yourself:
          </p>
        </div>

        <motion.div
          variants={fadeUp}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
        >
          <GlassCard className="overflow-x-auto p-0" glow="purple">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="p-4 md:p-5 font-medium text-white/70 text-xs uppercase tracking-widest">
                    Feature
                  </th>
                  <th className="p-4 md:p-5 font-medium text-purple-400 text-xs uppercase tracking-widest">
                    Neuron OS
                  </th>
                  <th className="p-4 md:p-5 font-medium text-neutral-500 text-xs uppercase tracking-widest">
                    {competitors.join(" / ")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.feature}
                    className={`border-b border-white/[0.04] transition-colors ${
                      row.highlight
                        ? "bg-purple-500/[0.03] hover:bg-purple-500/[0.06]"
                        : "hover:bg-white/[0.02]"
                    }`}
                  >
                    <td className="p-4 md:p-5 text-white/80 font-medium min-w-[180px]">
                      {row.feature}
                    </td>
                    <td className="p-4 md:p-5 text-green-400/90 font-mono text-[13px]">
                      {row.neuron}
                    </td>
                    <td className="p-4 md:p-5 text-neutral-500 font-mono text-[13px]">
                      {row.others}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </motion.div>

        <div className="mt-8 text-center text-xs text-neutral-500 font-mono">
          * Comparisons based on publicly available information as of June 2026.
        </div>
      </div>
    </section>
  )
}

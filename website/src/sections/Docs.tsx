import { motion } from "framer-motion"
import { fadeUp, stagger } from "../lib/motion"
import { docs, recipeDocs } from "../content/docs"

const featured = [
  docs[0],
  docs[1],
  recipeDocs[3],
  recipeDocs[0],
]

const accentByCategory: Record<string, string> = {
  Guide: "text-blue-400",
  Reference: "text-emerald-400",
  Recipe: "text-amber-400",
  Concept: "text-purple-400",
}

const ringByCategory: Record<string, string> = {
  Guide: "group-hover:border-blue-500/40",
  Reference: "group-hover:border-emerald-500/40",
  Recipe: "group-hover:border-amber-500/40",
  Concept: "group-hover:border-purple-500/40",
}

export default function Docs() {
  return (
    <section id="docs" className="relative w-full py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16">
          <div className="text-center md:text-left">
            <span className="section-label mb-3 inline-block">DOCS</span>
            <h2
              className="text-3xl md:text-5xl font-medium tracking-tight text-white"
              style={{ letterSpacing: "-0.02em" }}
            >
              The manual.{" "}
              <span className="serif-italic font-normal text-neutral-400">Concise on purpose.</span>
            </h2>
            <p className="mt-4 text-neutral-500 text-sm max-w-md mx-auto md:mx-0">
              Install, configure, ship. No marketing, no "next steps" — just the
              things you actually do on day one.
            </p>
          </div>
          <a
            href="/docs"
            className="text-sm text-neutral-400 hover:text-white transition-colors font-mono inline-flex items-center gap-1.5 justify-center md:justify-start"
          >
            <span>All docs</span>
            <span>→</span>
          </a>
        </div>

        <motion.div
          variants={stagger(0.06)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {featured.map((d, i) => (
            <motion.a
              key={d.slug}
              href={d.href}
              variants={fadeUp}
              className={`bento-card border-beam group block p-6 md:p-8 hover:bg-white/[0.02] ${ringByCategory[d.category] ?? ""} ${
                i === 0 ? "md:col-span-2" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-5">
                <span
                  className={`font-mono text-[10px] tracking-widest ${
                    accentByCategory[d.category] ?? "text-neutral-400"
                  }`}
                >
                  {d.category.toUpperCase()}
                </span>
                <span className="font-mono text-[10px] text-neutral-600">
                  {d.readTime}
                </span>
              </div>

              <h3
                className={`font-medium text-white tracking-tight leading-tight mb-3 group-hover:text-blue-400 transition-colors ${
                  i === 0 ? "text-2xl md:text-3xl" : "text-lg md:text-xl"
                }`}
              >
                {d.title}
              </h3>

              <p
                className={`text-neutral-400 leading-relaxed ${
                  i === 0 ? "text-[15px] max-w-2xl" : "text-sm"
                }`}
              >
                {d.description}
              </p>

              <div className="mt-6 flex items-center gap-2 font-mono text-xs text-neutral-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all">
                <span>read the doc</span>
                <span>→</span>
              </div>
            </motion.a>
          ))}
        </motion.div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-neutral-500 font-mono">
          <a href="/docs/getting-started" className="hover:text-white transition-colors">
            /getting-started
          </a>
          <span className="text-neutral-800">·</span>
          <a href="/docs/api-reference" className="hover:text-white transition-colors">
            /api-reference
          </a>
          <span className="text-neutral-800">·</span>
          <a href="/docs/recipes/spawn-an-agent" className="hover:text-white transition-colors">
            /recipes/spawn
          </a>
          <span className="text-neutral-800">·</span>
          <a href="/docs/recipes/reusable-memory" className="hover:text-white transition-colors">
            /recipes/memory
          </a>
          <span className="text-neutral-800">·</span>
          <a href="/docs/recipes/custom-tool" className="hover:text-white transition-colors">
            /recipes/custom-tool
          </a>
        </div>
      </div>
    </section>
  )
}

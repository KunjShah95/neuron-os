import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { docs, recipeDocs } from "../content/docs"
import { fadeUp, stagger } from "../lib/motion"

export default function DocsIndex() {
  return (
    <div className="max-w-5xl mx-auto px-6">
      <div className="text-center mb-16">
        <span className="section-label mb-3 inline-block">DOCS</span>
        <h1
          className="text-4xl md:text-6xl font-medium tracking-tight text-white"
          style={{ letterSpacing: "-0.03em" }}
        >
          The manual.{" "}
          <span className="serif-italic font-normal text-neutral-400">Concise on purpose.</span>
        </h1>
        <p className="mt-6 text-neutral-400 max-w-xl mx-auto">
          Everything you need to install, configure, and ship. No marketing.
          No "next steps." Just the things you actually do.
        </p>
      </div>

      <div className="mb-16">
        <div className="text-xs font-mono text-neutral-500 mb-4 tracking-widest">
          GUIDES
        </div>
        <motion.div
          variants={stagger(0.06)}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {docs.map((d) => (
            <motion.div key={d.slug} variants={fadeUp}>
              <Link
                to={`/docs/${d.slug}`}
                className="bento-card border-beam group block p-6 md:p-8 h-full hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono text-[10px] tracking-widest text-blue-400">
                    {d.category.toUpperCase()}
                  </span>
                  <span className="text-neutral-700">·</span>
                  <span className="font-mono text-[10px] text-neutral-500">{d.readTime}</span>
                </div>
                <h2 className="text-xl font-medium text-white tracking-tight mb-2 group-hover:text-blue-400 transition-colors">
                  {d.title}
                </h2>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  {d.description}
                </p>
                <div className="mt-4 font-mono text-xs text-neutral-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all">
                  read →
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>

      <div>
        <div className="text-xs font-mono text-neutral-500 mb-4 tracking-widest">
          RECIPES
        </div>
        <motion.div
          variants={stagger(0.06)}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          {recipeDocs.map((r) => (
            <motion.div key={r.slug} variants={fadeUp}>
              <Link
                to={`/docs/recipes/${r.slug}`}
                className="bento-card border-beam group block p-6 md:p-8 h-full hover:bg-white/[0.02]"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="font-mono text-[10px] tracking-widest text-amber-400">
                    {r.category.toUpperCase()}
                  </span>
                  <span className="text-neutral-700">·</span>
                  <span className="font-mono text-[10px] text-neutral-500">{r.readTime}</span>
                </div>
                <h2 className="text-xl font-medium text-white tracking-tight mb-2 group-hover:text-amber-400 transition-colors">
                  {r.title}
                </h2>
                <p className="text-sm text-neutral-400 leading-relaxed">
                  {r.description}
                </p>
                <div className="mt-4 font-mono text-xs text-neutral-500 group-hover:text-amber-400 group-hover:translate-x-1 transition-all">
                  read →
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

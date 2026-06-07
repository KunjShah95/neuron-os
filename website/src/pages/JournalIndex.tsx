import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { posts } from "../content/posts"
import { fadeUp, stagger } from "../lib/motion"

export default function JournalIndex() {
  return (
    <div className="max-w-4xl mx-auto px-6">
      <div className="text-center mb-16">
        <span className="section-label mb-3 inline-block">JOURNAL</span>
        <h1
          className="text-4xl md:text-6xl font-medium tracking-tight text-white"
          style={{ letterSpacing: "-0.03em" }}
        >
          Field notes from{" "}
          <span className="serif-italic font-normal text-neutral-400">the build.</span>
        </h1>
        <p className="mt-6 text-neutral-400 max-w-xl mx-auto">
          What we learned building Neuron OS. The good, the bad, and the
          thing we got wrong that one time at 2:47pm.
        </p>
      </div>

      <motion.div
        variants={stagger(0.08)}
        initial="hidden"
        animate="show"
        className="space-y-4"
      >
        {posts.map((p) => (
          <motion.article key={p.slug} variants={fadeUp}>
            <Link
              to={`/journal/${p.slug}`}
              className="bento-card border-beam group block p-8 md:p-10 hover:bg-white/[0.02]"
            >
              <div className="flex items-center gap-3 mb-4">
                <span className="font-mono text-[10px] tracking-widest text-blue-400">
                  ENTRY {p.number}
                </span>
                <span className="text-neutral-700">·</span>
                <span className="font-mono text-[10px] text-neutral-500">{p.date}</span>
                <span className="text-neutral-700">·</span>
                <span className="font-mono text-[10px] text-neutral-500">{p.readTime}</span>
              </div>

              <h2
                className="text-2xl md:text-3xl font-medium text-white tracking-tight leading-tight mb-4 group-hover:text-blue-400 transition-colors"
                style={{ letterSpacing: "-0.02em" }}
              >
                {p.title}
              </h2>

              <p className="text-neutral-400 leading-relaxed mb-6">
                {p.excerpt}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-full border border-white/[0.1] flex items-center justify-center font-mono text-[10px] text-neutral-400"
                    style={{
                      background: `linear-gradient(135deg, hsl(${
                        (parseInt(p.number) * 73) % 360
                      }, 30%, 18%), #0A0A0A)`,
                    }}
                  >
                    {p.author
                      .split(" ")
                      .map((s) => s[0])
                      .join("")}
                  </div>
                  <span className="text-xs text-neutral-400">{p.author}</span>
                </div>
                <span className="font-mono text-xs text-neutral-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all">
                  read →
                </span>
              </div>
            </Link>
          </motion.article>
        ))}
      </motion.div>
    </div>
  )
}

import { motion } from "framer-motion"
import { fadeUp, stagger } from "../lib/motion"

interface Post {
  number: string
  title: string
  excerpt: string
  author: string
  date: string
  readTime: string
  href: string
  featured?: boolean
}

const posts: Post[] = [
  {
    number: "01",
    title: "I built four agent frameworks before I built this one.",
    excerpt:
      "Two of them used graphs. One used a YAML DSL. One used decorators. They all shared the same flaw: the harder your problem got, the further you drifted from the source of truth. Neuron OS starts from a different premise — agents are processes, not callbacks. Here's why that changes everything.",
    author: "Kunj Shah",
    date: "Nov 14, 2025",
    readTime: "9 min",
    href: "/journal/four-frameworks",
    featured: true,
  },
  {
    number: "02",
    title: "The audit log that saved our launch.",
    excerpt:
      "Three hours before a customer-facing demo, an agent started emitting answers we couldn't reproduce. A normal CI pipeline would have failed silently. The session replay tool let us scrub backwards, find the exact tool call, and pin it to a regression in a provider SDK. We shipped on time.",
    author: "Marcus Rivera",
    date: "Oct 28, 2025",
    readTime: "6 min",
    href: "/journal/audit-log",
  },
  {
    number: "03",
    title: "Local-first is not nostalgia. It's survival.",
    excerpt:
      "Every framework that ships a hosted cloud version starts to rot six months later — features go behind paywalls, breaking changes ship without warning, and your prompt-engineering work is locked to a vendor. We chose the opposite path. Everything runs on your laptop. Everything is MIT. The cloud will never be required.",
    author: "Priya Sharma",
    date: "Oct 09, 2025",
    readTime: "7 min",
    href: "/journal/local-first",
  },
]

export default function Journal() {
  return (
    <section id="journal" className="relative w-full py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-16">
          <div className="text-center md:text-left">
            <span className="section-label mb-3 inline-block">JOURNAL</span>
            <h2
              className="text-3xl md:text-5xl font-medium tracking-tight text-white"
              style={{ letterSpacing: "-0.02em" }}
            >
              Field notes from{" "}
              <span className="serif-italic font-normal text-neutral-400">the build.</span>
            </h2>
          </div>
          <a
            href="/journal"
            className="text-sm text-neutral-400 hover:text-white transition-colors font-mono inline-flex items-center gap-1.5 justify-center md:justify-start"
          >
            <span>All entries</span>
            <span>→</span>
          </a>
        </div>

        <motion.div
          variants={stagger(0.08)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {posts.map((p) => (
            <motion.a
              key={p.number}
              href={p.href}
              variants={fadeUp}
              className={`bento-card border-beam group flex flex-col p-6 md:p-8 hover:bg-white/[0.02] ${
                p.featured ? "md:col-span-2 md:row-span-1" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-[10px] tracking-widest text-blue-400">
                  ENTRY {p.number}
                </span>
                <span className="font-mono text-[10px] text-neutral-600">
                  {p.readTime}
                </span>
              </div>

              <h3
                className={`font-medium text-white tracking-tight leading-tight mb-3 ${
                  p.featured ? "text-2xl md:text-3xl" : "text-lg md:text-xl"
                }`}
              >
                {p.title}
              </h3>

              <p
                className={`text-neutral-400 leading-relaxed ${
                  p.featured ? "text-[15px]" : "text-sm"
                }`}
              >
                {p.excerpt}
              </p>

              <div className="mt-auto pt-6 flex items-center justify-between">
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
                  <div className="leading-tight">
                    <div className="text-xs text-white">{p.author}</div>
                    <div className="text-[10px] text-neutral-500 font-mono">{p.date}</div>
                  </div>
                </div>
                <span className="font-mono text-xs text-neutral-500 group-hover:text-blue-400 group-hover:translate-x-1 transition-all">
                  read →
                </span>
              </div>
            </motion.a>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"
import SectionHeader from "../components/SectionHeader"

const techs = [
  { name: "Bun", desc: "Runtime & bundler", color: "#fbf0df" },
  { name: "TypeScript", desc: "Type safety", color: "#9CA3AF" },
  { name: "React 19", desc: "UI framework", color: "#A1A1AA" },
  { name: "Framer Motion", desc: "Animations", color: "#D4D4D8" },
  { name: "Tailwind CSS", desc: "Styling", color: "#9CA3AF" },
  { name: "Commander", desc: "CLI framework", color: "#A1A1AA" },
  { name: "SQLite", desc: "Audit store", color: "#9CA3AF" },
  { name: "Vite", desc: "Build tool", color: "#A1A1AA" },
]

export default function TechStack() {
  return (
    <section
      id="stack"
      className="relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32"
    >
      <SectionHeader
        eyebrow="— TECH STACK"
        tone="cyan"
        title="Built on shoulders."
        body="Bun · TypeScript · React 19 · Vite · Framer Motion · Tailwind CSS"
      />

      <motion.div
        variants={stagger(0.06)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        {techs.map((t) => (
          <motion.div
            key={t.name}
            variants={fadeUp}
            className="glass-card glass-card-interactive aspect-square flex flex-col items-center justify-center text-center gap-2 p-6 group cursor-default hover:border-white/30"
          >
            <div
              className="w-2 h-2 rounded-full transition-all duration-500 group-hover:shadow-[0_0_12px_currentColor]"
              style={{ backgroundColor: t.color, color: t.color }}
            />
            <span className="font-heading font-medium text-white/85 text-sm group-hover:text-white transition-colors">
              {t.name}
            </span>
            <p className="text-ink-400 text-xs">{t.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

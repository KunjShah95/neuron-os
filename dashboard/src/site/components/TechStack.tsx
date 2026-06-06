import ScrollReveal from "./ScrollReveal"

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
    <section id="stack" className="relative py-28 md:py-36 hairline-t bg-black">
      <div className="max-w-5xl mx-auto px-6">
        <ScrollReveal>
          <span className="section-label">05 / Built With</span>
          <h2 className="font-heading font-bold text-3xl md:text-4xl text-white mt-3 tracking-tight">
            Modern, fast, reliable
          </h2>
          <p className="text-ink-300 mt-3 max-w-xl text-[15px] leading-relaxed">
            Built on a modern stack optimized for developer experience and runtime performance.
          </p>
        </ScrollReveal>

        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-3">
          {techs.map((t, i) => (
            <ScrollReveal key={t.name} variant="fade-up" delay={i * 0.06}>
              <div className="liquid-glass rounded-xl p-5 group cursor-default">
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full transition-all duration-500 group-hover:shadow-[0_0_12px_currentColor]"
                    style={{ backgroundColor: t.color, color: t.color }}
                  />
                  <span className="font-heading font-medium text-white/85 text-sm group-hover:text-white transition-colors">
                    {t.name}
                  </span>
                </div>
                <p className="text-ink-400 text-xs mt-2">{t.desc}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  )
}

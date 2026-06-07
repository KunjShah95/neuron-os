import { motion } from "framer-motion"
import { useEffect, useRef, useState } from "react"
import { fadeUp, stagger } from "../lib/motion"

const stats = [
  { value: 14, suffix: "", label: "agent types", sub: "build, plan, test, review…" },
  { value: 12, suffix: "", label: "TUI modes", sub: "repl, replay, vault, trace…" },
  { value: 5, suffix: "+", label: "model providers", sub: "anythropic, openai, ollama…" },
  { value: 95, suffix: ".2%", label: "recall @ 5", sub: "on the 60k-fact benchmark" },
  { value: 100, suffix: "%", label: "self-hosted", sub: "your data, your machine" },
]

function useInView(ref: React.RefObject<Element | null>) {
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    if (!ref.current || seen) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true)
          obs.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [ref, seen])
  return seen
}

function Counter({ to, suffix, active }: { to: number; suffix: string; active: boolean }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!active) return
    const duration = 1200
    const start = performance.now()
    let raf: number
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setN(to * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, to])

  const display = to >= 100 ? Math.round(n) : n.toFixed(to % 1 === 0 && to < 100 ? 0 : 1)
  return <span>{display}{suffix}</span>
}

export default function StatsBar() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref)

  return (
    <section ref={ref} className="relative w-full py-16 md:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          variants={stagger(0.05)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-px bg-white/[0.04] rounded-2xl overflow-hidden border border-white/[0.06]"
        >
          {stats.map((s) => (
            <motion.div
              key={s.label}
              variants={fadeUp}
              className="bg-base p-6 md:p-8 flex flex-col items-start gap-2"
            >
              <div
                className="font-mono text-3xl md:text-4xl font-medium text-white tracking-tight"
                style={{ letterSpacing: "-0.04em" }}
              >
                <Counter to={s.value} suffix={s.suffix} active={inView} />
              </div>
              <div className="text-sm text-white font-medium">{s.label}</div>
              <div className="text-xs text-neutral-500 font-mono leading-relaxed">
                {s.sub}
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}

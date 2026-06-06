import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"
import SectionHeader from "../components/SectionHeader"
import MetricCard from "../components/MetricCard"

const metrics = [
  { value: 14, label: "Agent Types", suffix: "", desc: "Specialized roles for every task" },
  { value: 12, label: "TUI Modes", suffix: "", desc: "Full-featured terminal screens" },
  { value: 99, label: "Uptime Score", suffix: "%", desc: "Session resilience you can trust" },
]

export default function MetricsSection() {
  return (
    <section className="relative w-full max-w-6xl mx-auto px-6 py-24 md:py-32">
      <SectionHeader eyebrow="— METRICS" tone="cyan" title="Built for scale. Benchmarked." body="" />

      <motion.div
        variants={stagger(0.1)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5"
      >
        {metrics.map((m) => (
          <motion.div key={m.label} variants={fadeUp}>
            <MetricCard value={m.value} suffix={m.suffix} label={m.label.toUpperCase()} caption={m.desc} gradient />
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

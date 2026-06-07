import { motion } from "framer-motion"
import { fadeUp } from "../lib/motion"

const steps = [
  {
    title: "Define the goal",
    desc: "Write one sentence. The planner decomposes it into a typed DAG of sub-goals.",
  },
  {
    title: "Spawn agents",
    desc: "14 typed agent types compete for nodes. Each gets scoped tools and a checkpoint.",
  },
  {
    title: "Execute & record",
    desc: "Every tool call, every token, every decision is logged to the local audit trail.",
  },
  {
    title: "Reflect & ship",
    desc: "Agents self-critique. Patterns feed into memory. You replay, annotate, and ship.",
  },
]

export default function Timeline() {
  return (
    <section className="relative w-full py-24 md:py-32">
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-20">
          <span className="section-label mb-3 inline-block">HOW IT WORKS</span>
          <h2
            className="text-3xl md:text-5xl font-medium tracking-tight text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            From goal to shipped{" "}
            <span className="serif-italic font-normal text-neutral-400">in four steps.</span>
          </h2>
        </div>

        <div className="relative">
          <div
            className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px md:-translate-x-1/2"
            style={{
              background: "linear-gradient(180deg, transparent, rgba(255,255,255,0.1) 10%, rgba(255,255,255,0.1) 90%, transparent)",
            }}
          />

          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.5 }}
              className={`relative flex items-center gap-8 mb-16 last:mb-0 ${
                i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
              }`}
            >
              <div className="flex-1 md:px-8">
                <div
                  className={`p-6 rounded-2xl bento-card ${
                    i % 2 === 0 ? "md:text-left" : "md:text-right"
                  }`}
                >
                  <span className="text-xs font-mono text-neutral-500 mb-2 block">
                    STEP 0{i + 1}
                  </span>
                  <h3 className="text-xl font-medium text-white mb-2 tracking-tight">
                    {step.title}
                  </h3>
                  <p className="text-sm text-neutral-400 leading-relaxed">
                    {step.desc}
                  </p>
                </div>
              </div>

              <div className="absolute left-4 md:left-1/2 w-3 h-3 -translate-x-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgba(255,255,255,0.05),0_0_20px_rgba(59,130,246,0.5)]" />

              <div className="flex-1 hidden md:block" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

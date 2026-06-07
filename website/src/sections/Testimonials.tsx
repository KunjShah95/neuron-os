import { motion } from "framer-motion"
import { stagger, fadeUp } from "../lib/motion"

const testimonials = [
  {
    quote: "I was drowning in LangChain abstractions. Neuron OS gave me back the terminal.",
    name: "Sarah Chen",
    role: "Staff Engineer, AI Startup",
  },
  {
    quote: "We replayed a failed session in 4 seconds. Found the exact hallucinated tool call.",
    name: "Marcus Rivera",
    role: "ML Platform Lead, Fintech",
  },
  {
    quote: "Every other framework treats audit as an afterthought. Here it's a first-class citizen.",
    name: "Priya Sharma",
    role: "CTO, Healthcare AI",
  },
]

export default function Testimonials() {
  return (
    <section className="relative w-full py-24 md:py-32">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="section-label mb-3 inline-block">VOICES</span>
          <h2
            className="text-3xl md:text-5xl font-medium tracking-tight text-white"
            style={{ letterSpacing: "-0.02em" }}
          >
            Builders trust{" "}
            <span className="serif-italic font-normal text-neutral-400">builders.</span>
          </h2>
        </div>

        <motion.div
          variants={stagger(0.1)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          {testimonials.map((t) => (
            <motion.div
              key={t.name}
              variants={fadeUp}
              className="bento-card border-beam p-6 md:p-8"
            >
              <p className="text-base text-neutral-300 leading-relaxed mb-6">
                "{t.quote}"
              </p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-700 to-neutral-800 border border-neutral-700" />
                <div>
                  <div className="text-sm text-white font-medium">{t.name}</div>
                  <div className="text-xs text-neutral-500">{t.role}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
